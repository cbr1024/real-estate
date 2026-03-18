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

// Routes
app.use('/api/apartments', apartmentsRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);

// WebSocket
setupWebSocket(server);

// Cron jobs
initCronJobs();

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
