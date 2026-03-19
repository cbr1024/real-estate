const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { PLAN_LIMITS } = require('../config/planLimits');

const router = express.Router();

// GET /plans — 전체 플랜 목록 (공개)
router.get('/plans', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, display_name, description, price, sort_order FROM subscription_plans WHERE is_active = TRUE ORDER BY sort_order'
    );
    const plans = result.rows.map((plan) => ({
      ...plan,
      limits: PLAN_LIMITS[plan.name] || PLAN_LIMITS.free,
    }));
    return res.json({ plans });
  } catch (err) {
    console.error('Error fetching plans:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// GET /me — 내 구독 정보
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.subscription_plan_id, u.subscription_started_at, u.subscription_expires_at,
              sp.name AS plan_name, sp.display_name AS plan_display_name, sp.price AS plan_price
       FROM users u
       LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    return res.json({ subscription: result.rows[0] });
  } catch (err) {
    console.error('Error fetching my subscription:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// PUT /me — 내 구독 플랜 변경 (유료 플랜은 /payments 라우트를 통해 결제 후 변경됨)
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const { plan_id } = req.body;
    if (!plan_id) {
      return res.status(400).json({ error: '플랜을 선택해주세요.' });
    }

    const planResult = await pool.query(
      'SELECT id, name, display_name, price FROM subscription_plans WHERE id = $1 AND is_active = TRUE',
      [plan_id]
    );
    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: '유효하지 않은 플랜입니다.' });
    }

    const plan = planResult.rows[0];

    // 유료 플랜은 결제를 통해서만 변경 가능
    if (plan.price > 0) {
      return res.status(400).json({
        error: '유료 플랜은 결제를 통해 변경해주세요.',
        redirect: '/subscription',
      });
    }

    await pool.query(
      `UPDATE users SET subscription_plan_id = $1, subscription_started_at = NOW(), subscription_expires_at = NULL
       WHERE id = $2`,
      [plan_id, req.user.id]
    );

    return res.json({
      message: `${plan.display_name} 플랜으로 변경되었습니다.`,
      subscription: {
        subscription_plan_id: plan.id,
        plan_name: plan.name,
        plan_display_name: plan.display_name,
        subscription_started_at: new Date(),
        subscription_expires_at: null,
      },
    });
  } catch (err) {
    console.error('Error updating subscription:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
