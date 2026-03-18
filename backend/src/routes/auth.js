const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const redis = require('../config/redis');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/mailer');

const router = express.Router();

// ── 토큰 설정 ──
const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_EXPIRES = '7d';
const COOKIE_OPTIONS = {
  httpOnly: true,     // JS에서 접근 불가 (XSS 방어)
  secure: process.env.NODE_ENV === 'production',  // HTTPS만 (개발 시 false)
  sameSite: 'strict', // CSRF 방어
  path: '/',
};

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, nickname: user.nickname },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES }
  );
}

function setTokenCookies(res, accessToken, refreshToken) {
  res.cookie('access_token', accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 15 * 60 * 1000, // 15분
  });
  res.cookie('refresh_token', refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
    path: '/api/auth', // auth 경로에서만 전송
  });
}

function clearTokenCookies(res) {
  res.clearCookie('access_token', { ...COOKIE_OPTIONS });
  res.clearCookie('refresh_token', { ...COOKIE_OPTIONS, path: '/api/auth' });
}

// ── 로그인 시도 제한 (5회 실패 → 5분 잠금) ──
async function checkLoginAttempts(ip, email) {
  const key = `login_attempts:${ip}:${email}`;
  const attempts = parseInt(await redis.get(key) || '0', 10);
  if (attempts >= 5) {
    const ttl = await redis.ttl(key);
    return { blocked: true, remainingSec: ttl };
  }
  return { blocked: false, attempts };
}

async function recordLoginFailure(ip, email) {
  const key = `login_attempts:${ip}:${email}`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, 300); // 5분
  }
}

async function clearLoginAttempts(ip, email) {
  await redis.del(`login_attempts:${ip}:${email}`);
}

