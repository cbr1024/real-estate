const express = require('express');
const axios = require('axios');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';
const TOSS_API_URL = 'https://api.tosspayments.com/v1';

function getTossAuth() {
  return 'Basic ' + Buffer.from(TOSS_SECRET_KEY + ':').toString('base64');
}

// POST /prepare — 결제 준비 (주문 생성)
router.post('/prepare', authMiddleware, async (req, res) => {
  try {
    const { plan_id } = req.body;
    if (!plan_id) {
      return res.status(400).json({ error: '플랜을 선택해주세요.' });
    }

    // 플랜 조회
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

    // 이미 같은 플랜이면 거부
    const userResult = await pool.query(
      'SELECT subscription_plan_id FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userResult.rows[0]?.subscription_plan_id === plan.id) {
      return res.status(400).json({ error: '이미 사용 중인 플랜입니다.' });
    }

    // 주문 ID 생성
    const orderId = `ORDER_${req.user.id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // 결제 레코드 생성
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

// POST /confirm — 결제 승인 (토스페이먼츠 콜백 후)
router.post('/confirm', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { paymentKey, orderId, amount } = req.body;

    if (!paymentKey || !orderId || !amount) {
      return res.status(400).json({ error: '필수 파라미터가 누락되었습니다.' });
    }

    // 주문 확인
    const orderResult = await client.query(
      `SELECT p.*, sp.name AS plan_name, sp.display_name AS plan_display_name
       FROM payments p
       JOIN subscription_plans sp ON p.plan_id = sp.id
       WHERE p.order_id = $1 AND p.user_id = $2 AND p.status = 'pending'`,
      [orderId, req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: '유효하지 않은 주문입니다.' });
    }

    const order = orderResult.rows[0];

    // 금액 검증
    if (order.amount !== parseInt(amount, 10)) {
      return res.status(400).json({ error: '결제 금액이 일치하지 않습니다.' });
    }

    // 토스페이먼츠 결제 승인 API 호출
    const tossResponse = await axios.post(
      `${TOSS_API_URL}/payments/confirm`,
      { paymentKey, orderId, amount: parseInt(amount, 10) },
      {
        headers: {
          Authorization: getTossAuth(),
          'Content-Type': 'application/json',
        },
      }
    );

    const paymentData = tossResponse.data;

    await client.query('BEGIN');

    // 결제 정보 업데이트
    await client.query(
      `UPDATE payments
       SET payment_key = $1, status = 'paid', method = $2, paid_at = NOW(), receipt_url = $3
       WHERE order_id = $4`,
      [paymentKey, paymentData.method || '', paymentData.receipt?.url || '', orderId]
    );

    // 구독 플랜 업데이트
    await client.query(
      `UPDATE users
       SET subscription_plan_id = $1,
           subscription_started_at = NOW(),
           subscription_expires_at = NOW() + INTERVAL '30 days'
       WHERE id = $2`,
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

    // 토스 API 에러 처리
    if (err.response?.data) {
      const tossError = err.response.data;
      console.error('Toss payment error:', tossError);

      // 결제 실패 기록
      if (req.body.orderId) {
        await pool.query(
          `UPDATE payments SET status = 'failed', cancel_reason = $1 WHERE order_id = $2`,
          [tossError.message || '결제 실패', req.body.orderId]
        ).catch(() => {});
      }

      return res.status(400).json({
        error: tossError.message || '결제 승인에 실패했습니다.',
        code: tossError.code,
      });
    }

    console.error('Error confirming payment:', err);
    return res.status(500).json({ error: '결제 승인에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// GET /history — 내 결제 내역
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.order_id, p.amount, p.status, p.method, p.paid_at, p.created_at,
              p.receipt_url, sp.display_name AS plan_name
       FROM payments p
       JOIN subscription_plans sp ON p.plan_id = sp.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT 20`,
      [req.user.id]
    );
    return res.json({ payments: result.rows });
  } catch (err) {
    console.error('Error fetching payment history:', err);
    return res.status(500).json({ error: '결제 내역 조회에 실패했습니다.' });
  }
});

// POST /cancel — 결제 취소 (환불)
router.post('/cancel', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { payment_id, reason } = req.body;

    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE id = $1 AND user_id = $2 AND status = 'paid'`,
      [payment_id, req.user.id]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: '취소 가능한 결제를 찾을 수 없습니다.' });
    }

    const payment = paymentResult.rows[0];

    // 토스페이먼츠 취소 API
    await axios.post(
      `${TOSS_API_URL}/payments/${payment.payment_key}/cancel`,
      { cancelReason: reason || '사용자 요청' },
      {
        headers: {
          Authorization: getTossAuth(),
          'Content-Type': 'application/json',
        },
      }
    );

    await client.query('BEGIN');

    // 결제 상태 업데이트
    await client.query(
      `UPDATE payments SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $1 WHERE id = $2`,
      [reason || '사용자 요청', payment.id]
    );

    // 무료 플랜으로 다운그레이드
    const freePlan = await client.query(
      "SELECT id FROM subscription_plans WHERE name = 'free'"
    );
    if (freePlan.rows.length > 0) {
      await client.query(
        `UPDATE users SET subscription_plan_id = $1, subscription_expires_at = NULL WHERE id = $2`,
        [freePlan.rows[0].id, req.user.id]
      );
    }

    await client.query('COMMIT');

    return res.json({ message: '결제가 취소되었습니다.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error cancelling payment:', err);
    return res.status(500).json({ error: '결제 취소에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// POST /free-downgrade — 무료 플랜으로 변경 (결제 불필요)
router.post('/free-downgrade', authMiddleware, async (req, res) => {
  try {
    const freePlan = await pool.query(
      "SELECT id FROM subscription_plans WHERE name = 'free'"
    );
    if (freePlan.rows.length === 0) {
      return res.status(500).json({ error: '무료 플랜을 찾을 수 없습니다.' });
    }

    await pool.query(
      `UPDATE users SET subscription_plan_id = $1, subscription_started_at = NOW(), subscription_expires_at = NULL WHERE id = $2`,
      [freePlan.rows[0].id, req.user.id]
    );

    return res.json({
      message: '무료 플랜으로 변경되었습니다.',
      subscription: {
        plan_name: 'free',
        plan_display_name: '무료',
        subscription_started_at: new Date(),
        subscription_expires_at: null,
      },
    });
  } catch (err) {
    console.error('Error downgrading to free:', err);
    return res.status(500).json({ error: '플랜 변경에 실패했습니다.' });
  }
});

module.exports = router;
