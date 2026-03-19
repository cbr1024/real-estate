"""
대법원 경매정보 크롤러
- Playwright 1회 → 세션 쿠키/헤더 획득
- requests HTTP 직접 호출 → JSON 파싱
- 서울 5개 법원 아파트 전체 수집
- 3단계 정합성 검증
"""
import asyncio
import json
import copy
import time
import logging
import requests
import psycopg2
import psycopg2.extras
from datetime import datetime, date
from typing import Optional

logger = logging.getLogger("auction_crawler")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s %(message)s", "%H:%M:%S"))
    logger.addHandler(handler)

SEARCH_URL = "https://www.courtauction.go.kr/pgj/pgjsearch/searchControllerMain.on"
ENTRY_URL = "https://www.courtauction.go.kr/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ151F00.xml"

SEOUL_COURTS = [
    {"code": "B000210", "name": "서울중앙지방법원"},
    {"code": "B000211", "name": "서울동부지방법원"},
    {"code": "B000215", "name": "서울서부지방법원"},
    {"code": "B000212", "name": "서울남부지방법원"},
    {"code": "B000213", "name": "서울북부지방법원"},
]

PAGE_SIZE = 50
MAX_PAGES_PER_COURT = 50  # 안전장치: 법원당 최대 50페이지 (2500건)


# ==============================================
# Stage 0: 세션 획득
# ==============================================
async def acquire_session():
    """Playwright 1회 실행으로 세션 쿠키 + 요청 템플릿 획득"""
    from playwright.async_api import async_playwright

    logger.info("세션 획득 시작 (Playwright)...")
    session = {"cookies": None, "headers": None, "body_template": None}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="ko-KR"
        )
        page = await context.new_page()
        page.set_default_timeout(30000)

        captured = {}

        async def on_req(request):
            if 'searchControllerMain.on' in request.url:
                captured["headers"] = dict(request.headers)
                captured["body"] = request.post_data

        page.on("request", on_req)

        await page.goto(ENTRY_URL, wait_until="networkidle", timeout=40000)
        await asyncio.sleep(7)

        # 아무 법원이나 선택 후 검색 → 요청 템플릿 캡처
        selects = await page.query_selector_all("select")
        for sel in selects:
            for i, opt in enumerate(await sel.query_selector_all("option")):
                t = (await opt.text_content() or "").strip()
                if '서울중앙' in t:
                    await sel.select_option(index=i)
                    break

        btn = await page.query_selector("input[type='button'][value*='검색']")
        if btn:
            await btn.click()
        await asyncio.sleep(5)

        session["cookies"] = {c["name"]: c["value"] for c in await context.cookies()}
        await browser.close()

    if captured.get("headers") and captured.get("body"):
        session["headers"] = {
            k: v for k, v in captured["headers"].items()
            if k.lower() not in ['host', 'content-length', 'connection', 'cookie']
        }
        session["body_template"] = json.loads(captured["body"])
        logger.info(f"세션 획득 완료: 쿠키 {len(session['cookies'])}개, 헤더 {len(session['headers'])}개")
    else:
        raise RuntimeError("세션 획득 실패: 검색 요청을 캡처하지 못함")

    return session


