from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from src.routes.analysis import router as analysis_router
from src.routes.auction import router as auction_router

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Real Estate Analysis Server",
    description="아파트 시세 분석 백오피스 API",
    version="1.0.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router)
app.include_router(auction_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/")
def root():
    return {
        "service": "Real Estate Analysis Server",
        "version": "1.0.0",
        "description": "아파트 시세 분석 API",
    }
