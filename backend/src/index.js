require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');

const apartmentsRouter = require('./routes/apartments');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const setupWebSocket = require('./websocket');
const { initCronJobs } = require('./services/cronJobs');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
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
