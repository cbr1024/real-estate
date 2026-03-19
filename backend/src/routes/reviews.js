const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

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

const CATEGORY_FIELDS = ['rating_transport', 'rating_environment', 'rating_facilities', 'rating_parking', 'rating_education'];
const CATEGORY_LABELS = { rating_transport: '교통', rating_environment: '환경', rating_facilities: '편의시설', rating_parking: '주차', rating_education: '교육' };

// GET /apartment/:id — 아파트 리뷰 목록
router.get('/apartment/:id', optionalAuth, async (req, res) => {
  try {
    const apartmentId = parseInt(req.params.id, 10);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const sort = req.query.sort || 'recent'; // recent, rating_high, rating_low, helpful
    const limit = 20;
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM apartment_reviews WHERE apartment_id = $1 AND reported = FALSE',
      [apartmentId]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    let orderBy = 'r.created_at DESC';
    if (sort === 'rating_high') orderBy = 'r.rating DESC, r.created_at DESC';
    else if (sort === 'rating_low') orderBy = 'r.rating ASC, r.created_at DESC';
    else if (sort === 'helpful') orderBy = 'r.helpful_count DESC, r.created_at DESC';

    const result = await pool.query(
      `SELECT r.id, r.rating, r.pros, r.cons, r.content,
              r.rating_transport, r.rating_environment, r.rating_facilities,
              r.rating_parking, r.rating_education,
              r.helpful_count, r.residence_period, r.likes, r.created_at,
              u.nickname, u.id AS user_id
       FROM apartment_reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.apartment_id = $1 AND r.reported = FALSE
       ORDER BY ${orderBy}
       LIMIT $2 OFFSET $3`,
      [apartmentId, limit, offset]
    );

    // 평균 별점 & 분포
    const statsResult = await pool.query(
      `SELECT
         ROUND(AVG(rating)::numeric, 1) AS avg_rating,
         COUNT(*) AS total_count,
         COUNT(*) FILTER (WHERE rating = 5) AS star_5,
         COUNT(*) FILTER (WHERE rating = 4) AS star_4,
         COUNT(*) FILTER (WHERE rating = 3) AS star_3,
         COUNT(*) FILTER (WHERE rating = 2) AS star_2,
         COUNT(*) FILTER (WHERE rating = 1) AS star_1,
         ROUND(AVG(rating_transport)::numeric, 1) AS avg_transport,
         ROUND(AVG(rating_environment)::numeric, 1) AS avg_environment,
         ROUND(AVG(rating_facilities)::numeric, 1) AS avg_facilities,
         ROUND(AVG(rating_parking)::numeric, 1) AS avg_parking,
         ROUND(AVG(rating_education)::numeric, 1) AS avg_education
       FROM apartment_reviews WHERE apartment_id = $1 AND reported = FALSE`,
      [apartmentId]
    );

    // 현재 유저가 도움돼요 누른 리뷰 ID 목록
    let helpfulSet = new Set();
    if (req.user) {
      const helpfulResult = await pool.query(
        `SELECT review_id FROM review_helpful WHERE user_id = $1 AND review_id = ANY($2::int[])`,
        [req.user.id, result.rows.map((r) => r.id)]
      );
      helpfulSet = new Set(helpfulResult.rows.map((r) => r.review_id));
    }

    const reviews = result.rows.map((r) => ({
      ...r,
      nickname: r.nickname || '익명',
      is_mine: req.user?.id === r.user_id,
      is_helpful: helpfulSet.has(r.id),
    }));

    return res.json({
      reviews,
      stats: statsResult.rows[0],
      pagination: { page, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error fetching reviews:', err);
    return res.status(500).json({ error: '리뷰 조회에 실패했습니다.' });
  }
});

// POST /apartment/:id — 리뷰 작성
router.post('/apartment/:id', authMiddleware, async (req, res) => {
  try {
    const apartmentId = parseInt(req.params.id, 10);
    const { rating, pros, cons, content, rating_transport, rating_environment, rating_facilities, rating_parking, rating_education, residence_period } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: '종합 별점은 1~5 사이로 입력해주세요.' });
    }
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ error: '리뷰는 최소 10자 이상 작성해주세요.' });
    }

    const result = await pool.query(
      `INSERT INTO apartment_reviews
         (user_id, apartment_id, rating, pros, cons, content,
          rating_transport, rating_environment, rating_facilities, rating_parking, rating_education,
          residence_period)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id, apartment_id) DO UPDATE SET
         rating = EXCLUDED.rating, pros = EXCLUDED.pros, cons = EXCLUDED.cons,
         content = EXCLUDED.content,
         rating_transport = EXCLUDED.rating_transport, rating_environment = EXCLUDED.rating_environment,
         rating_facilities = EXCLUDED.rating_facilities, rating_parking = EXCLUDED.rating_parking,
         rating_education = EXCLUDED.rating_education, residence_period = EXCLUDED.residence_period,
         updated_at = NOW()
       RETURNING id`,
      [req.user.id, apartmentId, rating, pros || '', cons || '', content.trim(),
       rating_transport || null, rating_environment || null, rating_facilities || null,
       rating_parking || null, rating_education || null, residence_period || null]
    );

    return res.json({ message: '리뷰가 등록되었습니다.', id: result.rows[0].id });
  } catch (err) {
    console.error('Error creating review:', err);
    return res.status(500).json({ error: '리뷰 등록에 실패했습니다.' });
  }
});

// POST /:id/helpful — 도움돼요 토글
router.post('/:id/helpful', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const reviewId = parseInt(req.params.id, 10);
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT id FROM review_helpful WHERE review_id = $1 AND user_id = $2',
      [reviewId, req.user.id]
    );

    if (existing.rows.length > 0) {
      await client.query('DELETE FROM review_helpful WHERE review_id = $1 AND user_id = $2', [reviewId, req.user.id]);
      await client.query('UPDATE apartment_reviews SET helpful_count = GREATEST(helpful_count - 1, 0) WHERE id = $1', [reviewId]);
      await client.query('COMMIT');
      return res.json({ helpful: false });
    } else {
      await client.query('INSERT INTO review_helpful (review_id, user_id) VALUES ($1, $2)', [reviewId, req.user.id]);
      await client.query('UPDATE apartment_reviews SET helpful_count = helpful_count + 1 WHERE id = $1', [reviewId]);
      await client.query('COMMIT');
      return res.json({ helpful: true });
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error toggling helpful:', err);
    return res.status(500).json({ error: '처리에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// DELETE /:id — 내 리뷰 삭제
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM apartment_reviews WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '리뷰를 찾을 수 없습니다.' });
    }
    return res.json({ message: '리뷰가 삭제되었습니다.' });
  } catch (err) {
    return res.status(500).json({ error: '리뷰 삭제에 실패했습니다.' });
  }
});

// POST /:id/report — 리뷰 신고
router.post('/:id/report', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE apartment_reviews SET reported = TRUE WHERE id = $1', [req.params.id]);
    return res.json({ message: '신고가 접수되었습니다.' });
  } catch (err) {
    return res.status(500).json({ error: '신고 처리에 실패했습니다.' });
  }
});

module.exports = router;
