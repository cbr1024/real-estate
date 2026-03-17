const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const redis = require('../config/redis');

const router = express.Router();

// POST /register - Create user
router.post('/register', async (req, res) => {
  try {
    const { email, password, nickname } = req.body;

    if (!email || !password || !nickname) {
      return res.status(400).json({ error: 'email, password, and nickname are required' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO users (email, password, nickname, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, email, nickname, created_at`,
      [email, hashedPassword, nickname]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error registering user:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /login - Verify credentials, return JWT
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, email, nickname, password FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, nickname: user.nickname },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    return res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
      },
    });
  } catch (err) {
    console.error('Error logging in:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /logout - Add token to Redis blacklist
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const token = authHeader.split(' ')[1];

    let ttl = 86400;
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) {
        const remaining = decoded.exp - Math.floor(Date.now() / 1000);
        if (remaining > 0) {
          ttl = remaining;
        }
      }
    } catch (_) {
      // Use default TTL if decode fails
    }

    await redis.set(`blacklist:${token}`, '1', 'EX', ttl);

    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Error logging out:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
