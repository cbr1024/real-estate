import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from datetime import timedelta


def predict_price(trades_df: pd.DataFrame, months: int = 3) -> dict:
    """과거 거래 데이터를 기반으로 향후 시세를 예측합니다.

    scikit-learn LinearRegression을 사용하여 시계열 가격 추세를 예측합니다.
    """
    if trades_df.empty:
        return {"error": "예측에 필요한 거래 데이터가 없습니다."}

    if len(trades_df) < 3:
        return {
            "error": "예측에 필요한 거래 데이터가 부족합니다 (최소 3건 필요).",
            "거래건수": len(trades_df),
        }

    df = trades_df.copy()
    df["trade_date"] = pd.to_datetime(df["trade_date"])
    df = df.sort_values("trade_date")

    # Monthly average prices
    df["year_month"] = df["trade_date"].dt.to_period("M")
    monthly = df.groupby("year_month")["price"].mean().reset_index()
    monthly["year_month_dt"] = monthly["year_month"].dt.to_timestamp()

    if len(monthly) < 2:
        return {
            "error": "월별 데이터가 2개월 이상 필요합니다.",
            "월별_데이터_수": len(monthly),
        }

    # Convert dates to numeric features (days since first date)
    reference_date = monthly["year_month_dt"].min()
    monthly["days"] = (monthly["year_month_dt"] - reference_date).dt.days

    X = monthly[["days"]].values
    y = monthly["price"].values

    model = LinearRegression()
    model.fit(X, y)

    # R-squared score
    r_squared = round(model.score(X, y), 4)

    # Predict future months
    last_date = monthly["year_month_dt"].max()
    predictions = []

    for i in range(1, months + 1):
        future_date = last_date + timedelta(days=30 * i)
        future_days = (future_date - reference_date).days
        predicted_price = model.predict([[future_days]])[0]

        # Confidence range based on residual standard error
        residuals = y - model.predict(X).flatten()
        std_error = np.std(residuals)
        confidence_low = max(0, predicted_price - 1.96 * std_error)
        confidence_high = predicted_price + 1.96 * std_error

        predictions.append(
            {
                "예측_년월": future_date.strftime("%Y-%m"),
                "예측가격_만원": int(round(predicted_price)),
                "신뢰구간_하한_만원": int(round(confidence_low)),
                "신뢰구간_상한_만원": int(round(confidence_high)),
            }
        )

    # Recent price for comparison
    recent_price = int(round(monthly["price"].iloc[-1]))

    return {
        "모델": "LinearRegression",
        "학습_데이터_수": len(monthly),
        "R_squared": r_squared,
        "최근_평균가격_만원": recent_price,
        "예측_기간_개월": months,
        "예측결과": predictions,
        "월별_추이": [
            {
                "년월": row["year_month_dt"].strftime("%Y-%m"),
                "평균가격_만원": int(round(row["price"])),
            }
            for _, row in monthly.iterrows()
        ],
    }
