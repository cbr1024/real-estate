// 플랜별 기능 한도
const PLAN_LIMITS = {
  free: {
    favorites: 5,
    alerts: 1,
    tradeHistory: 10,
    statsMonths: 12,
    compare: 0,
    policy: false,
    overlay: false,
    schoolInfo: false,
  },
  basic: {
    favorites: 30,
    alerts: 10,
    tradeHistory: 50,
    statsMonths: 36,
    compare: 2,
    policy: true,
    overlay: false,
    schoolOverlay: true,
    schoolInfo: true,
  },
  pro: {
    favorites: Infinity,
    alerts: Infinity,
    tradeHistory: Infinity,
    statsMonths: 120,
    compare: 3,
    policy: true,
    overlay: true,
    schoolInfo: true,
  },
};

function getLimits(planName) {
  return PLAN_LIMITS[planName] || PLAN_LIMITS.free;
}

async function getUserPlan(pool, userId) {
  const result = await pool.query(
    'SELECT sp.name FROM users u LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id WHERE u.id = $1',
    [userId]
  );
  return result.rows[0]?.name || 'free';
}

module.exports = { PLAN_LIMITS, getLimits, getUserPlan };
