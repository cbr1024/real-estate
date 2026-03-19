const pool = require('../config/database');

const adminMiddleware = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    if (result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }
    next();
  } catch (err) {
    console.error('Admin middleware error:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

module.exports = adminMiddleware;
