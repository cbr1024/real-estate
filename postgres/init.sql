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
    password VARCHAR(255),
    nickname VARCHAR(50),
    email_verified BOOLEAN DEFAULT FALSE,
    verify_token VARCHAR(255),
    verify_token_expires TIMESTAMPTZ,
    provider VARCHAR(20) DEFAULT 'local',
    provider_id VARCHAR(255),
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

-- Subscription plans table
CREATE TABLE subscription_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    price INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add subscription & role columns to users
ALTER TABLE users
    ADD COLUMN subscription_plan_id INTEGER REFERENCES subscription_plans(id),
    ADD COLUMN subscription_started_at TIMESTAMPTZ,
    ADD COLUMN subscription_expires_at TIMESTAMPTZ,
    ADD COLUMN role VARCHAR(20) DEFAULT 'user',
    ADD COLUMN last_lat NUMERIC(10, 7),
    ADD COLUMN last_lng NUMERIC(10, 7);

-- Seed subscription plans
INSERT INTO subscription_plans (name, display_name, description, price, sort_order) VALUES
    ('free', '무료', '관심 5개, 알림 1개, 거래내역 10건, 1년 통계', 0, 1),
    ('basic', '베이직', '관심 30개, 알림 10개, 거래내역 50건, 3년 통계, 단지비교, 정책발표', 9900, 2),
    ('pro', '프로', '무제한 관심/알림/거래내역, 5년+ 통계, 단지비교, 정책발표, 학군/교통', 29900, 3);

-- Set default plan for existing users
UPDATE users SET subscription_plan_id = (SELECT id FROM subscription_plans WHERE name = 'free')
    WHERE subscription_plan_id IS NULL;

-- Policy announcements table
CREATE TABLE policy_announcements (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL,
    source_id VARCHAR(100),
    title TEXT NOT NULL,
    category VARCHAR(50),
    url TEXT,
    published_at DATE,
    views INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source, source_id)
);

-- Price alerts table
CREATE TABLE price_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    apartment_id INTEGER REFERENCES apartments(id) ON DELETE CASCADE,
    alert_type VARCHAR(20) NOT NULL DEFAULT 'any',
    target_price BIGINT,
    is_active BOOLEAN DEFAULT TRUE,
    last_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, apartment_id)
);

-- Site visits (daily unique visitor tracking)
CREATE TABLE site_visits (
    id SERIAL PRIMARY KEY,
    visitor_id VARCHAR(64) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    visited_at TIMESTAMPTZ DEFAULT NOW()
);

-- Login logs
CREATE TABLE login_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) DEFAULT 'local',
    ip_address VARCHAR(45),
    logged_in_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_apartments_lat_lng ON apartments (lat, lng);
