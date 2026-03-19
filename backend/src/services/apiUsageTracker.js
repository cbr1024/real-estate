const redis = require('../config/redis');
const pool = require('../config/database');

// 네이버 NCP 무료 한도 (월별)
const MONTHLY_LIMITS = {
  maps_js: 6000000,    // Dynamic Map: 무료 600만 로드/월
  geocode: 30000,      // Geocoding: 무료 3만건/월
  place_search: 25000, // Place Search: 무료 2.5만건/월
};

// 일일 안전 한도 (월 한도의 1/31 × 80%)
const DAILY_SAFE_LIMITS = {
  maps_js: Math.floor(MONTHLY_LIMITS.maps_js / 31 * 0.8),     // ~155,000
  geocode: Math.floor(MONTHLY_LIMITS.geocode / 31 * 0.8),     // ~774
  place_search: Math.floor(MONTHLY_LIMITS.place_search / 31 * 0.8), // ~645
};

function getDayKey(apiType) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `api_usage:${apiType}:${today}`;
}

function getMonthKey(apiType) {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  return `api_usage_month:${apiType}:${month}`;
}

// API 호출 기록
async function trackApiCall(apiType, count = 1) {
  const dayKey = getDayKey(apiType);
  const monthKey = getMonthKey(apiType);

  const pipeline = redis.pipeline();
  pipeline.incrby(dayKey, count);
  pipeline.expire(dayKey, 86400 * 2); // 2일 후 만료
  pipeline.incrby(monthKey, count);
  pipeline.expire(monthKey, 86400 * 35); // 35일 후 만료
  await pipeline.exec();
}

// 일일 한도 체크 (호출 전 확인용)
async function checkDailyLimit(apiType) {
  const dayKey = getDayKey(apiType);
  const current = parseInt(await redis.get(dayKey) || '0', 10);
  const limit = DAILY_SAFE_LIMITS[apiType] || Infinity;
  return {
    allowed: current < limit,
    current,
    limit,
    remaining: Math.max(0, limit - current),
  };
}

// 전체 사용량 조회 (관리자 대시보드용)
async function getUsageStats() {
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  const apiTypes = ['maps_js', 'geocode', 'place_search'];

  const stats = {};
  for (const type of apiTypes) {
    const dayKey = `api_usage:${type}:${today}`;
    const monthKey = `api_usage_month:${type}:${month}`;

    const [daily, monthly] = await Promise.all([
      redis.get(dayKey),
      redis.get(monthKey),
    ]);

    stats[type] = {
      daily: parseInt(daily || '0', 10),
      monthly: parseInt(monthly || '0', 10),
      dailyLimit: DAILY_SAFE_LIMITS[type],
      monthlyLimit: MONTHLY_LIMITS[type],
      dailyPercent: Math.round((parseInt(daily || '0', 10) / DAILY_SAFE_LIMITS[type]) * 100),
      monthlyPercent: Math.round((parseInt(monthly || '0', 10) / MONTHLY_LIMITS[type]) * 100),
    };
  }

  // 최근 7일 일별 추이
  const dailyHistory = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = { date: dateStr };
    for (const type of apiTypes) {
      const val = await redis.get(`api_usage:${type}:${dateStr}`);
      entry[type] = parseInt(val || '0', 10);
    }
    dailyHistory.push(entry);
  }

  return { stats, dailyHistory, MONTHLY_LIMITS, DAILY_SAFE_LIMITS };
}

module.exports = { trackApiCall, checkDailyLimit, getUsageStats, DAILY_SAFE_LIMITS, MONTHLY_LIMITS };
