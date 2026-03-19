const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');

const router = express.Router();

// GET / — 정책 발표 목록 (베이직 이상)
router.get('/', authMiddleware, requireSubscription('basic'), async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const offset = (page - 1) * limit;
    const category = req.query.category || '';

    let whereClause = '';
    const params = [];
    let paramIdx = 1;

    if (category) {
      whereClause = `WHERE category = $${paramIdx}`;
      params.push(category);
      paramIdx++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM policy_announcements ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT id, source, title, category, url, published_at, views, created_at
       FROM policy_announcements ${whereClause}
       ORDER BY published_at DESC, id DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    return res.json({
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error fetching policy:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// GET /categories — 카테고리 목록 (베이직 이상)
router.get('/categories', authMiddleware, requireSubscription('basic'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT category, COUNT(*)::int AS count
       FROM policy_announcements
       WHERE category IS NOT NULL AND category != ''
       GROUP BY category
       ORDER BY count DESC`
    );
    return res.json({ categories: result.rows });
  } catch (err) {
    console.error('Error fetching categories:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
