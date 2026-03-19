const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const pool = require('../config/database');

// 서울 지역 법원 코드
const SEOUL_COURTS = [
  { code: '1', name: '서울중앙지방법원' },
  { code: '2', name: '서울동부지방법원' },
  { code: '3', name: '서울서부지방법원' },
  { code: '4', name: '서울남부지방법원' },
  { code: '5', name: '서울북부지방법원' },
];

const BASE_URL = 'https://www.courtauction.go.kr';
const SEARCH_URL = `${BASE_URL}/RetrieveRealEstSrchList.laf`;
const DETAIL_URL = `${BASE_URL}/RetrieveRealEstDetailInqSa498.laf`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^\d]/g, '');
  return cleaned ? parseInt(cleaned, 10) : null;
}

function parseArea(text) {
  if (!text) return null;
  const match = text.match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

function parseFloor(text) {
  if (!text) return null;
  const match = text.match(/(\d+)\s*층/);
  return match ? parseInt(match[1], 10) : null;
}

// 대법원 경매 검색 페이지 스크래핑
async function fetchAuctionPage(courtCode, page = 1) {
  try {
    const formData = new URLSearchParams();
    formData.append('bubwLocGubun', '1'); // 지방법원
    formData.append('jiwonNm', courtCode);
    formData.append('daession', '');
    formData.append('saession', '');
    formData.append('srnght', '');
    formData.append('iNgMp', '');
    formData.append('lclsUtilCd', '0000802'); // 아파트
    formData.append('mclsUtilCd', '');
    formData.append('sclsUtilCd', '');
    formData.append('sDay', '');
    formData.append('eDay', '');
    formData.append('termStartDt', '');
    formData.append('termEndDt', '');
    formData.append('lrgeSidoCd', '11'); // 서울
    formData.append('lrgeSignguCd', '');
    formData.append('lrgeDongCd', '');
    formData.append('minMgakPrc', '');
    formData.append('maxMgakPrc', '');
    formData.append('pgSize', '20');
    formData.append('page', String(page));

    const response = await axios.post(SEARCH_URL, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': `${BASE_URL}/RetrieveRealEstSrch.laf`,
      },
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const html = iconv.decode(Buffer.from(response.data), 'euc-kr');
    return html;
  } catch (err) {
    console.error(`[AuctionScraper] Error fetching court ${courtCode} page ${page}:`, err.message);
    return null;
  }
}

function parseAuctionList(html, courtName) {
  const $ = cheerio.load(html);
  const items = [];

  // 경매 목록 테이블 파싱
  $('table.Ltbl_list tbody tr, table.tbl_list tbody tr').each((i, row) => {
    try {
      const tds = $(row).find('td');
      if (tds.length < 4) return;

      const caseText = $(tds[0]).text().trim();
      const caseMatch = caseText.match(/(\d{4}타경\d+)/);
      if (!caseMatch) return;

      const caseNumber = caseMatch[1];
      const addressFull = $(tds[1]).text().trim().replace(/\s+/g, ' ');
      const detailText = $(tds[2]).text().trim();
      const priceText = $(tds[3]).text().trim();

      // 감정가, 최저가 분리
      const prices = priceText.split(/\n|\r/).map((s) => s.trim()).filter(Boolean);
      const appraisalValue = parsePrice(prices[0]);
      const minimumPrice = parsePrice(prices[1] || prices[0]);

      // 날짜
      let auctionDate = null;
      const dateMatch = $(row).text().match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      if (dateMatch) {
        auctionDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
      }

      // 유찰 횟수
      let failCount = 0;
      const failMatch = $(row).text().match(/(\d+)\s*회\s*유찰/);
      if (failMatch) failCount = parseInt(failMatch[1], 10);

      // 면적, 층
      const area = parseArea(detailText);
      const floor = parseFloor(detailText);

      // 상세 링크
      const link = $(row).find('a').attr('href') || '';
      const courtUrl = link ? `${BASE_URL}${link}` : '';

      items.push({
        case_number: caseNumber,
        court_name: courtName,
        address: addressFull,
        detail_address: detailText,
        area,
        floor,
        appraisal_value: appraisalValue,
        minimum_price: minimumPrice,
        auction_date: auctionDate,
        fail_count: failCount,
        status: 'scheduled',
        court_url: courtUrl,
      });
    } catch (err) {
      // 개별 행 파싱 실패 무시
    }
  });

  return items;
}

// 아파트 매칭: 주소 기반으로 기존 apartments 테이블과 연결
async function matchApartment(address) {
  if (!address) return null;
  try {
    // 주소에서 아파트명 추출 시도
    const aptMatch = address.match(/([가-힣]+아파트|[가-힣]+\d+차)/);
    if (aptMatch) {
      const result = await pool.query(
        `SELECT id FROM apartments WHERE name ILIKE $1 OR address ILIKE $2 LIMIT 1`,
        [`%${aptMatch[1]}%`, `%${address.split(' ').slice(0, 3).join('%')}%`]
      );
      if (result.rows.length > 0) return result.rows[0].id;
    }

    // 주소 부분 매칭
    const parts = address.split(' ').filter(Boolean);
    if (parts.length >= 3) {
      const result = await pool.query(
        `SELECT id FROM apartments WHERE address ILIKE $1 LIMIT 1`,
        [`%${parts.slice(0, 3).join('%')}%`]
      );
      if (result.rows.length > 0) return result.rows[0].id;
    }
  } catch (_) {}
  return null;
}

// 메인 스크래핑 함수
async function scrapeSeoulAuctions() {
  console.log('[AuctionScraper] 서울 아파트 경매 정보 수집 시작...');
  let totalSaved = 0;
  let totalErrors = 0;

  for (const court of SEOUL_COURTS) {
    console.log(`[AuctionScraper] ${court.name} 스크래핑 중...`);

    for (let page = 1; page <= 5; page++) { // 법원당 최대 5페이지
      const html = await fetchAuctionPage(court.code, page);
      if (!html) break;

      const items = parseAuctionList(html, court.name);
      if (items.length === 0) break; // 더 이상 결과 없음

      for (const item of items) {
        try {
          // 아파트 매칭
          const apartmentId = await matchApartment(item.address);

          await pool.query(
            `INSERT INTO auction_items
              (case_number, court_name, apartment_id, address, detail_address, area, floor,
               appraisal_value, minimum_price, auction_date, fail_count, status, court_url, fetched_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
             ON CONFLICT (case_number) DO UPDATE SET
               minimum_price = EXCLUDED.minimum_price,
               auction_date = EXCLUDED.auction_date,
               fail_count = EXCLUDED.fail_count,
               status = EXCLUDED.status,
               apartment_id = COALESCE(EXCLUDED.apartment_id, auction_items.apartment_id),
               fetched_at = NOW()`,
            [
              item.case_number, item.court_name, apartmentId,
              item.address, item.detail_address, item.area, item.floor,
              item.appraisal_value, item.minimum_price, item.auction_date,
              item.fail_count, item.status, item.court_url,
            ]
          );
          totalSaved++;
        } catch (err) {
          totalErrors++;
          console.error(`[AuctionScraper] DB 저장 실패 (${item.case_number}):`, err.message);
        }
      }

      // 서버 부하 방지
      await sleep(2000);
    }

    await sleep(3000); // 법원 간 간격
  }

  // 지난 경매 상태 업데이트: 매각기일 지난 건 → 'closed'
  await pool.query(
    `UPDATE auction_items SET status = 'closed' WHERE auction_date < CURRENT_DATE AND status = 'scheduled'`
  ).catch(() => {});

  // 수집 로그
  await pool.query(
    `INSERT INTO data_sync_log (api_name, last_sync_at, status, record_count, error_message)
     VALUES ('auction_scraper', NOW(), $1, $2, $3)`,
    [totalErrors > 0 ? 'partial' : 'success', totalSaved, totalErrors > 0 ? `${totalErrors}건 오류` : null]
  ).catch(() => {});

  console.log(`[AuctionScraper] 완료 — 저장: ${totalSaved}건, 오류: ${totalErrors}건`);
  return { saved: totalSaved, errors: totalErrors };
}

module.exports = { scrapeSeoulAuctions };
