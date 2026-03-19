const pool = require('../config/database');

// 플랜 등급 순서 (높을수록 상위)
const PLAN_RANK = { free: 0, basic: 1, pro: 2 };

const requireSubscription = (requiredPlan) => {
  return async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT sp.name AS plan_name
         FROM users u
         LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
         WHERE u.id = $1`,
        [req.user.id]
      );

      const userPlan = result.rows[0]?.plan_name || 'free';
      const userRank = PLAN_RANK[userPlan] ?? 0;
      const requiredRank = PLAN_RANK[requiredPlan] ?? 0;

      if (userRank < requiredRank) {
        return res.status(403).json({
          error: '구독 플랜 업그레이드가 필요합니다.',
          required_plan: requiredPlan,
          current_plan: userPlan,
        });
      }

      req.userPlan = userPlan;
      next();
    } catch (err) {
      console.error('Subscription middleware error:', err);
      return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  };
};

module.exports = { requireSubscription };
