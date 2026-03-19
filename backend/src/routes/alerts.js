const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { getLimits, getUserPlan } = require('../config/planLimits');

const router = express.Router();
router.use(authMiddleware);

// GET / — 내 알림 목록
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pa.id, pa.apartment_id, pa.alert_type, pa.target_price, pa.is_active, pa.created_at,
              a.name AS apartment_name, a.address AS apartment_address
       FROM price_alerts pa
       JOIN apartments a ON pa.apartment_id = a.id
       WHERE pa.user_id = $1
       ORDER BY pa.created_at DESC`,
      [req.user.id]
    );
    return res.json({ alerts: result.rows });
  } catch (err) {
    console.error('Error fetching alerts:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// GET /apartment/:apartmentId — 특정 아파트에 대한 내 알림
router.get('/apartment/:apartmentId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, alert_type, target_price, is_active FROM price_alerts WHERE user_id = $1 AND apartment_id = $2',
      [req.user.id, req.params.apartmentId]
    );
    return res.json({ alert: result.rows[0] || null });
  } catch (err) {
    console.error('Error fetching alert:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// POST / — 알림 등록
router.post('/', async (req, res) => {
  try {
    const { apartment_id, alert_type = 'any', target_price } = req.body;
    if (!apartment_id) {
      return res.status(400).json({ error: '아파트를 선택해주세요.' });
    }

    // 플랜별 한도 체크 (기존 알림 업데이트가 아닌 신규 등록 시)
    const existingAlert = await pool.query(
      'SELECT id FROM price_alerts WHERE user_id = $1 AND apartment_id = $2', [req.user.id, apartment_id]
    );
    if (existingAlert.rows.length === 0) {
      const planName = await getUserPlan(pool, req.user.id);
      const limits = getLimits(planName);
      const countResult = await pool.query(
        'SELECT COUNT(*)::int AS cnt FROM price_alerts WHERE user_id = $1 AND is_active = TRUE', [req.user.id]
      );
      if (countResult.rows[0].cnt >= limits.alerts) {
        return res.status(403).json({
          error: `시세 알림은 최대 ${limits.alerts}개까지 등록할 수 있습니다. 플랜을 업그레이드해주세요.`,
          limit: limits.alerts,
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO price_alerts (user_id, apartment_id, alert_type, target_price)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, apartment_id)
       DO UPDATE SET alert_type = $3, target_price = $4, is_active = TRUE
       RETURNING id, alert_type, target_price, is_active`,
      [req.user.id, apartment_id, alert_type, target_price || null]
    );

    return res.status(201).json({ alert: result.rows[0], message: '시세 알림이 등록되었습니다.' });
  } catch (err) {
    console.error('Error creating alert:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// DELETE /:id — 알림 삭제
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM price_alerts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    return res.json({ message: '알림이 삭제되었습니다.' });
  } catch (err) {
    console.error('Error deleting alert:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// PUT /:id/toggle — 알림 활성/비활성 토글
router.put('/:id/toggle', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE price_alerts SET is_active = NOT is_active
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_active`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '알림을 찾을 수 없습니다.' });
    }
    return res.json({ alert: result.rows[0] });
  } catch (err) {
    console.error('Error toggling alert:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
