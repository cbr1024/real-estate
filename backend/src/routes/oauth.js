const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const redis = require('../config/redis');

const router = express.Router();

const APP_URL = process.env.APP_URL || 'http://localhost';
const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_EXPIRES = '7d';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
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
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refresh_token', refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
}

// 소셜 로그인 후 사용자 찾거나 생성 → 토큰 발급 → 프론트로 리다이렉트
async function handleSocialLogin(req, res, { provider, providerId, email, nickname }) {
  // 1) provider+provider_id로 기존 사용자 검색
  let result = await pool.query(
    'SELECT id, email, nickname FROM users WHERE provider = $1 AND provider_id = $2',
    [provider, providerId]
  );

  let user;
  if (result.rows.length > 0) {
    user = result.rows[0];
  } else {
    // 2) 같은 이메일로 기존 local 계정이 있으면 소셜 연동
    if (email) {
      result = await pool.query('SELECT id, email, nickname FROM users WHERE email = $1', [email]);
      if (result.rows.length > 0) {
        user = result.rows[0];
        await pool.query(
          'UPDATE users SET provider = $1, provider_id = $2 WHERE id = $3',
          [provider, providerId, user.id]
        );
      }
    }

    // 3) 신규 사용자 생성
    if (!user) {
      const finalEmail = email || `${provider}_${providerId}@social.local`;
      result = await pool.query(
        `INSERT INTO users (email, nickname, email_verified, provider, provider_id, subscription_plan_id)
         VALUES ($1, $2, TRUE, $3, $4, (SELECT id FROM subscription_plans WHERE name = 'free'))
         RETURNING id, email, nickname`,
        [finalEmail, nickname || provider + '사용자', provider, providerId]
      );
      user = result.rows[0];
    }
  }

  // 로그인 기록
  const ip = req.ip || 'unknown';
  pool.query(
    'INSERT INTO login_logs (user_id, provider, ip_address) VALUES ($1, $2, $3)',
    [user.id, provider, ip]
  ).catch(() => {});

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  await redis.set(`refresh:${user.id}`, refreshToken, 'EX', 7 * 24 * 60 * 60);
  setTokenCookies(res, accessToken, refreshToken);

  // 프론트엔드로 리다이렉트 (쿠키가 세팅된 상태)
  res.redirect(`${APP_URL}/oauth/callback`);
}

// ─── 네이버 ───

// GET /naver — 네이버 로그인 페이지로 리다이렉트
router.get('/naver', (req, res) => {
  const state = Math.random().toString(36).substring(2);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.NAVER_CLIENT_ID,
    redirect_uri: `${APP_URL}/api/oauth/naver/callback`,
    state,
  });
  res.redirect(`https://nid.naver.com/oauth2.0/authorize?${params}`);
});

// GET /naver/callback — 네이버 콜백
router.get('/naver/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.redirect(`${APP_URL}/login?error=naver_failed`);

    // 1) 토큰 교환
    const tokenRes = await axios.get('https://nid.naver.com/oauth2.0/token', {
      params: {
        grant_type: 'authorization_code',
        client_id: process.env.NAVER_CLIENT_ID,
        client_secret: process.env.NAVER_CLIENT_SECRET,
        code,
        state,
      },
    });
    const { access_token } = tokenRes.data;
    if (!access_token) return res.redirect(`${APP_URL}/login?error=naver_token`);

    // 2) 프로필 조회
    const profileRes = await axios.get('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = profileRes.data.response;

    await handleSocialLogin(req, res, {
      provider: 'naver',
      providerId: profile.id,
      email: profile.email,
      nickname: profile.nickname || profile.name,
    });
  } catch (err) {
    console.error('Naver OAuth error:', err.message);
    res.redirect(`${APP_URL}/login?error=naver_failed`);
  }
});

// ─── 카카오 ───

// GET /kakao — 카카오 로그인 페이지로 리다이렉트
router.get('/kakao', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.KAKAO_CLIENT_ID,
    redirect_uri: `${APP_URL}/api/oauth/kakao/callback`,
    response_type: 'code',
  });
  res.redirect(`https://kauth.kakao.com/oauth/authorize?${params}`);
});

// GET /kakao/callback — 카카오 콜백
router.get('/kakao/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${APP_URL}/login?error=kakao_failed`);

    // 1) 토큰 교환
    const tokenRes = await axios.post('https://kauth.kakao.com/oauth/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: process.env.KAKAO_CLIENT_ID,
        client_secret: process.env.KAKAO_CLIENT_SECRET,
        redirect_uri: `${APP_URL}/api/oauth/kakao/callback`,
        code,
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const { access_token } = tokenRes.data;
    if (!access_token) return res.redirect(`${APP_URL}/login?error=kakao_token`);

    // 2) 프로필 조회
    const profileRes = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const { id, kakao_account, properties } = profileRes.data;

    await handleSocialLogin(req, res, {
      provider: 'kakao',
      providerId: String(id),
      email: kakao_account?.email || null,
      nickname: properties?.nickname || kakao_account?.profile?.nickname,
    });
  } catch (err) {
    console.error('Kakao OAuth error:', err.message);
    res.redirect(`${APP_URL}/login?error=kakao_failed`);
  }
});

module.exports = router;
