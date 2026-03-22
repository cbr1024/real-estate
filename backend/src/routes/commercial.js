const express = require('express');
const pool = require('../config/database');

const router = express.Router();

// GET / — 상가/오피스텔 목록
router.get('/', async (req, res) => {
  try {
    const { swLat, swLng, neLat, neLng, propertyType, search, tradeType, minPrice, maxPrice, sort, gu, startDate, endDate } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (swLat && swLng && neLat && neLng) {
      where += ` AND cp.lat BETWEEN $${paramIdx++} AND $${paramIdx++} AND cp.lng BETWEEN $${paramIdx++} AND $${paramIdx++}`;
      params.push(swLat, neLat, swLng, neLng);
    }

    if (propertyType && propertyType !== 'all') {
      where += ` AND cp.property_type = $${paramIdx++}`;
      params.push(propertyType);
    }

    if (search) {
      where += ` AND (cp.name ILIKE $${paramIdx} OR cp.address ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (gu) {
      where += ` AND cp.address ILIKE $${paramIdx++}`;
      params.push(`%${gu}%`);
    }

    // 서브쿼리 기반 필터 (거래유형, 가격)
    let havingClauses = [];
    if (tradeType && tradeType !== 'all') {
      where += ` AND EXISTS (SELECT 1 FROM commercial_trade_history cth WHERE cth.property_id = cp.id AND cth.trade_type = $${paramIdx++})`;
      params.push(tradeType);
    }
    if (minPrice) {
      where += ` AND EXISTS (SELECT 1 FROM commercial_trade_history cth WHERE cth.property_id = cp.id AND cth.price >= $${paramIdx++})`;
      params.push(parseInt(minPrice, 10));
    }
    if (maxPrice) {
      where += ` AND EXISTS (SELECT 1 FROM commercial_trade_history cth WHERE cth.property_id = cp.id AND cth.price <= $${paramIdx++})`;
      params.push(parseInt(maxPrice, 10));
    }
    if (startDate) {
      where += ` AND EXISTS (SELECT 1 FROM commercial_trade_history cth WHERE cth.property_id = cp.id AND cth.trade_date >= $${paramIdx++})`;
      params.push(startDate);
    }
    if (endDate) {
      where += ` AND EXISTS (SELECT 1 FROM commercial_trade_history cth WHERE cth.property_id = cp.id AND cth.trade_date <= $${paramIdx++})`;
      params.push(endDate);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM commercial_properties cp ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT cp.id, cp.name, cp.property_type, cp.address,
              cp.build_year AS "buildYear",
              (SELECT cth.price FROM commercial_trade_history cth
               WHERE cth.property_id = cp.id ORDER BY cth.trade_date DESC LIMIT 1) AS "latestPrice",
              (SELECT cth.area FROM commercial_trade_history cth
               WHERE cth.property_id = cp.id ORDER BY cth.trade_date DESC LIMIT 1) AS "latestArea",
              (SELECT cth.trade_type FROM commercial_trade_history cth
               WHERE cth.property_id = cp.id ORDER BY cth.trade_date DESC LIMIT 1) AS "latestTradeType",
              (SELECT cth.trade_date FROM commercial_trade_history cth
               WHERE cth.property_id = cp.id ORDER BY cth.trade_date DESC LIMIT 1) AS "latestTradeDate",
              (SELECT COUNT(*) FROM commercial_trade_history cth
               WHERE cth.property_id = cp.id)::int AS "tradeCount"
       FROM commercial_properties cp
       ${where}
       ORDER BY ${({
         price_asc: '"latestPrice" ASC NULLS LAST',
         price_desc: '"latestPrice" DESC NULLS LAST',
         area_desc: '"latestArea" DESC NULLS LAST',
         trades: '"tradeCount" DESC',
       })[sort] || '"latestTradeDate" DESC NULLS LAST'}
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      params
    );

    return res.json({
      totalCount: total,
      items: result.rows,
      pagination: { page, total, totalPages: Math.ceil(total / limit) },
    });
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
