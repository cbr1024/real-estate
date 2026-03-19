const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { getLimits, getUserPlan } = require('../config/planLimits');

const router = express.Router();

// All routes in this file require authentication
router.use(authMiddleware);

// GET /favorites - Get user's favorite apartments
router.get('/favorites', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.name, a.address, a.road_address AS "roadAddress",
              a.lat AS latitude, a.lng AS longitude,
              a.build_year AS "buildYear", a.total_units AS "totalUnits",
              a.dong_count AS "dongCount",
              (SELECT th.price FROM trade_history th
               WHERE th.apartment_id = a.id
               ORDER BY th.trade_date DESC LIMIT 1) AS "latestPrice",
              f.created_at AS "favoritedAt"
       FROM apartments a
       INNER JOIN favorites f ON a.id = f.apartment_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching favorites:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /favorites/:id - Add favorite
router.post('/favorites/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const apartment = await pool.query(
      'SELECT id FROM apartments WHERE id = $1',
      [id]
    );

    if (apartment.rows.length === 0) {
      return res.status(404).json({ error: 'Apartment not found' });
    }

    const existing = await pool.query(
      'SELECT id FROM favorites WHERE user_id = $1 AND apartment_id = $2',
      [req.user.id, id]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Already in favorites' });
    }

    // 플랜별 한도 체크
    const planName = await getUserPlan(pool, req.user.id);
    const limits = getLimits(planName);
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM favorites WHERE user_id = $1', [req.user.id]
    );
    if (countResult.rows[0].cnt >= limits.favorites) {
      return res.status(403).json({
        error: `관심 아파트는 최대 ${limits.favorites}개까지 등록할 수 있습니다. 플랜을 업그레이드해주세요.`,
        limit: limits.favorites,
      });
    }

    await pool.query(
      `INSERT INTO favorites (user_id, apartment_id, created_at)
       VALUES ($1, $2, NOW())`,
      [req.user.id, id]
    );

    return res.status(201).json({ message: 'Added to favorites' });
  } catch (err) {
    console.error('Error adding favorite:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /favorites/:id - Remove favorite
router.delete('/favorites/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM favorites WHERE user_id = $1 AND apartment_id = $2',
      [req.user.id, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Favorite not found' });
    }

    return res.json({ message: 'Removed from favorites' });
  } catch (err) {
    console.error('Error removing favorite:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /location — 내 위치 저장
router.put('/location', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) {
      return res.status(400).json({ error: '위치 정보가 필요합니다.' });
    }
    await pool.query(
      'UPDATE users SET last_lat = $1, last_lng = $2 WHERE id = $3',
      [lat, lng, req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error saving location:', err);
    return res.status(500).json({ error: '위치 저장에 실패했습니다.' });
  }
});

module.exports = router;
