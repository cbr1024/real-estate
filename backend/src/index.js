require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const http = require('http');

const apartmentsRouter = require('./routes/apartments');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const subscriptionsRouter = require('./routes/subscriptions');
const adminRouter = require('./routes/admin');
const oauthRouter = require('./routes/oauth');
const alertsRouter = require('./routes/alerts');
const placesRouter = require('./routes/places');
const policyRouter = require('./routes/policy');
const schoolsRouter = require('./routes/schools');
const paymentsRouter = require('./routes/payments');
const reviewsRouter = require('./routes/reviews');
const communityRouter = require('./routes/community');
const discussionsRouter = require('./routes/discussions');
const columnsRouter = require('./routes/columns');
const setupWebSocket = require('./websocket');
const { initCronJobs } = require('./services/cronJobs');

const app = express();
const server = http.createServer(app);

// Nginx 프록시 뒤에서 실제 IP 인식
app.set('trust proxy', 1);

// CORS — 허용 도메인 제한 + 쿠키 전송 허용
app.use(cors({
  origin: process.env.APP_URL || 'http://localhost',
  credentials: true,
}));

app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());
app.use(cookieParser());

// 전체 API Rate Limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Visit tracking (lightweight, no auth)
const pool = require('./config/database');
const crypto = require('crypto');
app.post('/api/visit', async (req, res) => {
  try {
    const ip = req.ip || 'unknown';
    const ua = req.headers['user-agent'] || '';
    const visitorId = req.body.visitorId || crypto.createHash('sha256').update(ip + ua).digest('hex').slice(0, 16);
    await pool.query(
      'INSERT INTO site_visits (visitor_id, ip_address, user_agent) VALUES ($1, $2, $3)',
      [visitorId, ip, ua.slice(0, 500)]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.json({ ok: true }); // fail silently
  }
});

// Routes
app.use('/api/apartments', apartmentsRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/oauth', oauthRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/places', placesRouter);
app.use('/api/policy', policyRouter);
app.use('/api/schools', schoolsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/community', communityRouter);
app.use('/api/discussions', discussionsRouter);
app.use('/api/columns', columnsRouter);

// WebSocket
setupWebSocket(server);

// Cron jobs
initCronJobs();

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
