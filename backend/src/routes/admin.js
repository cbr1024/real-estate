const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { getUsageStats } = require('../services/apiUsageTracker');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

// GET /stats — 대시보드 통계
router.get('/stats', async (req, res) => {
  try {
    const [usersR, tradesR, alertsR, plansR, visitsR, loginsR, visitsDailyR, loginsDailyR] = await Promise.all([
      pool.query(`SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::int AS new_7d,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')::int AS new_30d
       FROM users`),
      pool.query(`SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::int AS new_7d
       FROM trade_history`),
      pool.query('SELECT COUNT(*)::int AS total FROM price_alerts WHERE is_active = TRUE'),
      pool.query(`SELECT sp.display_name,
              COUNT(u.id) FILTER (WHERE u.role IS DISTINCT FROM 'admin')::int AS count
       FROM subscription_plans sp
       LEFT JOIN users u ON u.subscription_plan_id = sp.id
       GROUP BY sp.id, sp.display_name, sp.sort_order
       ORDER BY sp.sort_order`),
      // 방문자 통계
      pool.query(`SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT visitor_id) FILTER (WHERE visited_at >= CURRENT_DATE)::int AS today,
        COUNT(DISTINCT visitor_id) FILTER (WHERE visited_at >= CURRENT_DATE - INTERVAL '7 days')::int AS week,
        COUNT(DISTINCT visitor_id) FILTER (WHERE visited_at >= CURRENT_DATE - INTERVAL '30 days')::int AS month
       FROM site_visits`).catch(() => ({ rows: [{ total: 0, today: 0, week: 0, month: 0 }] })),
      // 로그인 통계
      pool.query(`SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT user_id) FILTER (WHERE logged_in_at >= CURRENT_DATE)::int AS today,
        COUNT(DISTINCT user_id) FILTER (WHERE logged_in_at >= CURRENT_DATE - INTERVAL '7 days')::int AS week,
        COUNT(DISTINCT user_id) FILTER (WHERE logged_in_at >= CURRENT_DATE - INTERVAL '30 days')::int AS month
       FROM login_logs`).catch(() => ({ rows: [{ total: 0, today: 0, week: 0, month: 0 }] })),
      // 최근 14일 방문자 추이
      pool.query(`SELECT
        d::date AS date,
        COUNT(DISTINCT sv.visitor_id)::int AS visitors
       FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, '1 day') d
       LEFT JOIN site_visits sv ON sv.visited_at::date = d::date
       GROUP BY d::date ORDER BY d::date`).catch(() => ({ rows: [] })),
      // 최근 14일 로그인 추이
      pool.query(`SELECT
        d::date AS date,
        COUNT(DISTINCT ll.user_id)::int AS logins
       FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, '1 day') d
       LEFT JOIN login_logs ll ON ll.logged_in_at::date = d::date
       GROUP BY d::date ORDER BY d::date`).catch(() => ({ rows: [] })),
    ]);

    return res.json({
      users: usersR.rows[0],
      trades: tradesR.rows[0],
      alerts: alertsR.rows[0],
      planDistribution: plansR.rows,
      visits: visitsR.rows[0],
      logins: loginsR.rows[0],
      visitsDailyTrend: visitsDailyR.rows,
      loginsDailyTrend: loginsDailyR.rows,
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// GET /users — 사용자 목록 (검색, 페이지네이션)
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const planFilter = req.query.plan || '';

    let whereClause = '';
    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(u.email ILIKE $${idx} OR u.nickname ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (planFilter) {
      conditions.push(`sp.name = $${idx}`);
      params.push(planFilter);
      idx++;
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM users u LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT u.id, u.email, u.nickname, u.role, u.provider, u.created_at,
              u.subscription_plan_id, u.subscription_started_at,
              sp.name AS plan_name, sp.display_name AS plan_display_name,
              (SELECT COUNT(*)::int FROM favorites f WHERE f.user_id = u.id) AS favorite_count,
              (SELECT COUNT(*)::int FROM price_alerts pa WHERE pa.user_id = u.id AND pa.is_active = TRUE) AS alert_count
       FROM users u
       LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
       ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    return res.json({
      users: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// PUT /users/:id/subscription — 구독 플랜 변경
router.put('/users/:id/subscription', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { plan_id } = req.body;

    if (!plan_id) return res.status(400).json({ error: '플랜을 선택해주세요.' });

    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    const planResult = await pool.query(
      'SELECT id, name, display_name FROM subscription_plans WHERE id = $1 AND is_active = TRUE', [plan_id]
    );
    if (planResult.rows.length === 0) return res.status(404).json({ error: '유효하지 않은 플랜입니다.' });

    await pool.query(
      'UPDATE users SET subscription_plan_id = $1, subscription_started_at = NOW() WHERE id = $2',
      [plan_id, userId]
    );

    return res.json({ message: `${planResult.rows[0].display_name} 플랜으로 변경되었습니다.` });
  } catch (err) {
    console.error('Error updating subscription:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// PUT /users/:id/role — 역할 변경
router.put('/users/:id/role', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: '유효하지 않은 역할입니다.' });
    }

    // 자기 자신의 admin 권한은 해제 불가
    if (userId === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: '자신의 관리자 권한은 해제할 수 없습니다.' });
    }

    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
    return res.json({ message: `역할이 ${role}(으)로 변경되었습니다.` });
  } catch (err) {
    console.error('Error updating role:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// GET /api-usage — 네이버 API 사용량 통계
router.get('/api-usage', async (req, res) => {
  try {
    const usage = await getUsageStats();
    return res.json(usage);
  } catch (err) {
    console.error('Error fetching API usage:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
