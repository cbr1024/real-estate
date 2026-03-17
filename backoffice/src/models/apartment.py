from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, BigInteger
from sqlalchemy.orm import relationship
from src.config.database import Base


class Apartment(Base):
    __tablename__ = "apartments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, comment="아파트명")
    address = Column(String(500), comment="주소")
    road_address = Column(String(500), comment="도로명주소")
    lat = Column(Numeric(10, 7), comment="위도")
    lng = Column(Numeric(10, 7), comment="경도")
    build_year = Column(Integer, comment="건축년도")
    total_units = Column(Integer, comment="총 세대수")
    dong_count = Column(Integer, comment="총 동수")
    created_at = Column(DateTime, comment="등록일시")

    trade_history = relationship("TradeHistory", back_populates="apartment")


class TradeHistory(Base):
    __tablename__ = "trade_history"

    id = Column(Integer, primary_key=True, index=True)
    apartment_id = Column(Integer, ForeignKey("apartments.id"), nullable=False)
    trade_date = Column(DateTime, nullable=False, comment="거래일")
    price = Column(BigInteger, nullable=False, comment="거래금액(만원)")
    floor = Column(Integer, comment="층")
    area = Column(Numeric(10, 2), comment="전용면적(㎡)")
    trade_type = Column(String(10), comment="거래유형")
    dong = Column(String(50), comment="동")
    created_at = Column(DateTime, comment="등록일시")

    apartment = relationship("Apartment", back_populates="trade_history")
