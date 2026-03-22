const express = require('express');
const axios = require('axios');
const pool = require('../config/database');
const redis = require('../config/redis');
const authMiddleware = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');
const { getLimits } = require('../config/planLimits');
const { trackApiCall } = require('../services/apiUsageTracker');
const jwt = require('jsonwebtoken');

const router = express.Router();

// 선택적 인증 — 토큰 있으면 파싱, 없으면 무시
function optionalAuth(req, res, next) {
  const token = req.cookies?.access_token;
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch (_) {}
  }
  next();
}

function roundCoord(v) {
  return Math.round(parseFloat(v) * 10000) / 10000;
}

// POST /track-map-load — 지도 로드 횟수 추적
router.post('/track-map-load', async (req, res) => {
  await trackApiCall('maps_js');
  return res.json({ ok: true });
});

// GET /search
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'q (search query) is required' });
    }

    const result = await pool.query(
      `SELECT id, name, address, road_address AS "roadAddress",
              lat AS latitude, lng AS longitude,
              build_year AS "buildYear", total_units AS "totalUnits",
              dong_count AS "dongCount"
       FROM apartments
       WHERE name ILIKE $1 OR address ILIKE $1 OR road_address ILIKE $1
       ORDER BY name LIMIT 20`,
      [`%${q.trim()}%`]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Error searching apartments:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET / - 항상 동일한 형식: { totalCount, items }
router.get('/', async (req, res) => {
  try {
    const lat1 = req.query.swLat || req.query.lat1;
    const lat2 = req.query.neLat || req.query.lat2;
    const lng1 = req.query.swLng || req.query.lng1;
    const lng2 = req.query.neLng || req.query.lng2;

    if (!lat1 || !lat2 || !lng1 || !lng2) {
      return res.status(400).json({ error: 'swLat, swLng, neLat, neLng are required' });
    }

    const { tradeType, minPrice, maxPrice, minArea, maxArea, minBuildYear, maxBuildYear, minFloor, maxFloor, minUnits, minTradeCount } = req.query;

    const swLat = roundCoord(lat1);
    const neLat = roundCoord(lat2);
    const swLng = roundCoord(lng1);
    const neLng = roundCoord(lng2);

    const cacheKey = `map:${swLat}:${neLat}:${swLng}:${neLng}:${tradeType || ''}:${minPrice || ''}:${maxPrice || ''}:${minArea || ''}:${maxArea || ''}:${minBuildYear || ''}:${maxBuildYear || ''}:${minFloor || ''}:${maxFloor || ''}:${minUnits || ''}:${minTradeCount || ''}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const params = [swLat, neLat, swLng, neLng];
    let paramIdx = 5;

    let tradeFilterWhere = '';
    const tradeFilters = [];

    if (tradeType) {
      const typeMap = { '매매': 'sale', '전세': 'jeonse', '월세': 'monthly' };
      tradeFilters.push(`th.trade_type = $${paramIdx}`);
      params.push(typeMap[tradeType] || tradeType);
      paramIdx++;
    }
    if (minPrice && Number(minPrice) > 0) {
      tradeFilters.push(`th.price >= $${paramIdx}`);
      params.push(Number(minPrice));
      paramIdx++;
    }
    if (maxPrice && Number(maxPrice) < 500000) {
      tradeFilters.push(`th.price <= $${paramIdx}`);
      params.push(Number(maxPrice));
      paramIdx++;
    }
    if (minArea && Number(minArea) > 0) {
      tradeFilters.push(`th.area >= $${paramIdx}`);
      params.push(Number(minArea));
      paramIdx++;
    }
    if (maxArea && Number(maxArea) < 200) {
      tradeFilters.push(`th.area <= $${paramIdx}`);
      params.push(Number(maxArea));
      paramIdx++;
    }
    if (minFloor) {
      tradeFilters.push(`th.floor >= $${paramIdx}`);
      params.push(Number(minFloor));
      paramIdx++;
    }
    if (maxFloor) {
      tradeFilters.push(`th.floor <= $${paramIdx}`);
      params.push(Number(maxFloor));
      paramIdx++;
    }

    if (tradeFilters.length > 0) {
      tradeFilterWhere = `AND ${tradeFilters.join(' AND ')}`;
    }

    // 아파트 테이블 직접 필터 (건축년도, 세대수)
    const aptFilters = [];
    if (minBuildYear) {
      aptFilters.push(`a.build_year >= $${paramIdx}`);
      params.push(Number(minBuildYear));
      paramIdx++;
    }
    if (maxBuildYear) {
      aptFilters.push(`a.build_year <= $${paramIdx}`);
      params.push(Number(maxBuildYear));
      paramIdx++;
    }
    if (minUnits) {
      aptFilters.push(`a.total_units >= $${paramIdx}`);
      params.push(Number(minUnits));
      paramIdx++;
    }
    const aptFilterWhere = aptFilters.length > 0 ? `AND ${aptFilters.join(' AND ')}` : '';

    let tradeCountFilter = '';
    if (minTradeCount && Number(minTradeCount) > 0) {
      tradeCountFilter = `AND (SELECT COUNT(*)::int FROM trade_history tc WHERE tc.apartment_id = a.id) >= $${paramIdx}`;
      params.push(Number(minTradeCount));
      paramIdx++;
    }

    const hasFilters = tradeFilters.length > 0;

    // 1) 정확한 totalCount (항상)
    const countQuery = hasFilters
      ? `SELECT COUNT(*) FROM apartments a
         WHERE a.lat BETWEEN $1 AND $2 AND a.lng BETWEEN $3 AND $4 ${aptFilterWhere} ${tradeCountFilter}
         AND EXISTS (
           SELECT 1 FROM trade_history th
           WHERE th.apartment_id = a.id ${tradeFilterWhere}
         )`
      : `SELECT COUNT(*) FROM apartments a
         WHERE a.lat BETWEEN $1 AND $2 AND a.lng BETWEEN $3 AND $4 ${aptFilterWhere} ${tradeCountFilter}`;

    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    // 2) 개별 아파트 (bounds 내 전체 반환)
    const itemQuery = hasFilters
      ? `SELECT a.id, a.name, a.address, a.road_address AS "roadAddress",
                a.lat AS latitude, a.lng AS longitude,
                a.build_year AS "buildYear", a.total_units AS "totalUnits",
                a.dong_count AS "dongCount",
                latest.price AS "latestPrice",
                latest.area AS "latestArea",
                (SELECT COUNT(*)::int FROM trade_history th2 WHERE th2.apartment_id = a.id) AS "tradeCount"
         FROM apartments a
         INNER JOIN LATERAL (
           SELECT th.price, th.area FROM trade_history th
           WHERE th.apartment_id = a.id ${tradeFilterWhere}
           ORDER BY th.trade_date DESC LIMIT 1
         ) latest ON true
         WHERE a.lat BETWEEN $1 AND $2
           AND a.lng BETWEEN $3 AND $4 ${aptFilterWhere} ${tradeCountFilter}`
      : `SELECT a.id, a.name, a.address, a.road_address AS "roadAddress",
                a.lat AS latitude, a.lng AS longitude,
                a.build_year AS "buildYear", a.total_units AS "totalUnits",
                a.dong_count AS "dongCount",
                latest."latestPrice", latest."latestArea",
                (SELECT COUNT(*)::int FROM trade_history th2 WHERE th2.apartment_id = a.id) AS "tradeCount"
         FROM apartments a
         LEFT JOIN LATERAL (
           SELECT th.price AS "latestPrice", th.area AS "latestArea"
           FROM trade_history th
           WHERE th.apartment_id = a.id
           ORDER BY th.trade_date DESC LIMIT 1
         ) latest ON true
         WHERE a.lat BETWEEN $1 AND $2
           AND a.lng BETWEEN $3 AND $4 ${aptFilterWhere} ${tradeCountFilter}`;

    const result = await pool.query(itemQuery, params);

    const response = { totalCount, items: result.rows };
    await redis.set(cacheKey, JSON.stringify(response), 'EX', 180);

    return res.json(response);
  } catch (err) {
    console.error('Error fetching apartments:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /compare — 여러 아파트 비교 데이터 (베이직 이상)
router.get('/compare', authMiddleware, requireSubscription('basic'), async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
    if (ids.length < 2 || ids.length > 3) {
      return res.status(400).json({ error: '2~3개 아파트를 선택해주세요.' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const tradeType = req.query.tradeType || 'sale';
    const ttIdx = ids.length + 1;
    const idsAndType = [...ids, tradeType];

    const [aptResult, statsResult, recentTradesResult, tradeTypeDistResult, areaTypesResult] = await Promise.all([
      // 아파트 기본 + 선택 유형 통계
      pool.query(
        `SELECT a.id, a.name, a.address, a.road_address AS "roadAddress",
                a.build_year AS "buildYear", a.total_units AS "totalUnits",
                a.dong_count AS "dongCount", a.lat, a.lng,
                -- 선택 유형 최근 거래
                (SELECT price FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx} ORDER BY trade_date DESC LIMIT 1) AS "latestPrice",
                (SELECT area FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx} ORDER BY trade_date DESC LIMIT 1) AS "latestArea",
                (SELECT floor FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx} ORDER BY trade_date DESC LIMIT 1) AS "latestFloor",
                (SELECT trade_date FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx} ORDER BY trade_date DESC LIMIT 1) AS "latestTradeDate",
                -- 총 거래 수 (선택 유형)
                (SELECT COUNT(*)::int FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx}) AS "tradeCount",
                -- 1년 통계 (선택 유형)
                (SELECT ROUND(AVG(price))::bigint FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx} AND trade_date >= CURRENT_DATE - INTERVAL '1 year') AS "avgPrice1y",
                (SELECT MAX(price) FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx} AND trade_date >= CURRENT_DATE - INTERVAL '1 year') AS "maxPrice1y",
                (SELECT MIN(price) FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx} AND trade_date >= CURRENT_DATE - INTERVAL '1 year') AS "minPrice1y",
                (SELECT COUNT(*)::int FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx} AND trade_date >= CURRENT_DATE - INTERVAL '1 year') AS "tradeCount1y",
                -- 전체 통계 (선택 유형)
                (SELECT MAX(price) FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx}) AS "maxPriceAll",
                (SELECT MIN(price) FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx}) AS "minPriceAll",
                (SELECT ROUND(AVG(area), 1) FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx}) AS "avgArea",
                (SELECT MAX(floor) FROM trade_history WHERE apartment_id = a.id) AS "maxFloor",
                -- 가격 변동률 (선택 유형)
                (SELECT ROUND(AVG(price))::bigint FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx}
                 AND trade_date BETWEEN CURRENT_DATE - INTERVAL '15 months' AND CURRENT_DATE - INTERVAL '12 months') AS "avgPricePrev",
                (SELECT ROUND(AVG(price))::bigint FROM trade_history WHERE apartment_id = a.id AND trade_type = $${ttIdx}
                 AND trade_date >= CURRENT_DATE - INTERVAL '3 months') AS "avgPrice3m"
         FROM apartments a WHERE a.id IN (${placeholders})`,
        idsAndType
      ),
      // 월별 통계 (선택 유형)
      pool.query(
        `SELECT apartment_id,
                TO_CHAR(trade_date, 'YYYY-MM') AS month,
                ROUND(AVG(price))::bigint AS avg_price,
                COUNT(*)::int AS trade_count,
                MAX(price) AS max_price,
                MIN(price) AS min_price
         FROM trade_history
         WHERE apartment_id IN (${placeholders})
           AND trade_type = $${ttIdx}
           AND trade_date >= CURRENT_DATE - INTERVAL '24 months'
         GROUP BY apartment_id, TO_CHAR(trade_date, 'YYYY-MM')
         ORDER BY apartment_id, month`,
        idsAndType
      ),
      // 최근 5건 거래 (선택 유형)
      pool.query(
        `SELECT * FROM (
           SELECT apartment_id, trade_date AS "tradeDate", price, floor, area,
                  trade_type AS "tradeType", dong,
                  ROW_NUMBER() OVER (PARTITION BY apartment_id ORDER BY trade_date DESC) AS rn
           FROM trade_history WHERE apartment_id IN (${placeholders}) AND trade_type = $${ttIdx}
         ) sub WHERE rn <= 5`,
        idsAndType
      ),
      // 거래 유형별 분포 (전체)
      pool.query(
        `SELECT apartment_id, trade_type AS "tradeType", COUNT(*)::int AS count
         FROM trade_history WHERE apartment_id IN (${placeholders})
         GROUP BY apartment_id, trade_type`,
        ids
      ),
      // 면적 타입별 최근가 (선택 유형)
      pool.query(
        `SELECT * FROM (
           SELECT apartment_id, area,
                  price, floor, trade_date AS "tradeDate",
                  ROW_NUMBER() OVER (PARTITION BY apartment_id, ROUND(area) ORDER BY trade_date DESC) AS rn
           FROM trade_history
           WHERE apartment_id IN (${placeholders}) AND trade_type = $${ttIdx}
         ) sub WHERE rn = 1
         ORDER BY apartment_id, area`,
        idsAndType
      ),
    ]);

    const statsByApt = {};
    statsResult.rows.forEach((row) => {
      if (!statsByApt[row.apartment_id]) statsByApt[row.apartment_id] = [];
      statsByApt[row.apartment_id].push(row);
    });

    const recentByApt = {};
    recentTradesResult.rows.forEach((row) => {
      if (!recentByApt[row.apartment_id]) recentByApt[row.apartment_id] = [];
      recentByApt[row.apartment_id].push(row);
    });

    const tradeTypeByApt = {};
    tradeTypeDistResult.rows.forEach((row) => {
      if (!tradeTypeByApt[row.apartment_id]) tradeTypeByApt[row.apartment_id] = {};
      tradeTypeByApt[row.apartment_id][row.tradeType] = row.count;
    });

    const areaTypesByApt = {};
    areaTypesResult.rows.forEach((row) => {
      if (!areaTypesByApt[row.apartment_id]) areaTypesByApt[row.apartment_id] = [];
      areaTypesByApt[row.apartment_id].push({
        area: Number(row.area),
        price: Number(row.price),
        floor: row.floor,
        tradeDate: row.tradeDate,
      });
    });

    const apartments = aptResult.rows.map((apt) => {
      // 가격 변동률 계산
      let priceChangeRate = null;
      if (apt.avgPricePrev && apt.avgPrice3m) {
        priceChangeRate = Math.round(((apt.avgPrice3m - apt.avgPricePrev) / apt.avgPricePrev) * 1000) / 10;
      }
      // 평당가 계산 (만원/평)
      let pricePerPyeong = null;
      if (apt.latestPrice && apt.latestArea) {
        pricePerPyeong = Math.round(apt.latestPrice / (apt.latestArea / 3.306));
      }

      return {
        ...apt,
        priceChangeRate,
        pricePerPyeong,
        monthlyStats: statsByApt[apt.id] || [],
        recentTrades: recentByApt[apt.id] || [],
        tradeTypeDistribution: tradeTypeByApt[apt.id] || {},
        areaTypes: areaTypesByApt[apt.id] || [],
      };
    });

    return res.json({ apartments });
  } catch (err) {
    console.error('Error comparing apartments:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `apartment:${id}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const result = await pool.query(
      `SELECT a.id, a.name, a.address, a.road_address AS "roadAddress",
              a.lat AS latitude, a.lng AS longitude,
              a.build_year AS "buildYear", a.total_units AS "totalUnits",
              a.dong_count AS "dongCount",
              (SELECT th.price FROM trade_history th
               WHERE th.apartment_id = a.id
               ORDER BY th.trade_date DESC LIMIT 1) AS "latestPrice",
              (SELECT MAX(th.floor) FROM trade_history th
               WHERE th.apartment_id = a.id) AS "maxFloor",
              (SELECT COUNT(*)::int FROM favorites f
               WHERE f.apartment_id = a.id) AS "favoriteCount"
       FROM apartments a WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Apartment not found' });
    }

    const data = result.rows[0];

    // 세대수/동수 없으면 네이버 부동산에서 실시간 보충
    if (!data.totalUnits || !data.dongCount) {
      try {
        const naverRes = await axios.get('https://new.land.naver.com/api/complexes/search-complexes', {
          params: { keyword: data.name, region: '' },
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
          timeout: 5000,
          validateStatus: (s) => s < 500,
        });
        const complexes = naverRes.data?.complexes || [];
        // 이름+주소 매칭
        const match = complexes.find(c => c.complexName === data.name && data.address?.includes(c.cortarAddress?.split(' ').pop()))
          || complexes.find(c => c.complexName === data.name)
          || complexes[0];
        if (match?.complexNo) {
          const detailRes = await axios.get(`https://new.land.naver.com/api/complexes/${match.complexNo}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 5000,
            validateStatus: (s) => s < 500,
          });
          const detail = detailRes.data?.complexDetail;
          if (detail) {
            const units = parseInt(detail.totalHouseholdCount, 10) || null;
            const dongs = parseInt(detail.totalDongCount, 10) || null;
            if (units || dongs) {
              data.totalUnits = units || data.totalUnits;
              data.dongCount = dongs || data.dongCount;
              // DB 업데이트 (비동기, 에러 무시)
              pool.query(
                'UPDATE apartments SET total_units = COALESCE($1, total_units), dong_count = COALESCE($2, dong_count) WHERE id = $3',
                [units, dongs, id]
              ).catch(() => {});
            }
          }
        }
      } catch (_) {}
    }

    await redis.set(cacheKey, JSON.stringify(data), 'EX', 1800);
    return res.json(data);
  } catch (err) {
    console.error('Error fetching apartment detail:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id/trades (플랜별 조회 한도)
router.get('/:id/trades', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // 플랜별 최대 조회 건수
    let planName = 'free';
    if (req.user) {
      const pr = await pool.query(
        'SELECT sp.name FROM users u LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id WHERE u.id = $1',
        [req.user.id]
      );
      planName = pr.rows[0]?.name || 'free';
    }
    const planLimits = getLimits(planName);
    const maxRows = planLimits.tradeHistory === Infinity ? 10000 : planLimits.tradeHistory;

    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, maxRows);
    const offset = (page - 1) * limit;

    if (offset >= maxRows) {
      return res.json({
        data: [], planLimit: maxRows,
        pagination: { page, limit, total: maxRows, totalPages: Math.ceil(maxRows / limit) },
      });
    }

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM trade_history WHERE apartment_id = $1', [id]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT id, apartment_id AS "apartmentId",
              trade_date AS "tradeDate", price, floor, area,
              trade_type AS "tradeType", dong
       FROM trade_history WHERE apartment_id = $1
       ORDER BY trade_date DESC LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    const effectiveTotal = Math.min(total, maxRows);
    return res.json({
      data: result.rows,
      planLimit: maxRows,
      pagination: { page, limit, total: effectiveTotal, totalPages: Math.ceil(effectiveTotal / limit) },
    });
  } catch (err) {
    console.error('Error fetching trade history:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id/stats — 월별 통계 (플랜별 기간 제한)
router.get('/:id/stats', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    let planName = 'free';
    if (req.user) {
      const pr = await pool.query(
        'SELECT sp.name FROM users u LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id WHERE u.id = $1',
        [req.user.id]
      );
      planName = pr.rows[0]?.name || 'free';
    }
    const planLimits = getLimits(planName);
    const months = Math.min(parseInt(req.query.months, 10) || planLimits.statsMonths, planLimits.statsMonths);

    const result = await pool.query(
      `SELECT
         TO_CHAR(trade_date, 'YYYY-MM') AS month,
         COUNT(*)::int AS trade_count,
         ROUND(AVG(price))::bigint AS avg_price,
         MAX(price) AS max_price,
         MIN(price) AS min_price,
         ROUND(AVG(area), 1) AS avg_area
       FROM trade_history
       WHERE apartment_id = $1
         AND trade_date >= CURRENT_DATE - ($2 || ' months')::interval
       GROUP BY TO_CHAR(trade_date, 'YYYY-MM')
       ORDER BY month`,
      [id, months]
    );

    return res.json({ stats: result.rows, planMonths: planLimits.statsMonths });
  } catch (err) {
    console.error('Error fetching stats:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id/analysis
router.get('/:id/analysis', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await axios.get(`http://python-server:8000/analysis/${id}`);
    return res.json(response.data);
  } catch (err) {
    console.error('Error fetching analysis:', err);
    if (err.response) {
      return res.status(err.response.status).json({
        error: err.response.data || 'Analysis server error',
      });
    }
    return res.status(502).json({ error: 'Analysis server unavailable' });
  }
});

module.exports = router;
