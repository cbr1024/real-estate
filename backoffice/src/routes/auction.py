"""경매 크롤링 API 엔드포인트"""
import os
import asyncio
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, BackgroundTasks

logger = logging.getLogger("auction_route")

router = APIRouter(prefix="/api/crawl", tags=["auction"])

# 동시 실행 방지 플래그
_crawl_running = False
_last_result = None


@router.post("/auction")
async def trigger_auction_crawl(background_tasks: BackgroundTasks):
    """경매 크롤링 트리거 (Node cron에서 호출)"""
    global _crawl_running

    if _crawl_running:
        raise HTTPException(status_code=409, detail="크롤링이 이미 실행 중입니다.")

    _crawl_running = True
    background_tasks.add_task(run_crawl)
    return {"message": "경매 크롤링이 시작되었습니다.", "started_at": datetime.now().isoformat()}


@router.get("/auction/status")
async def get_crawl_status():
    """크롤링 상태 조회"""
    return {
        "running": _crawl_running,
        "last_result": _last_result,
    }


async def run_crawl():
    """백그라운드에서 크롤링 실행"""
    global _crawl_running, _last_result

    try:
        from src.services.auction_crawler import run_auction_crawl

        db_config = {
            "host": os.getenv("POSTGRES_HOST", "postgres"),
            "port": int(os.getenv("POSTGRES_PORT", 5432)),
            "dbname": os.getenv("POSTGRES_DB", "apartment_db"),
            "user": os.getenv("POSTGRES_USER", "apartment_admin"),
            "password": os.getenv("POSTGRES_PASSWORD", ""),
        }

        result = await run_auction_crawl(db_config)
        _last_result = {
            "completed_at": datetime.now().isoformat(),
            **result,
        }
        logger.info(f"크롤링 완료: {result}")

    except Exception as e:
        logger.error(f"크롤링 실패: {e}")
        _last_result = {
            "completed_at": datetime.now().isoformat(),
            "success": False,
            "error": str(e),
        }
    finally:
        _crawl_running = False