# ==============================================
# Stage 1: 데이터 수집
# ==============================================
def fetch_court_data(session, court_code, court_name):
    """한 법원의 전체 아파트 경매 데이터 수집"""
    all_items = []
    total_count = 0

    for page_no in range(1, MAX_PAGES_PER_COURT + 1):
        body = copy.deepcopy(session["body_template"])
        body["dma_pageInfo"]["pageNo"] = page_no
        body["dma_pageInfo"]["pageSize"] = PAGE_SIZE
        body["dma_pageInfo"]["startRowNo"] = (page_no - 1) * PAGE_SIZE + 1
        body["dma_pageInfo"]["totalYn"] = "Y" if page_no == 1 else "N"
        if page_no > 1:
            body["dma_pageInfo"]["totalCnt"] = str(total_count)

        # 법원 코드 설정
        body["dma_srchGdsDtlSrchInfo"]["cortOfcCd"] = court_code

        try:
            resp = requests.post(
                SEARCH_URL,
                data=json.dumps(body),
                headers=session["headers"],
                cookies=session["cookies"],
                timeout=15,
            )

            if resp.status_code != 200:
                logger.warning(f"{court_name} page {page_no}: HTTP {resp.status_code}")
                break

            data = resp.json()
            if data.get("status") != 200:
                logger.warning(f"{court_name} page {page_no}: API status {data.get('status')}")
                break

            page_info = data.get("data", {}).get("dma_pageInfo", {})
            items = data.get("data", {}).get("dlt_srchResult", [])

            if page_no == 1:
                total_count = int(page_info.get("totalCnt", 0))
                logger.info(f"{court_name}: 총 {total_count}건 발견")

            if not items:
                break

            all_items.extend(items)

            # 마지막 페이지 확인
            if len(all_items) >= total_count or len(items) < PAGE_SIZE:
                break

        except requests.exceptions.Timeout:
            logger.warning(f"{court_name} page {page_no}: 타임아웃")
            break
        except Exception as e:
            logger.error(f"{court_name} page {page_no}: {e}")
            break

        time.sleep(1)  # 서버 부하 방지

    logger.info(f"{court_name}: {len(all_items)}건 수집 완료")
    return all_items, total_count


# ==============================================
# Stage 2: 데이터 정합성 검증
# ==============================================
def validate_item(item: dict) -> tuple[bool, list[str]]:
    """개별 물건 데이터 정합성 검증. (통과여부, 에러목록) 반환"""
    errors = []

    # 사건번호 형식
    case_no = item.get("srnSaNo", "")
    if not case_no or "타경" not in case_no:
        errors.append(f"사건번호 형식 이상: '{case_no}'")

    # 감정가
    try:
        gv = int(item.get("gamevalAmt", 0) or 0)
        if gv <= 0:
            errors.append(f"감정가 0 이하: {gv}")
    except (ValueError, TypeError):
        errors.append(f"감정가 숫자 변환 실패: {item.get('gamevalAmt')}")
        gv = 0

    # 최저가
    try:
        mp = int(item.get("minmaePrice", 0) or 0)
    except (ValueError, TypeError):
        errors.append(f"최저가 숫자 변환 실패: {item.get('minmaePrice')}")
        mp = 0

    # 최저가 <= 감정가
    if gv > 0 and mp > 0 and mp > gv:
        errors.append(f"최저가({mp}) > 감정가({gv})")

    # 날짜
    dt_str = str(item.get("maeGiil", "") or "")
    if dt_str and len(dt_str) == 8:
        try:
            datetime.strptime(dt_str, "%Y%m%d")
        except ValueError:
            errors.append(f"매각기일 파싱 실패: {dt_str}")

    # 주소
    addr = item.get("printSt", "") or item.get("bgPlaceRdAllAddr", "")
    if not addr:
        errors.append("주소 없음")

    is_valid = len(errors) == 0
    return is_valid, errors


def validate_batch(items: list, prev_count: int = 0) -> dict:
    """배치 전체 검증"""
    report = {
        "total": len(items),
        "valid": 0,
        "invalid": 0,
        "errors": [],
        "valid_items": [],
        "anomaly": False,
    }

    for item in items:
        is_valid, errors = validate_item(item)
        if is_valid:
            report["valid"] += 1
            report["valid_items"].append(item)
        else:
            report["invalid"] += 1
            report["errors"].append({
                "case": item.get("srnSaNo", "?"),
                "errors": errors,
            })

    # 건수 급감 체크
    if prev_count > 0 and report["valid"] < prev_count * 0.5:
        report["anomaly"] = True
        logger.warning(f"건수 급감: 이전 {prev_count}건 → 현재 {report['valid']}건")

    # 파싱 실패율
    if report["total"] > 0:
        fail_rate = report["invalid"] / report["total"] * 100
        if fail_rate > 20:
            report["anomaly"] = True
            logger.warning(f"파싱 실패율 {fail_rate:.1f}% — 사이트 구조 변경 가능성")

    return report