// ── POST /register ──
router.post('/register', async (req, res) => {
  try {
    const { email, password, nickname } = req.body;
    if (!email || !password || !nickname) {
      return res.status(400).json({ error: '모든 항목을 입력해주세요.' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: '이미 등록된 아이디입니다.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO users (email, password, nickname, email_verified, verify_token, verify_token_expires, created_at)
       VALUES ($1, $2, $3, FALSE, $4, $5, NOW())`,
      [email, hashedPassword, nickname, verifyToken, verifyExpires]
    );

    try { await sendVerificationEmail(email, verifyToken); } catch (e) {
      console.error('Failed to send verification email:', e.message);
    }

    return res.status(201).json({
      message: '회원가입이 완료되었습니다. 이메일을 확인하여 인증을 완료해주세요.',
      needVerification: true,
    });
  } catch (err) {
    console.error('Error registering user:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── GET /verify-email ──
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: '인증 토큰이 없습니다.' });

    let result = await pool.query(
      'SELECT id, email_verified, verify_token_expires FROM users WHERE verify_token = $1', [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: '유효하지 않은 인증 링크입니다. 이미 인증되었거나 만료된 링크입니다.' });
    }

    const user = result.rows[0];
    if (user.email_verified) {
      return res.json({ message: '이메일 인증이 완료되었습니다. 로그인해주세요.' });
    }
    if (new Date() > new Date(user.verify_token_expires)) {
      return res.status(400).json({ error: '인증 링크가 만료되었습니다. 인증 메일을 다시 요청해주세요.' });
    }

    await pool.query(
      'UPDATE users SET email_verified = TRUE WHERE id = $1', [user.id]
    );
    return res.json({ message: '이메일 인증이 완료되었습니다. 로그인해주세요.' });
  } catch (err) {
    console.error('Error verifying email:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── POST /resend-verification ──
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: '이메일을 입력해주세요.' });

    const result = await pool.query('SELECT id, email_verified FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '등록되지 않은 아이디입니다.' });
    }
    if (result.rows[0].email_verified) {
      return res.json({ message: '이미 인증이 완료된 계정입니다.' });
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query('UPDATE users SET verify_token = $1, verify_token_expires = $2 WHERE id = $3',
      [verifyToken, verifyExpires, result.rows[0].id]);

    try { await sendVerificationEmail(email, verifyToken); } catch (e) {
      console.error('Failed to resend verification email:', e.message);
    }
    return res.json({ message: '인증 메일이 재발송되었습니다.' });
  } catch (err) {
    console.error('Error resending verification:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── POST /login — 로그인 시도 제한 + HttpOnly 쿠키 ──
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요.' });
    }

    const ip = req.ip;

    // 로그인 시도 횟수 확인
    const { blocked, remainingSec } = await checkLoginAttempts(ip, email);
    if (blocked) {
      const min = Math.ceil(remainingSec / 60);
      return res.status(429).json({
        error: `로그인 시도가 너무 많습니다. ${min}분 후 다시 시도해주세요.`,
      });
    }

    const result = await pool.query(
      'SELECT id, email, nickname, password, email_verified FROM users WHERE email = $1', [email]
    );

    if (result.rows.length === 0) {
      await recordLoginFailure(ip, email);
      return res.status(404).json({ error: '존재하지 않는 아이디입니다. 회원가입을 진행해주세요.' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      await recordLoginFailure(ip, email);
      const { attempts } = await checkLoginAttempts(ip, email);
      const remaining = 5 - (attempts || 0);
      return res.status(401).json({
        error: `비밀번호가 일치하지 않습니다. (남은 시도: ${remaining > 0 ? remaining : 0}회)`,
      });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        error: '이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.',
        needVerification: true,
        email: user.email,
      });
    }

    // 로그인 성공 → 시도 횟수 초기화
    await clearLoginAttempts(ip, email);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Refresh token을 Redis에 저장 (유효성 관리)
    await redis.set(`refresh:${user.id}`, refreshToken, 'EX', 7 * 24 * 60 * 60);

    // HttpOnly 쿠키로 설정
    setTokenCookies(res, accessToken, refreshToken);

    return res.json({
      user: { id: user.id, email: user.email, nickname: user.nickname },
    });
  } catch (err) {
    console.error('Error logging in:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── POST /refresh — Access Token 갱신 ──
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    } catch (e) {
      clearTokenCookies(res);
      return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' });
    }

    // Redis에 저장된 refresh token과 비교
    const storedToken = await redis.get(`refresh:${decoded.id}`);
    if (!storedToken || storedToken !== refreshToken) {
      clearTokenCookies(res);
      return res.status(401).json({ error: '유효하지 않은 세션입니다. 다시 로그인해주세요.' });
    }

    // 사용자 정보 조회
    const result = await pool.query(
      'SELECT id, email, nickname FROM users WHERE id = $1', [decoded.id]
    );
    if (result.rows.length === 0) {
      clearTokenCookies(res);
      return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    const user = result.rows[0];
    const newAccessToken = generateAccessToken(user);

    res.cookie('access_token', newAccessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000,
    });

    return res.json({
      user: { id: user.id, email: user.email, nickname: user.nickname },
    });
  } catch (err) {
    console.error('Error refreshing token:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── GET /me — 현재 로그인 상태 확인 ──
router.get('/me', async (req, res) => {
  try {
    const token = req.cookies?.access_token;
    if (!token) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: '로그아웃된 세션입니다.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({
      user: { id: decoded.id, email: decoded.email, nickname: decoded.nickname },
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'token_expired' });
    }
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }
});

// ── POST /logout ──
router.post('/logout', async (req, res) => {
  try {
    const accessToken = req.cookies?.access_token;
    const refreshToken = req.cookies?.refresh_token;

    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken);
        if (decoded?.exp) {
          const remaining = decoded.exp - Math.floor(Date.now() / 1000);
          if (remaining > 0) {
            await redis.set(`blacklist:${accessToken}`, '1', 'EX', remaining);
          }
        }
      } catch (_) {}
    }

    if (refreshToken) {
      try {
        const decoded = jwt.decode(refreshToken);
        if (decoded?.id) {
          await redis.del(`refresh:${decoded.id}`);
        }
      } catch (_) {}
    }

    clearTokenCookies(res);
    return res.json({ message: '로그아웃되었습니다.' });
  } catch (err) {
    console.error('Error logging out:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── POST /find-id ──
router.post('/find-id', async (req, res) => {
  try {
    const { nickname } = req.body;
    if (!nickname) return res.status(400).json({ error: '닉네임을 입력해주세요.' });

    const result = await pool.query('SELECT email FROM users WHERE nickname = $1', [nickname]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '해당 닉네임으로 등록된 계정이 없습니다.' });
    }

    const email = result.rows[0].email;
    const [local, domain] = email.split('@');
    const masked = local.length <= 2 ? local + '***' : local.slice(0, 2) + '***';
    return res.json({ email: `${masked}@${domain}` });
  } catch (err) {
    console.error('Error finding id:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── POST /request-password-reset ──
router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: '아이디(이메일)를 입력해주세요.' });

    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '등록되지 않은 아이디입니다.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 1 * 60 * 60 * 1000);
    await pool.query('UPDATE users SET verify_token = $1, verify_token_expires = $2 WHERE id = $3',
      [resetToken, resetExpires, result.rows[0].id]);

    try { await sendPasswordResetEmail(email, resetToken); } catch (e) {
      console.error('Failed to send password reset email:', e.message);
    }
    return res.json({ message: '비밀번호 재설정 메일이 발송되었습니다. 메일함을 확인해주세요.' });
  } catch (err) {
    console.error('Error requesting password reset:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── GET /verify-reset-token ──
router.get('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: '토큰이 없습니다.' });

    const result = await pool.query(
      'SELECT id, email, verify_token_expires FROM users WHERE verify_token = $1', [token]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: '유효하지 않은 링크입니다.' });
    if (new Date() > new Date(result.rows[0].verify_token_expires)) {
      return res.status(400).json({ error: '링크가 만료되었습니다. 다시 요청해주세요.' });
    }
    return res.json({ valid: true, email: result.rows[0].email });
  } catch (err) {
    console.error('Error verifying reset token:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── POST /reset-password ──
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: '토큰과 새 비밀번호를 입력해주세요.' });
    if (password.length < 6) return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });

    const result = await pool.query(
      'SELECT id, verify_token_expires FROM users WHERE verify_token = $1', [token]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: '유효하지 않은 링크입니다.' });
    if (new Date() > new Date(result.rows[0].verify_token_expires)) {
      return res.status(400).json({ error: '링크가 만료되었습니다. 다시 요청해주세요.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    await pool.query('UPDATE users SET password = $1, verify_token = NULL, verify_token_expires = NULL WHERE id = $2',
      [hashedPassword, result.rows[0].id]);

    return res.json({ message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.' });
  } catch (err) {
    console.error('Error resetting password:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
