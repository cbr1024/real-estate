import pandas as pd
import numpy as np
from sqlalchemy.orm import Session

from src.models.apartment import Apartment, TradeHistory


def calculate_price_per_area(trades_df: pd.DataFrame) -> dict:
    """거래금액 / 전용면적으로 평당가를 계산합니다."""
    if trades_df.empty:
        return {}

    result = trades_df.copy()
    # 전용면적(㎡)을 평으로 변환 (1평 = 3.3058㎡)
    result["면적_평"] = result["area"] / 3.3058
    result["평당가_만원"] = (result["price"] / result["면적_평"]).round(0)
    result["㎡당가_만원"] = (result["price"] / result["area"]).round(0)

    summary = {
        "평균_평당가_만원": int(result["평당가_만원"].mean()),
        "최고_평당가_만원": int(result["평당가_만원"].max()),
        "최저_평당가_만원": int(result["평당가_만원"].min()),
        "평균_㎡당가_만원": int(result["㎡당가_만원"].mean()),
        "거래건수": len(result),
        "거래내역": result[
            ["trade_date", "price", "area", "면적_평", "평당가_만원"]
        ]
        .sort_values("trade_date", ascending=False)
        .to_dict(orient="records"),
    }
    return summary


def calculate_trend(
    trades_df: pd.DataFrame, period: str = "monthly"
) -> dict:
    """기간별 가격 변동률을 분석합니다."""
    if trades_df.empty or len(trades_df) < 2:
        return {"error": "분석에 필요한 거래 데이터가 부족합니다.", "거래건수": len(trades_df)}

    df = trades_df.copy()
    df["trade_date"] = pd.to_datetime(df["trade_date"])
    df = df.sort_values("trade_date")

    if period == "monthly":
        df["기간"] = df["trade_date"].dt.to_period("M").astype(str)
    elif period == "quarterly":
        df["기간"] = df["trade_date"].dt.to_period("Q").astype(str)
    elif period == "yearly":
        df["기간"] = df["trade_date"].dt.to_period("Y").astype(str)
    else:
        df["기간"] = df["trade_date"].dt.to_period("M").astype(str)

    period_avg = df.groupby("기간")["price"].mean().reset_index()
    period_avg.columns = ["기간", "평균가격_만원"]
    period_avg["평균가격_만원"] = period_avg["평균가격_만원"].round(0).astype(int)
    period_avg["변동률_%"] = period_avg["평균가격_만원"].pct_change().mul(100).round(2)

    # Overall trend
    first_price = period_avg["평균가격_만원"].iloc[0]
    last_price = period_avg["평균가격_만원"].iloc[-1]
    total_change_pct = round(((last_price - first_price) / first_price) * 100, 2)

    return {
        "분석기간": period,
        "전체_변동률_%": total_change_pct,
        "시작가격_만원": int(first_price),
        "최근가격_만원": int(last_price),
        "기간별_추이": period_avg.fillna(0).to_dict(orient="records"),
    }


