import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from src.config.database import get_db
from src.config.redis import cache_response
from src.models.apartment import Apartment, TradeHistory
from src.analysis.price_analyzer import (
    calculate_price_per_area,
    calculate_trend,
    compare_nearby,
    detect_outliers,
)
from src.analysis.predictor import predict_price

router = APIRouter(prefix="/analysis", tags=["analysis"])
limiter = Limiter(key_func=get_remote_address)


def _get_trades_df(db: Session, apartment_id: int) -> pd.DataFrame:
    """아파트 거래 내역을 DataFrame으로 조회합니다."""
    apartment = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    if not apartment:
        raise HTTPException(status_code=404, detail="아파트를 찾을 수 없습니다.")

    trades = (
        db.query(TradeHistory)
        .filter(TradeHistory.apartment_id == apartment_id)
        .order_by(TradeHistory.trade_date.desc())
        .all()
    )

    if not trades:
        return pd.DataFrame()

    records = [
        {
            "id": t.id,
            "apartment_id": t.apartment_id,
            "trade_date": t.trade_date,
            "price": t.price,
            "area": float(t.area) if t.area else 0,
            "floor": t.floor,
            "trade_type": t.trade_type,
        }
        for t in trades
    ]
    return pd.DataFrame(records)


@router.get("/{apartment_id}")
@limiter.limit("30/minute")
def full_analysis(request: Request, apartment_id: int, db: Session = Depends(get_db)):
    """아파트 종합 분석 결과를 반환합니다."""
    return _full_analysis_cached(apartment_id, db)


@cache_response(prefix="analysis:full", ttl=600)
def _full_analysis_cached(apartment_id: int, db: Session):
    apartment = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    if not apartment:
        raise HTTPException(status_code=404, detail="아파트를 찾을 수 없습니다.")

    trades_df = _get_trades_df(db, apartment_id)

    result = {
        "apartmentInfo": {
            "id": apartment.id,
            "name": apartment.name,
            "address": apartment.address,
            "buildYear": apartment.build_year,
            "totalUnits": apartment.total_units,
        },
    }

    # 거래 내역이 없어도 주변 비교는 제공
    if not trades_df.empty:
        result["pricePerArea"] = calculate_price_per_area(trades_df)
        result["priceTrend"] = calculate_trend(trades_df)
        result["prediction"] = predict_price(trades_df)
        result["outliers"] = detect_outliers(trades_df)
    else:
        result["message"] = "거래 내역이 없습니다."

    # 주변 비교는 항상 실행
    try:
        result["nearbyComparison"] = compare_nearby(db, apartment_id)
    except Exception as e:
        result["nearbyComparison"] = {"주변_아파트_수": 0, "비교결과": [], "error": str(e)}

    return result


@router.get("/{apartment_id}/price-per-area")
@limiter.limit("30/minute")
def price_per_area(request: Request, apartment_id: int, db: Session = Depends(get_db)):
    """평당가를 계산합니다."""
    return _price_per_area_cached(apartment_id, db)


@cache_response(prefix="analysis:ppa", ttl=600)
def _price_per_area_cached(apartment_id: int, db: Session):
    trades_df = _get_trades_df(db, apartment_id)
    if trades_df.empty:
        return {"message": "거래 내역이 없습니다.", "apartment_id": apartment_id}
    return calculate_price_per_area(trades_df)


@router.get("/{apartment_id}/trend")
@limiter.limit("30/minute")
def price_trend(
    request: Request,
    apartment_id: int,
    period: str = Query("monthly", enum=["monthly", "quarterly", "yearly"]),
    db: Session = Depends(get_db),
):
    """기간별 가격 변동률을 분석합니다."""
    return _price_trend_cached(apartment_id, period, db)


@cache_response(prefix="analysis:trend", ttl=600)
def _price_trend_cached(apartment_id: int, period: str, db: Session):
    trades_df = _get_trades_df(db, apartment_id)
    if trades_df.empty:
        return {"message": "거래 내역이 없습니다.", "apartment_id": apartment_id}
    return calculate_trend(trades_df, period=period)


@router.get("/{apartment_id}/nearby")
@limiter.limit("30/minute")
def nearby_comparison(
    request: Request,
    apartment_id: int,
    radius_km: float = Query(1.0, ge=0.1, le=10.0),
    db: Session = Depends(get_db),
):
    """주변 시세를 비교합니다 (반경 내 유사 평형)."""
    return _nearby_cached(apartment_id, radius_km, db)


@cache_response(prefix="analysis:nearby", ttl=600)
def _nearby_cached(apartment_id: int, radius_km: float, db: Session):
    return compare_nearby(db, apartment_id, radius_km=radius_km)


@router.get("/{apartment_id}/predict")
@limiter.limit("10/minute")
def price_prediction(
    request: Request,
    apartment_id: int,
    months: int = Query(3, ge=1, le=12),
    db: Session = Depends(get_db),
):
    """향후 시세를 예측합니다."""
    return _predict_cached(apartment_id, months, db)


@cache_response(prefix="analysis:predict", ttl=1800)
def _predict_cached(apartment_id: int, months: int, db: Session):
    trades_df = _get_trades_df(db, apartment_id)
    if trades_df.empty:
        return {"message": "거래 내역이 없습니다.", "apartment_id": apartment_id}
    return predict_price(trades_df, months=months)


@router.get("/{apartment_id}/outliers")
@limiter.limit("30/minute")
def outlier_detection(request: Request, apartment_id: int, db: Session = Depends(get_db)):
    """이상치 거래를 탐지합니다."""
    return _outlier_cached(apartment_id, db)


@cache_response(prefix="analysis:outlier", ttl=600)
def _outlier_cached(apartment_id: int, db: Session):
    trades_df = _get_trades_df(db, apartment_id)
    if trades_df.empty:
        return {"message": "거래 내역이 없습니다.", "apartment_id": apartment_id}
    return detect_outliers(trades_df)