# ==============================================
# Stage 3: DB 저장
# ==============================================
def parse_item_for_db(item: dict) -> dict:
    """API 응답 → DB 저장용 dict 변환"""
    case_number = item.get("srnSaNo", "")
    # 물건번호 포함한 고유키
    maemul_ser = item.get("maemulSer", "1")
    unique_key = f"{case_number}_{maemul_ser}"

    # 면적: convAddr에서 추출
    area = None
    conv = item.get("convAddr", "") or ""
    import re
    area_match = re.search(r'([\d.]+)㎡', conv)
    if area_match:
        area = float(area_match.group(1))
    elif item.get("minArea"):
        area = float(item["minArea"])

    # 날짜
    auction_date = None
    dt_str = str(item.get("maeGiil", "") or "")
    if dt_str and len(dt_str) == 8:
        try:
            auction_date = datetime.strptime(dt_str, "%Y%m%d").date()
        except:
            pass

    # 상태 판단
    status = "scheduled"
    if auction_date and auction_date < date.today():
        status = "closed"

    return {
        "case_number": unique_key,
        "court_name": item.get("jiwonNm", ""),
        "address": item.get("printSt", "") or item.get("bgPlaceRdAllAddr", ""),
        "detail_address": item.get("buldList", ""),
        "building_name": item.get("buldNm", ""),
        "area": area,
        "floor": None,  # 별도 파싱 필요
        "appraisal_value": int(item.get("gamevalAmt", 0) or 0),
        "minimum_price": int(item.get("minmaePrice", 0) or 0),
        "auction_date": auction_date,
        "fail_count": int(item.get("yuchalCnt", 0) or 0),
        "status": status,
        "court_url": "https://www.courtauction.go.kr/pgj/index.on",
        "note": item.get("convAddr", ""),
    }


def save_to_db(conn, validated_items: list) -> dict:
    """검증 완료된 데이터를 DB에 저장"""
    saved = 0
    errors = 0

    with conn.cursor() as cur:
        for item in validated_items:
            parsed = parse_item_for_db(item)
            try:
                # 아파트 매칭 (주소 기반)
                apartment_id = None
                addr = parsed["address"]
                if addr:
                    # 건물명으로 매칭
                    bld = parsed.get("building_name", "")
                    if bld:
                        cur.execute("SELECT id FROM apartments WHERE name ILIKE %s LIMIT 1", (f"%{bld}%",))
                        row = cur.fetchone()
                        if row:
                            apartment_id = row[0]

                cur.execute("""
                    INSERT INTO auction_items
                        (case_number, court_name, apartment_id, address, detail_address,
                         area, floor, appraisal_value, minimum_price, auction_date,
                         fail_count, status, court_url, note, fetched_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (case_number) DO UPDATE SET
                        minimum_price = EXCLUDED.minimum_price,
                        auction_date = EXCLUDED.auction_date,
                        fail_count = EXCLUDED.fail_count,
                        status = EXCLUDED.status,
                        apartment_id = COALESCE(EXCLUDED.apartment_id, auction_items.apartment_id),
                        note = EXCLUDED.note,
                        fetched_at = NOW()
                """, (
                    parsed["case_number"], parsed["court_name"], apartment_id,
                    parsed["address"], parsed["detail_address"],
                    parsed["area"], parsed["floor"],
                    parsed["appraisal_value"], parsed["minimum_price"],
                    parsed["auction_date"], parsed["fail_count"],
                    parsed["status"], parsed["court_url"], parsed["note"],
                ))
                saved += 1
            except Exception as e:
                errors += 1
                logger.error(f"DB 저장 실패 ({parsed['case_number']}): {e}")

        # 매각기일 지난 건 상태 업데이트
        cur.execute("""
            UPDATE auction_items SET status = 'closed'
            WHERE auction_date < CURRENT_DATE AND status = 'scheduled'
        """)

        # 90일 지난 종료 건 삭제
        cur.execute("""
            DELETE FROM auction_items
            WHERE status = 'closed' AND auction_date < CURRENT_DATE - INTERVAL '90 days'
        """)

        conn.commit()

    return {"saved": saved, "errors": errors}


