-- Apartments table
CREATE TABLE apartments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    address VARCHAR(500),
    road_address VARCHAR(500),
    lat NUMERIC(10, 7),
    lng NUMERIC(10, 7),
    build_year INTEGER,
    total_units INTEGER,
    dong_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trade history table
CREATE TABLE trade_history (
    id SERIAL PRIMARY KEY,
    apartment_id INTEGER REFERENCES apartments(id),
    trade_date DATE NOT NULL,
    price BIGINT NOT NULL,
    floor INTEGER,
    area NUMERIC(10, 2),
    trade_type VARCHAR(10) DEFAULT 'sale',
    dong VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    nickname VARCHAR(50),
    email_verified BOOLEAN DEFAULT FALSE,
    verify_token VARCHAR(255),
    verify_token_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Favorites table
CREATE TABLE favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    apartment_id INTEGER REFERENCES apartments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, apartment_id)
);

-- Data sync log table
CREATE TABLE data_sync_log (
    id SERIAL PRIMARY KEY,
    api_name VARCHAR(100),
    last_sync_at TIMESTAMPTZ,
    status VARCHAR(20),
    record_count INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_apartments_lat_lng ON apartments (lat, lng);
CREATE INDEX idx_trade_history_apartment_id ON trade_history (apartment_id);
CREATE INDEX idx_trade_history_trade_date ON trade_history (trade_date);
CREATE UNIQUE INDEX idx_trade_history_unique ON trade_history (apartment_id, trade_date, price, floor, area, trade_type);
CREATE INDEX idx_favorites_user_apartment ON favorites (user_id, apartment_id);