CREATE INDEX idx_trade_history_apartment_id ON trade_history (apartment_id);
CREATE INDEX idx_trade_history_trade_date ON trade_history (trade_date);
CREATE UNIQUE INDEX idx_trade_history_unique ON trade_history (apartment_id, trade_date, price, floor, area, trade_type);
CREATE INDEX idx_favorites_user_apartment ON favorites (user_id, apartment_id);
CREATE INDEX idx_trade_history_type ON trade_history (trade_type);
CREATE INDEX idx_users_subscription ON users (subscription_plan_id);
CREATE INDEX idx_policy_source ON policy_announcements (source);
CREATE UNIQUE INDEX idx_users_provider ON users (provider, provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX idx_site_visits_visited_at ON site_visits (visited_at);
CREATE INDEX idx_site_visits_visitor_id ON site_visits (visitor_id, visited_at);
CREATE INDEX idx_login_logs_logged_in_at ON login_logs (logged_in_at);
CREATE INDEX idx_login_logs_user_id ON login_logs (user_id);

-- Nearby schools cache table
CREATE TABLE nearby_schools (
    id SERIAL PRIMARY KEY,
    apartment_id INTEGER REFERENCES apartments(id) ON DELETE CASCADE,
    school_name VARCHAR(200) NOT NULL,
    school_type VARCHAR(20), -- 초등학교, 중학교, 고등학교
    address VARCHAR(500),
    lat NUMERIC(10, 7),
    lng NUMERIC(10, 7),
    distance INTEGER,
    category VARCHAR(100),
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(apartment_id, school_name)
);

CREATE INDEX idx_nearby_schools_apartment ON nearby_schools (apartment_id);

-- Payments table
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    order_id VARCHAR(100) UNIQUE NOT NULL,
    payment_key VARCHAR(200),
    plan_id INTEGER REFERENCES subscription_plans(id),
    amount INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    method VARCHAR(50),
    paid_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    receipt_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_user ON payments (user_id);
CREATE INDEX idx_payments_order ON payments (order_id);

-- A. Apartment Reviews
CREATE TABLE apartment_reviews (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    apartment_id INTEGER REFERENCES apartments(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    pros TEXT,
    cons TEXT,
    content TEXT,
    rating_transport INTEGER CHECK (rating_transport >= 1 AND rating_transport <= 5),
    rating_environment INTEGER CHECK (rating_environment >= 1 AND rating_environment <= 5),
    rating_facilities INTEGER CHECK (rating_facilities >= 1 AND rating_facilities <= 5),
    rating_parking INTEGER CHECK (rating_parking >= 1 AND rating_parking <= 5),
    rating_education INTEGER CHECK (rating_education >= 1 AND rating_education <= 5),
    helpful_count INTEGER DEFAULT 0,
    residence_period VARCHAR(20),
    likes INTEGER DEFAULT 0,
    reported BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, apartment_id)
);

CREATE INDEX idx_reviews_apartment ON apartment_reviews (apartment_id);
CREATE INDEX idx_reviews_user ON apartment_reviews (user_id);

CREATE TABLE review_helpful (
    id SERIAL PRIMARY KEY,
    review_id INTEGER REFERENCES apartment_reviews(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(review_id, user_id)
);

-- B. Community Posts
CREATE TABLE community_posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(30) NOT NULL,
    region VARCHAR(100),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_community_posts_category ON community_posts (category);
CREATE INDEX idx_community_posts_region ON community_posts (region);
CREATE INDEX idx_community_posts_created ON community_posts (created_at DESC);

CREATE TABLE community_comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_community_comments_post ON community_comments (post_id);

-- C. Investment Discussions
CREATE TABLE investment_discussions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    apartment_id INTEGER REFERENCES apartments(id) ON DELETE SET NULL,
    region VARCHAR(100),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    opinion VARCHAR(10) NOT NULL DEFAULT 'hold',
    vote_buy INTEGER DEFAULT 0,
    vote_sell INTEGER DEFAULT 0,
    vote_hold INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_discussions_created ON investment_discussions (created_at DESC);
CREATE INDEX idx_discussions_apartment ON investment_discussions (apartment_id);

CREATE TABLE discussion_votes (
    id SERIAL PRIMARY KEY,
    discussion_id INTEGER REFERENCES investment_discussions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    vote VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(discussion_id, user_id)
);

CREATE TABLE discussion_comments (
    id SERIAL PRIMARY KEY,
    discussion_id INTEGER REFERENCES investment_discussions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_discussion_comments_discussion ON discussion_comments (discussion_id);

-- D. Expert Columns
CREATE TABLE expert_columns (
    id SERIAL PRIMARY KEY,
    author_name VARCHAR(100) NOT NULL,
    author_title VARCHAR(100),
    title VARCHAR(300) NOT NULL,
    summary TEXT,
    content TEXT NOT NULL,
    category VARCHAR(50),
    is_premium BOOLEAN DEFAULT FALSE,
    views INTEGER DEFAULT 0,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expert_columns_published ON expert_columns (published_at DESC);
CREATE INDEX idx_expert_columns_category ON expert_columns (category);

-- Auction items
CREATE TABLE auction_items (
    id SERIAL PRIMARY KEY,
    case_number VARCHAR(50) NOT NULL,
    court_name VARCHAR(50) NOT NULL,
    apartment_id INTEGER REFERENCES apartments(id) ON DELETE SET NULL,
    address VARCHAR(500),
    detail_address VARCHAR(200),
    area NUMERIC(10, 2),
    floor INTEGER,
    appraisal_value BIGINT,
    minimum_price BIGINT,
    auction_date DATE,
    fail_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'scheduled',
    bid_count INTEGER,
    winning_price BIGINT,
    note TEXT,
    court_url TEXT,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(case_number)
);

CREATE INDEX idx_auction_apartment ON auction_items (apartment_id);
CREATE INDEX idx_auction_date ON auction_items (auction_date DESC);
CREATE INDEX idx_auction_status ON auction_items (status);
CREATE INDEX idx_auction_address ON auction_items (address);
