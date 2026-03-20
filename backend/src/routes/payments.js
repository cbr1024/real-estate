const express = require('express');
const axios = require('axios');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const crypto = require('crypto');

const router = express.Router();

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';
const TOSS_API_URL = 'https://api.tosspayments.com/v1';
const FREE_TRIAL_DAYS = 30;

function getTossAuth() {
  return 'Basic ' + Buffer.from(TOSS_SECRET_KEY + ':').toString('base64');
}

// =============================================
// POST /free-trial — 무료 체험 1개월 (첫 결제 전 1회)
// =============================================
router.post('/free-trial', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { plan_id } = req.body;
    if (!plan_id) return res.status(400).json({ error: '플랜을 선택해주세요.' });

    // 무료 체험 사용 여부 확인
    const userResult = await client.query(
      'SELECT free_trial_used, subscription_plan_id FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userResult.rows[0]?.free_trial_used) {
      return res.status(400).json({ error: '무료 체험은 1회만 가능합니다.' });
    }

    // 플랜 확인
    const planResult = await client.query(
      'SELECT id, name, display_name, price FROM subscription_plans WHERE id = $1 AND is_active = TRUE',
      [plan_id]
    );
    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: '유효하지 않은 플랜입니다.' });
    }
    const plan = planResult.rows[0];
    if (plan.price === 0) {
      return res.status(400).json({ error: '무료 플랜은 체험이 필요 없습니다.' });
    }

    await client.query('BEGIN');

    // 무료 체험 결제 기록
    const orderId = `TRIAL_${req.user.id}_${Date.now()}`;
    await client.query(
      `INSERT INTO payments (user_id, order_id, plan_id, amount, status, is_free_trial, paid_at)
       VALUES ($1, $2, $3, 0, 'paid', TRUE, NOW())`,
      [req.user.id, orderId, plan.id]
    );

    // 구독 적용 (30일)
    await client.query(
      `UPDATE users
       SET subscription_plan_id = $1,
           subscription_started_at = NOW(),
           subscription_expires_at = NOW() + INTERVAL '${FREE_TRIAL_DAYS} days',
           free_trial_used = TRUE
       WHERE id = $2`,
      [plan.id, req.user.id]
    );

    await client.query('COMMIT');

    return res.json({
      message: `${plan.display_name} 플랜 무료 체험이 시작되었습니다! (${FREE_TRIAL_DAYS}일)`,
      subscription: {
        plan_name: plan.name,
        plan_display_name: plan.display_name,
        subscription_started_at: new Date(),
        subscription_expires_at: new Date(Date.now() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000),
        is_free_trial: true,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error starting free trial:', err);
    return res.status(500).json({ error: '무료 체험 시작에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// =============================================
// GET /trial-status — 무료 체험 가능 여부 확인
// =============================================
router.get('/trial-status', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT free_trial_used FROM users WHERE id = $1',
      [req.user.id]
    );
    return res.json({
      eligible: !result.rows[0]?.free_trial_used,
      trial_days: FREE_TRIAL_DAYS,
    });
  } catch (err) {
    return res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

// =============================================
// POST /prepare — 결제 준비 (주문 생성)
// =============================================
router.post('/prepare', authMiddleware, async (req, res) => {
  try {
    const { plan_id } = req.body;
    if (!plan_id) return res.status(400).json({ error: '플랜을 선택해주세요.' });

    const planResult = await pool.query(
      'SELECT id, name, display_name, price FROM subscription_plans WHERE id = $1 AND is_active = TRUE',
      [plan_id]
    );
    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: '유효하지 않은 플랜입니다.' });
    }

    const plan = planResult.rows[0];
    if (plan.price === 0) {
      return res.status(400).json({ error: '무료 플랜은 결제가 필요하지 않습니다.' });
    }

    const userResult = await pool.query(
      'SELECT subscription_plan_id FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userResult.rows[0]?.subscription_plan_id === plan.id) {
      return res.status(400).json({ error: '이미 사용 중인 플랜입니다.' });
    }

    const orderId = `ORDER_${req.user.id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    await pool.query(
      `INSERT INTO payments (user_id, order_id, plan_id, amount, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [req.user.id, orderId, plan.id, plan.price]
    );

    return res.json({
      orderId,
      amount: plan.price,
      orderName: `${plan.display_name} 플랜 (월간)`,
      customerName: req.user.username || req.user.nickname || '',
    });
  } catch (err) {
    console.error('Error preparing payment:', err);
    return res.status(500).json({ error: '결제 준비에 실패했습니다.' });
  }
});

// =============================================
// POST /confirm — 결제 승인
// =============================================
router.post('/confirm', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { paymentKey, orderId, amount } = req.body;
    if (!paymentKey || !orderId || !amount) {
      return res.status(400).json({ error: '필수 파라미터가 누락되었습니다.' });
    }

    const orderResult = await client.query(
      `SELECT p.*, sp.name AS plan_name, sp.display_name AS plan_display_name
       FROM payments p JOIN subscription_plans sp ON p.plan_id = sp.id
       WHERE p.order_id = $1 AND p.user_id = $2 AND p.status = 'pending'`,
      [orderId, req.user.id]
    );
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: '유효하지 않은 주문입니다.' });
    }

    const order = orderResult.rows[0];
    if (order.amount !== parseInt(amount, 10)) {
      return res.status(400).json({ error: '결제 금액이 일치하지 않습니다.' });
    }

    const tossResponse = await axios.post(
      `${TOSS_API_URL}/payments/confirm`,
      { paymentKey, orderId, amount: parseInt(amount, 10) },
      { headers: { Authorization: getTossAuth(), 'Content-Type': 'application/json' } }
    );
    const paymentData = tossResponse.data;

    await client.query('BEGIN');

    await client.query(
      `UPDATE payments SET payment_key = $1, status = 'paid', method = $2, paid_at = NOW(), receipt_url = $3
       WHERE order_id = $4`,
      [paymentKey, paymentData.method || '', paymentData.receipt?.url || '', orderId]
    );

    await client.query(
      `UPDATE users SET subscription_plan_id = $1, subscription_started_at = NOW(),
       subscription_expires_at = NOW() + INTERVAL '30 days' WHERE id = $2`,
      [order.plan_id, req.user.id]
    );

    await client.query('COMMIT');

    return res.json({
      message: `${order.plan_display_name} 플랜 결제가 완료되었습니다.`,
      subscription: {
        plan_name: order.plan_name,
        plan_display_name: order.plan_display_name,
        subscription_started_at: new Date(),
        subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      receipt_url: paymentData.receipt?.url || null,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.response?.data) {
      const tossError = err.response.data;
      if (req.body.orderId) {
        await pool.query(
          `UPDATE payments SET status = 'failed', cancel_reason = $1 WHERE order_id = $2`,
          [tossError.message || '결제 실패', req.body.orderId]
        ).catch(() => {});
      }
      return res.status(400).json({ error: tossError.message || '결제 승인에 실패했습니다.' });
    }
    return res.status(500).json({ error: '결제 승인에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// =============================================
// GET /history — 내 결제 내역
// =============================================
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.order_id, p.amount, p.status, p.method, p.paid_at, p.created_at,
              p.receipt_url, p.is_free_trial, p.cancel_reason, p.refund_amount, p.refunded_by,
              p.cancelled_at, sp.display_name AS plan_name
       FROM payments p JOIN subscription_plans sp ON p.plan_id = sp.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC LIMIT 20`,
      [req.user.id]
    );
    return res.json({ payments: result.rows });
  } catch (err) {
    return res.status(500).json({ error: '결제 내역 조회에 실패했습니다.' });
  }
});

// =============================================
// POST /refund — 사용자 환불 요청
// =============================================
router.post('/refund', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { payment_id, reason } = req.body;
    if (!payment_id) return res.status(400).json({ error: '결제 ID가 필요합니다.' });

    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE id = $1 AND user_id = $2 AND status = 'paid' AND is_free_trial = FALSE`,
      [payment_id, req.user.id]
    );
    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: '환불 가능한 결제를 찾을 수 없습니다.' });
    }

    const payment = paymentResult.rows[0];

    // 환불 금액 계산 (사용일수 비례 차감)
    const paidAt = new Date(payment.paid_at);
    const now = new Date();
    const usedDays = Math.floor((now - paidAt) / (1000 * 60 * 60 * 24));
    const totalDays = 30;
    const remainingDays = Math.max(0, totalDays - usedDays);
    const refundAmount = Math.floor(payment.amount * (remainingDays / totalDays));

    if (refundAmount <= 0) {
      return res.status(400).json({ error: '사용 기간이 만료되어 환불이 불가합니다.' });
    }

    // 토스페이먼츠 부분 취소
    if (payment.payment_key) {
      await axios.post(
        `${TOSS_API_URL}/payments/${payment.payment_key}/cancel`,
        { cancelReason: reason || '사용자 환불 요청', cancelAmount: refundAmount },
        { headers: { Authorization: getTossAuth(), 'Content-Type': 'application/json' } }
      );
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE payments SET status = 'refunded', cancelled_at = NOW(), cancel_reason = $1,
       refund_amount = $2, refunded_by = 'user' WHERE id = $3`,
      [reason || '사용자 환불 요청', refundAmount, payment.id]
    );

    // 무료 플랜으로 다운그레이드
    const freePlan = await client.query("SELECT id FROM subscription_plans WHERE name = 'free'");
    if (freePlan.rows.length > 0) {
      await client.query(
        `UPDATE users SET subscription_plan_id = $1, subscription_expires_at = NULL WHERE id = $2`,
        [freePlan.rows[0].id, req.user.id]
      );
    }

    await client.query('COMMIT');

    return res.json({
      message: `환불이 완료되었습니다. (환불 금액: ₩${refundAmount.toLocaleString()})`,
      refund_amount: refundAmount,
      used_days: usedDays,
      original_amount: payment.amount,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error refunding:', err);
    return res.status(500).json({ error: '환불 처리에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// =============================================
// POST /admin/refund — 관리자 환불 (전액/부분)
// =============================================
router.post('/admin/refund', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { payment_id, reason, refund_amount: customAmount } = req.body;
    if (!payment_id) return res.status(400).json({ error: '결제 ID가 필요합니다.' });

    const paymentResult = await client.query(
      `SELECT p.*, u.id AS uid FROM payments p JOIN users u ON p.user_id = u.id
       WHERE p.id = $1 AND p.status = 'paid'`,
      [payment_id]
    );
    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: '환불 가능한 결제를 찾을 수 없습니다.' });
    }

    const payment = paymentResult.rows[0];
    const refundAmount = customAmount ? Math.min(customAmount, payment.amount) : payment.amount;

    // 토스페이먼츠 취소 (무료 체험은 결제키 없음)
    if (payment.payment_key) {
      await axios.post(
        `${TOSS_API_URL}/payments/${payment.payment_key}/cancel`,
        { cancelReason: reason || '관리자 환불', cancelAmount: refundAmount },
        { headers: { Authorization: getTossAuth(), 'Content-Type': 'application/json' } }
      );
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE payments SET status = 'refunded', cancelled_at = NOW(), cancel_reason = $1,
       refund_amount = $2, refunded_by = 'admin' WHERE id = $3`,
      [reason || '관리자 환불', refundAmount, payment.id]
    );

    const freePlan = await client.query("SELECT id FROM subscription_plans WHERE name = 'free'");
    if (freePlan.rows.length > 0) {
      await client.query(
        `UPDATE users SET subscription_plan_id = $1, subscription_expires_at = NULL WHERE id = $2`,
        [freePlan.rows[0].id, payment.uid]
      );
    }

    await client.query('COMMIT');

    return res.json({
      message: `관리자 환불 완료 (₩${refundAmount.toLocaleString()})`,
      refund_amount: refundAmount,
      user_id: payment.uid,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error admin refunding:', err);
    return res.status(500).json({ error: '환불 처리에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// =============================================
// GET /admin/payments — 관리자 전체 결제 내역
// =============================================
router.get('/admin/payments', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const status = req.query.status || '';

    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;
    if (status) { where += ` AND p.status = $${idx++}`; params.push(status); }

    const countResult = await pool.query(`SELECT COUNT(*) FROM payments p ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT p.id, p.order_id, p.amount, p.status, p.method, p.paid_at, p.created_at,
              p.is_free_trial, p.cancel_reason, p.refund_amount, p.refunded_by, p.cancelled_at,
              sp.display_name AS plan_name, u.email, u.nickname
       FROM payments p
       JOIN subscription_plans sp ON p.plan_id = sp.id
       JOIN users u ON p.user_id = u.id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params
    );

    return res.json({
      payments: result.rows,
      pagination: { page, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return res.status(500).json({ error: '결제 내역 조회에 실패했습니다.' });
  }
});

// =============================================
// POST /free-downgrade — 무료 플랜으로 변경
// =============================================
router.post('/free-downgrade', authMiddleware, async (req, res) => {
  try {
    const freePlan = await pool.query("SELECT id FROM subscription_plans WHERE name = 'free'");
    if (freePlan.rows.length === 0) {
      return res.status(500).json({ error: '무료 플랜을 찾을 수 없습니다.' });
    }

    await pool.query(
      `UPDATE users SET subscription_plan_id = $1, subscription_started_at = NOW(), subscription_expires_at = NULL WHERE id = $2`,
      [freePlan.rows[0].id, req.user.id]
    );

    return res.json({
      message: '무료 플랜으로 변경되었습니다.',
      subscription: { plan_name: 'free', plan_display_name: '무료' },
    });
  } catch (err) {
    return res.status(500).json({ error: '플랜 변경에 실패했습니다.' });
  }
});

module.exports = router;