# ==============================================
# 메인 실행
# ==============================================
async def run_auction_crawl(db_config: dict):
    """전체 경매 크롤링 실행"""
    start_time = time.time()
    logger.info("=" * 50)
    logger.info("서울 아파트 경매 크롤링 시작")
    logger.info("=" * 50)

    # DB 연결
    conn = psycopg2.connect(**db_config)

    # 이전 수집 건수 조회
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM auction_items WHERE status = 'scheduled'")
        prev_count = cur.fetchone()[0]
    logger.info(f"이전 수집 건수: {prev_count}")

    # Stage 0: 세션 획득
    try:
        session = await acquire_session()
    except Exception as e:
        logger.error(f"세션 획득 실패: {e}")
        # 수집 로그
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO data_sync_log (api_name, last_sync_at, status, record_count, error_message)
                VALUES ('auction_crawler', NOW(), 'failed', 0, %s)
            """, (str(e),))
            conn.commit()
        conn.close()
        return {"success": False, "error": str(e)}

    # Stage 1: 법원별 수집
    all_raw_items = []
    court_results = {}
    for court in SEOUL_COURTS:
        items, total = fetch_court_data(session, court["code"], court["name"])
        all_raw_items.extend(items)
        court_results[court["name"]] = {"fetched": len(items), "total": total}
        time.sleep(2)  # 법원 간 간격

    logger.info(f"총 수집: {len(all_raw_items)}건")

    # Stage 2: 정합성 검증
    report = validate_batch(all_raw_items, prev_count)
    logger.info(f"검증 결과: 유효 {report['valid']}건, 무효 {report['invalid']}건")

    if report["anomaly"]:
        logger.warning("이상 감지 — 수집 결과를 반영하지 않습니다")
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO data_sync_log (api_name, last_sync_at, status, record_count, error_message)
                VALUES ('auction_crawler', NOW(), 'anomaly', %s, %s)
            """, (report["valid"], f"이상 감지: 유효 {report['valid']}/{report['total']}건"))
            conn.commit()
        conn.close()
        return {
            "success": False,
            "reason": "anomaly_detected",
            "report": report,
        }

    # Stage 3: DB 저장
    db_result = save_to_db(conn, report["valid_items"])
    logger.info(f"DB 저장: {db_result['saved']}건, 에러: {db_result['errors']}건")

    # 수집 로그
    elapsed = time.time() - start_time
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO data_sync_log (api_name, last_sync_at, status, record_count, error_message)
            VALUES ('auction_crawler', NOW(), %s, %s, %s)
        """, (
            'success' if db_result['errors'] == 0 else 'partial',
            db_result['saved'],
            f"소요시간: {elapsed:.0f}초, 법원별: {json.dumps({k: v['fetched'] for k, v in court_results.items()}, ensure_ascii=False)}" if db_result['errors'] == 0
            else f"{db_result['errors']}건 저장 오류"
        ))
        conn.commit()

    conn.close()

    result = {
        "success": True,
        "total_fetched": len(all_raw_items),
        "valid": report["valid"],
        "invalid": report["invalid"],
        "saved": db_result["saved"],
        "db_errors": db_result["errors"],
        "elapsed_seconds": round(elapsed, 1),
        "courts": court_results,
    }

    logger.info(f"크롤링 완료: {json.dumps(result, ensure_ascii=False)}")
    return result


# CLI 실행용
if __name__ == "__main__":
    import os
    db_config = {
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": int(os.getenv("POSTGRES_PORT", 5432)),
        "dbname": os.getenv("POSTGRES_DB", "apartment_db"),
        "user": os.getenv("POSTGRES_USER", "apartment_admin"),
        "password": os.getenv("POSTGRES_PASSWORD", ""),
    }
    result = asyncio.run(run_auction_crawl(db_config))
    print(json.dumps(result, ensure_ascii=False, indent=2))
