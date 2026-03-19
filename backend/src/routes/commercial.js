const express = require('express');
const pool = require('../config/database');

const router = express.Router();

// GET / — 상가/오피스텔 목록 (지도 bounds 검색)
router.get('/', async (req, res) => {
  try {
    const { swLat, swLng, neLat, neLng, propertyType, tradeType, minPrice, maxPrice } = req.query;

    if (!swLat || !swLng || !neLat || !neLng) {
      return res.status(400).json({ error: '지도 영역이 필요합니다.' });
    }

    let where = 'WHERE cp.lat BETWEEN $1 AND $2 AND cp.lng BETWEEN $3 AND $4';
    const params = [swLat, neLat, swLng, neLng];
    let paramIdx = 5;

    if (propertyType && propertyType !== 'all') {
      where += ` AND cp.property_type = $${paramIdx++}`;
      params.push(propertyType);
    }

    const result = await pool.query(
      `SELECT cp.id, cp.name, cp.property_type, cp.address, cp.road_address,
              cp.lat AS latitude, cp.lng AS longitude,
              cp.build_year AS "buildYear",
              (SELECT cth.price FROM commercial_trade_history cth
               WHERE cth.property_id = cp.id ORDER BY cth.trade_date DESC LIMIT 1) AS "latestPrice",
              (SELECT cth.area FROM commercial_trade_history cth
               WHERE cth.property_id = cp.id ORDER BY cth.trade_date DESC LIMIT 1) AS "latestArea",
              (SELECT COUNT(*) FROM commercial_trade_history cth
               WHERE cth.property_id = cp.id)::int AS "tradeCount"
       FROM commercial_properties cp
       ${where}
       ORDER BY "latestPrice" DESC NULLS LAST
       LIMIT 200`,
      params
    );

    return res.json({ totalCount: result.rows.length, items: result.rows });
  } catch (err) {
    console.error('Error fetching commercial properties:', err);
    return res.status(500).json({ error: '상가 정보 조회에 실패했습니다.' });
  }
});

// GET /:id — 상가/오피스텔 상세
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await pool.query(
      `SELECT id, name, property_type, address, road_address,
              lat AS latitude, lng AS longitude,
              build_year AS "buildYear", total_area AS "totalArea"
       FROM commercial_properties WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '물건을 찾을 수 없습니다.' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: '상세 정보 조회에 실패했습니다.' });
  }
});

// GET /:id/trades — 거래 내역
router.get('/:id/trades', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 50;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT trade_date AS "tradeDate", price, floor, area, trade_type AS "tradeType", dong
       FROM commercial_trade_history
       WHERE property_id = $1
       ORDER BY trade_date DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    return res.json({ data: result.rows });
  } catch (err) {
    return res.status(500).json({ error: '거래 내역 조회에 실패했습니다.' });
  }
});

// GET /stats/summary — 상가 통계 요약
router.get('/stats/summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT cp.id) AS total_properties,
        COUNT(cth.id) AS total_trades,
        COUNT(DISTINCT cp.id) FILTER (WHERE cp.property_type = 'commercial') AS commercial_count,
        COUNT(DISTINCT cp.id) FILTER (WHERE cp.property_type = 'officetel') AS officetel_count
      FROM commercial_properties cp
      LEFT JOIN commercial_trade_history cth ON cp.id = cth.property_id
    `);

    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: '통계 조회에 실패했습니다.' });
  }
});

module.exports = router;
