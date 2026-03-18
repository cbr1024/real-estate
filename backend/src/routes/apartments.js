const express = require('express');
const axios = require('axios');
const pool = require('../config/database');
const redis = require('../config/redis');

const router = express.Router();

function roundCoord(v) {
  return Math.round(parseFloat(v) * 10000) / 10000;
}

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

    const { tradeType, minPrice, maxPrice, minArea, maxArea } = req.query;

    const swLat = roundCoord(lat1);
    const neLat = roundCoord(lat2);
    const swLng = roundCoord(lng1);
    const neLng = roundCoord(lng2);

    const cacheKey = `map:${swLat}:${neLat}:${swLng}:${neLng}:${tradeType || ''}:${minPrice || ''}:${maxPrice || ''}:${minArea || ''}:${maxArea || ''}`;
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

    if (tradeFilters.length > 0) {
      tradeFilterWhere = `AND ${tradeFilters.join(' AND ')}`;
    }

    const hasFilters = tradeFilters.length > 0;

    // 1) 정확한 totalCount (항상)
    const countQuery = hasFilters
      ? `SELECT COUNT(*) FROM apartments a
         WHERE a.lat BETWEEN $1 AND $2 AND a.lng BETWEEN $3 AND $4
         AND EXISTS (
           SELECT 1 FROM trade_history th
           WHERE th.apartment_id = a.id ${tradeFilterWhere}
         )`
      : `SELECT COUNT(*) FROM apartments a
         WHERE a.lat BETWEEN $1 AND $2 AND a.lng BETWEEN $3 AND $4`;

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
           AND a.lng BETWEEN $3 AND $4`
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
           AND a.lng BETWEEN $3 AND $4`;

    const result = await pool.query(itemQuery, params);

    const response = { totalCount, items: result.rows };
    await redis.set(cacheKey, JSON.stringify(response), 'EX', 180);

    return res.json(response);
  } catch (err) {
    console.error('Error fetching apartments:', err);
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
               WHERE th.apartment_id = a.id) AS "maxFloor"
       FROM apartments a WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Apartment not found' });
    }

    const data = result.rows[0];
    await redis.set(cacheKey, JSON.stringify(data), 'EX', 1800);
    return res.json(data);
  } catch (err) {
    console.error('Error fetching apartment detail:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id/trades
router.get('/:id/trades', async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = (page - 1) * limit;

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

    return res.json({
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error fetching trade history:', err);
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
