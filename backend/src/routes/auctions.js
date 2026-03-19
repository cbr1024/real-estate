const express = require('express');
const pool = require('../config/database');

const router = express.Router();

const optionalAuth = async (req, res, next) => {
  const token = req.cookies?.access_token
    || (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.split(' ')[1]);
  if (!token) return next();
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch (_) {}
  next();
};

// GET / — 경매 목록 (누구나 열람 가능, 상세는 Pro)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const status = req.query.status || 'scheduled';
    const sort = req.query.sort || 'date'; // date, price_asc, price_desc, discount

    // 유저 플랜 확인
    let userPlan = 'free';
    if (req.user) {
      const userResult = await pool.query(
        `SELECT sp.name FROM users u LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id WHERE u.id = $1`,
        [req.user.id]
      );
      userPlan = userResult.rows[0]?.name || 'free';
    }
    const isPro = userPlan === 'pro';

    let where = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (status && status !== 'all') {
      where += ` AND a.status = $${paramIdx++}`;
      params.push(status);
    }

    if (req.query.court) {
      where += ` AND a.court_name ILIKE $${paramIdx++}`;
      params.push(`%${req.query.court}%`);
    }

    if (req.query.minPrice) {
      where += ` AND a.minimum_price >= $${paramIdx++}`;
      params.push(parseInt(req.query.minPrice, 10));
    }
    if (req.query.maxPrice) {
      where += ` AND a.minimum_price <= $${paramIdx++}`;
      params.push(parseInt(req.query.maxPrice, 10));
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM auction_items a ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    let orderBy = 'a.auction_date ASC NULLS LAST';
    if (sort === 'price_asc') orderBy = 'a.minimum_price ASC NULLS LAST';
    else if (sort === 'price_desc') orderBy = 'a.minimum_price DESC NULLS LAST';
    else if (sort === 'discount') orderBy = '(a.appraisal_value - a.minimum_price) DESC NULLS LAST';
    else if (sort === 'recent') orderBy = 'a.fetched_at DESC';

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT a.id, a.case_number, a.court_name, a.address, a.detail_address,
              a.area, a.floor, a.appraisal_value, a.minimum_price,
              a.auction_date, a.fail_count, a.status, a.court_url,
              a.apartment_id, apt.name AS apartment_name,
              CASE WHEN a.appraisal_value > 0
                THEN ROUND(((a.appraisal_value - a.minimum_price)::numeric / a.appraisal_value) * 100, 1)
                ELSE 0
              END AS discount_rate
       FROM auction_items a
       LEFT JOIN apartments apt ON a.apartment_id = apt.id
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      params
    );

    // Free/Basic 사용자: 기본 정보만 (감정가, 최저가 마스킹)
    const auctions = result.rows.map((item) => {
      if (!isPro) {
        return {
          ...item,
          appraisal_value: null,
          minimum_price: null,
          discount_rate: null,
          court_url: null,
          locked: true,
        };
      }
      return { ...item, locked: false };
    });

    // 통계
    const statsResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'scheduled') AS scheduled_count,
         COUNT(*) FILTER (WHERE status = 'closed') AS closed_count,
         ROUND(AVG(CASE WHEN appraisal_value > 0 AND status = 'scheduled'
           THEN ((appraisal_value - minimum_price)::numeric / appraisal_value) * 100
           ELSE NULL END), 1) AS avg_discount
       FROM auction_items`
    );

    return res.json({
      auctions,
      stats: statsResult.rows[0],
      pagination: { page, total, totalPages: Math.ceil(total / limit) },
      isPro,
    });
  } catch (err) {
    console.error('Error fetching auctions:', err);
    return res.status(500).json({ error: '경매 정보 조회에 실패했습니다.' });
  }
});

// GET /apartment/:id — 특정 아파트의 경매 이력
router.get('/apartment/:id', optionalAuth, async (req, res) => {
  try {
    const apartmentId = parseInt(req.params.id, 10);

    let userPlan = 'free';
    if (req.user) {
      const userResult = await pool.query(
        `SELECT sp.name FROM users u LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id WHERE u.id = $1`,
        [req.user.id]
      );
      userPlan = userResult.rows[0]?.name || 'free';
    }
    const isPro = userPlan === 'pro';

    const result = await pool.query(
      `SELECT id, case_number, court_name, address, detail_address,
              area, floor, appraisal_value, minimum_price,
              auction_date, fail_count, status, court_url,
              CASE WHEN appraisal_value > 0
                THEN ROUND(((appraisal_value - minimum_price)::numeric / appraisal_value) * 100, 1)
                ELSE 0
              END AS discount_rate
       FROM auction_items
       WHERE apartment_id = $1
       ORDER BY auction_date DESC
       LIMIT 10`,
      [apartmentId]
    );

    const auctions = result.rows.map((item) => {
      if (!isPro) {
        return {
          ...item,
          appraisal_value: null,
          minimum_price: null,
          discount_rate: null,
          court_url: null,
          locked: true,
        };
      }
      return { ...item, locked: false };
    });

    return res.json({ auctions, isPro });
  } catch (err) {
    console.error('Error fetching apartment auctions:', err);
    return res.status(500).json({ error: '경매 정보 조회에 실패했습니다.' });
  }
});

module.exports = router;