def compare_nearby(
    db: Session, apartment_id: int, radius_km: float = 1.0
) -> dict:
    """반경 내 주변 아파트 시세를 비교합니다."""
    try:
        target = db.query(Apartment).filter(Apartment.id == apartment_id).first()
    except Exception as e:
        import logging
        logging.error(f"compare_nearby target query failed: {e}")
        return {"error": f"DB 조회 실패: {str(e)}", "주변_아파트_수": 0, "비교결과": []}

    if not target:
        return {"error": "아파트를 찾을 수 없습니다.", "주변_아파트_수": 0, "비교결과": []}

    if target.lat is None or target.lng is None:
        return {"error": "아파트 좌표 정보가 없습니다.", "주변_아파트_수": 0, "비교결과": []}

    target_lat = float(target.lat)
    target_lng = float(target.lng)

    # Haversine approximation: 1 degree latitude ~ 111km
    lat_diff = float(radius_km / 111.0)
    lon_diff = float(radius_km / (111.0 * np.cos(np.radians(target_lat))))

    lat_min = float(target_lat - lat_diff)
    lat_max = float(target_lat + lat_diff)
    lng_min = float(target_lng - lon_diff)
    lng_max = float(target_lng + lon_diff)

    from sqlalchemy import text
    import logging
    logging.info(f"compare_nearby: apt={apartment_id}, lat={target_lat}, lng={target_lng}, range=({lat_min},{lat_max},{lng_min},{lng_max})")
    try:
        nearby_apartments = (
            db.query(Apartment)
            .filter(text(
                "apartments.id != :aid AND apartments.lat BETWEEN :lat_min AND :lat_max AND apartments.lng BETWEEN :lng_min AND :lng_max"
            ))
            .params(aid=apartment_id, lat_min=lat_min, lat_max=lat_max, lng_min=lng_min, lng_max=lng_max)
            .all()
        )
        logging.info(f"compare_nearby: found {len(nearby_apartments)} nearby")
    except Exception as e:
        logging.error(f"compare_nearby query error: {e}")
        return {"대상_아파트": target.name, "반경_km": radius_km, "주변_아파트_수": 0, "비교결과": [], "error": str(e)}

    if not nearby_apartments:
        return {
            "대상_아파트": target.name,
            "반경_km": radius_km,
            "주변_아파트_수": 0,
            "비교결과": [],
            "message": "반경 내 비교 가능한 아파트가 없습니다.",
        }

    comparisons = []

    for apt in nearby_apartments:
        recent_trades = (
            db.query(TradeHistory)
            .filter(TradeHistory.apartment_id == apt.id)
            .order_by(TradeHistory.trade_date.desc())
            .limit(5)
            .all()
        )

        if not recent_trades:
            continue

        avg_price = sum(t.price for t in recent_trades) / len(recent_trades)
        avg_area = sum(float(t.area) for t in recent_trades if t.area) / len(recent_trades)
        comparisons.append(
            {
                "아파트명": apt.name,
                "주소": apt.address,
                "전용면적_㎡": round(avg_area, 2),
                "최근_평균가격_만원": int(avg_price),
                "최근_거래건수": len(recent_trades),
            }
        )

    # Target apartment recent average
    target_trades = (
        db.query(TradeHistory)
        .filter(TradeHistory.apartment_id == apartment_id)
        .order_by(TradeHistory.trade_date.desc())
        .limit(5)
        .all()
    )
    target_avg = (
        int(sum(t.price for t in target_trades) / len(target_trades))
        if target_trades
        else 0
    )

    return {
        "대상_아파트": target.name,
        "대상_최근_평균가격_만원": target_avg,
        "반경_km": radius_km,
        "주변_아파트_수": len(comparisons),
        "비교결과": sorted(comparisons, key=lambda x: x["최근_평균가격_만원"], reverse=True),
    }


def detect_outliers(trades_df: pd.DataFrame) -> dict:
    """IQR 방법으로 이상치 거래를 탐지합니다."""
    if trades_df.empty or len(trades_df) < 4:
        return {"error": "이상치 분석에 필요한 데이터가 부족합니다 (최소 4건 필요).", "거래건수": len(trades_df)}

    prices = trades_df["price"]
    q1 = prices.quantile(0.25)
    q3 = prices.quantile(0.75)
    iqr = q3 - q1

    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr

    outlier_mask = (prices < lower_bound) | (prices > upper_bound)
    outliers = trades_df[outlier_mask].copy()
    normal = trades_df[~outlier_mask].copy()

    result = {
        "전체_거래건수": len(trades_df),
        "이상치_건수": len(outliers),
        "정상_거래건수": len(normal),
        "Q1_만원": int(q1),
        "Q3_만원": int(q3),
        "IQR_만원": int(iqr),
        "하한_만원": int(lower_bound),
        "상한_만원": int(upper_bound),
        "평균가격_만원": int(prices.mean()),
    }

    if not outliers.empty:
        result["이상치_거래"] = outliers[
            ["trade_date", "price", "area", "floor"]
        ].to_dict(orient="records")
    else:
        result["이상치_거래"] = []

    return result
