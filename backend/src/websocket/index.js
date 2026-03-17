const { Server } = require('socket.io');

let io;

function setupWebSocket(server) {
  io = new Server(server, {
    path: '/ws',
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('join', (room) => {
      socket.join(room);
      console.log(`Client ${socket.id} joined room: ${room}`);
    });

    socket.on('leave', (room) => {
      socket.leave(room);
      console.log(`Client ${socket.id} left room: ${room}`);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function emitNewTrade(apartmentId, tradeData) {
  if (!io) {
    console.warn('WebSocket server not initialized');
    return;
  }

  io.to(`apartment:${apartmentId}`).emit('newTrade', tradeData);
  io.emit('tradeNotification', {
    apartmentId,
    ...tradeData,
  });
}

module.exports = setupWebSocket;
module.exports.emitNewTrade = emitNewTrade;
