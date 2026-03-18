const jwt = require('jsonwebtoken');
const redis = require('../config/redis');

const authMiddleware = async (req, res, next) => {
  try {
    // 1순위: HttpOnly 쿠키, 2순위: Authorization 헤더 (하위 호환)
    const token = req.cookies?.access_token
      || (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.split(' ')[1]);

    if (!token) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: '로그아웃된 세션입니다.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'token_expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
    }
    return res.status(500).json({ error: '인증 처리 중 오류가 발생했습니다.' });
  }
};

module.exports = authMiddleware;
