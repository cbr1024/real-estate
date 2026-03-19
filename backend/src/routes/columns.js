const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');

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

// GET / — 칼럼 목록 (누구나 — 제목 + 요약만)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 15;
    const offset = (page - 1) * limit;
    const category = req.query.category || null;

    let where = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (category) {
      where += ` AND category = $${paramIdx++}`;
      params.push(category);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM expert_columns ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT id, author_name, author_title, title, summary, category, is_premium, views, published_at
       FROM expert_columns
       ${where}
       ORDER BY published_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      params
    );

    const categoriesResult = await pool.query(
      'SELECT DISTINCT category FROM expert_columns WHERE category IS NOT NULL ORDER BY category'
    );

    return res.json({
      columns: result.rows,
      pagination: { page, total, totalPages: Math.ceil(total / limit) },
      categories: categoriesResult.rows.map((r) => r.category),
    });
  } catch (err) {
    console.error('Error fetching columns:', err);
    return res.status(500).json({ error: '칼럼 조회에 실패했습니다.' });
  }
});

// GET /:id — 칼럼 상세
// 누구나 열람 가능하지만, 본문은 플랜에 따라 제한
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query('UPDATE expert_columns SET views = views + 1 WHERE id = $1', [id]);

    const result = await pool.query('SELECT * FROM expert_columns WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '칼럼을 찾을 수 없습니다.' });
    }

    const column = result.rows[0];

    // 플랜 체크: Basic+ → 전체 본문, Free → 요약만
    let userPlan = 'free';
    if (req.user) {
      const userResult = await pool.query(
        `SELECT sp.name FROM users u LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id WHERE u.id = $1`,
        [req.user.id]
      );
      userPlan = userResult.rows[0]?.name || 'free';
    }

    const PLAN_RANK = { free: 0, basic: 1, pro: 2 };
    const rank = PLAN_RANK[userPlan] ?? 0;

    // 프리미엄 칼럼: Pro만
    if (column.is_premium && rank < 2) {
      return res.json({
        column: {
          ...column,
          content: null,
          locked: true,
          lock_reason: 'pro',
        },
      });
    }

    // 일반 칼럼: Basic+ 전체, Free는 요약만
    if (rank < 1) {
      return res.json({
        column: {
          ...column,
          content: null,
          locked: true,
          lock_reason: 'basic',
        },
      });
    }

    return res.json({ column: { ...column, locked: false } });
  } catch (err) {
    console.error('Error fetching column:', err);
    return res.status(500).json({ error: '칼럼 조회에 실패했습니다.' });
  }
});

// POST / — 칼럼 등록 (관리자만)
router.post('/', authMiddleware, async (req, res) => {
  try {
    // 관리자 확인
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows[0]?.role !== 'admin') {
      return res.status(403).json({ error: '관리자만 칼럼을 등록할 수 있습니다.' });
    }

    const { author_name, author_title, title, summary, content, category, is_premium } = req.body;

    if (!title || !content || !author_name) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요.' });
    }

    const result = await pool.query(
      `INSERT INTO expert_columns (author_name, author_title, title, summary, content, category, is_premium)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [author_name, author_title || '', title, summary || '', content, category || null, is_premium || false]
    );

    return res.json({ message: '칼럼이 등록되었습니다.', id: result.rows[0].id });
  } catch (err) {
    console.error('Error creating column:', err);
    return res.status(500).json({ error: '칼럼 등록에 실패했습니다.' });
  }
});

// DELETE /:id — 칼럼 삭제 (관리자만)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows[0]?.role !== 'admin') {
      return res.status(403).json({ error: '관리자만 칼럼을 삭제할 수 있습니다.' });
    }

    await pool.query('DELETE FROM expert_columns WHERE id = $1', [req.params.id]);
    return res.json({ message: '칼럼이 삭제되었습니다.' });
  } catch (err) {
    return res.status(500).json({ error: '칼럼 삭제에 실패했습니다.' });
  }
});

module.exports = router;
