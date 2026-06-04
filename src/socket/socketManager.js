const { Server } = require('socket.io');
const { validateTelegramInitData } = require('../middleware/telegramAuth');
const User = require('../models/User');
const Game = require('../models/Game');
const BingoCard = require('../models/BingoCard');
const { GAME_STATUS, CARD_LOCK_TTL_SECONDS, ROLES } = require('../config/constants');
const logger = require('../utils/logger');
const { releaseCard } = require('../services/gameService');

// ─── Socket Event Rate Limiter ─────────────────────────────────────────────
const eventTimestamps = new Map();
const RATE_LIMITS = {
  'game:join': { max: 3, window: 10000 },
  'game:leave': { max: 5, window: 10000 },
  'ping': { max: 3, window: 5000 },
};

function checkSocketRateLimit(socketId, event, maxRequests, windowMs) {
  const key = `${socketId}:${event}`;
  const now = Date.now();
  const timestamps = eventTimestamps.get(key) || [];
  const recent = timestamps.filter(t => now - t < windowMs);
  if (recent.length >= maxRequests) return true;
  recent.push(now);
  eventTimestamps.set(key, recent);
  return false;
}

// Cleanup stale rate-limit entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of eventTimestamps.entries()) {
    const valid = timestamps.filter(t => now - t < 30000);
    if (valid.length === 0) eventTimestamps.delete(key);
    else eventTimestamps.set(key, valid);
  }
}, 60000).unref();

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: [
        'https://web.telegram.org',
        'https://telegram.org',
        'https://bingo-telegram-frontend.vercel.app',
      ],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  // ─── Authentication Middleware ─────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const initData = socket.handshake.auth?.initData || socket.handshake.headers['x-telegram-init-data'];
      const token = socket.handshake.auth?.token;

      if (token) {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user || !user.isActive) return next(new Error('UNAUTHORIZED'));
        socket.user = user;
        socket.userId = user._id.toString();
        return next();
      }

      if (initData) {
        const telegramUser = validateTelegramInitData(initData);
        if (!telegramUser) return next(new Error('INVALID_TELEGRAM_DATA'));

        let user = await User.findOne({ telegramId: telegramUser.id.toString() });
        if (!user) return next(new Error('USER_NOT_FOUND'));
        if (!user.isActive) return next(new Error('ACCOUNT_SUSPENDED'));

        socket.user = user;
        socket.userId = user._id.toString();
        return next();
      }

      next(new Error('UNAUTHORIZED'));
    } catch (err) {
      logger.warn('Socket auth error:', err.message);
      next(new Error('UNAUTHORIZED'));
    }
  });

  // ─── Connection Handler ────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.userId;
    const user = socket.user;

    logger.debug(`Socket connected: ${userId} (${user.firstName})`);

    // ─── Event-level rate limiter middleware ──────────────────────────────────
    socket.use(([event, ...args], next) => {
      const limits = RATE_LIMITS[event];
      if (limits && checkSocketRateLimit(socket.id, event, limits.max, limits.window)) {
        return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      }
      next();
    });

    // Join personal room for notifications
    socket.join(`user:${userId}`);

    // Admins join admin room
    if ([ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) {
      socket.join('admins');
    }

    // ─── Join Game Room ──────────────────────────────────────────────────────
    socket.on('game:join', async ({ gameId }) => {
      try {
        const game = await Game.findById(gameId);
        if (!game) return socket.emit('error', { message: 'Game not found' });
        socket.join(`game:${gameId}`);
        socket.emit('game:joined', {
          gameId,
          status: game.status,
          playerCount: game.players.length,
          prizePool: game.prizePool,
          drawnNumbers: game.drawnNumbers,
        });
        logger.debug(`User ${userId} joined game room ${gameId}`);
      } catch (err) {
        socket.emit('error', { message: 'Failed to join game' });
      }
    });

    // ─── Leave Game Room ─────────────────────────────────────────────────────
    socket.on('game:leave', ({ gameId }) => {
      socket.leave(`game:${gameId}`);
    });

    // ─── Heartbeat ───────────────────────────────────────────────────────────
    socket.on('ping', () => {
      socket.emit('pong', { ts: Date.now() });
    });

    // ─── Disconnect: release locked cards ───────────────────────────────────
    socket.on('disconnect', async () => {
      logger.debug(`Socket disconnected: ${userId}`);
      try {
        // Release any cards locked by this user
        const lockedCards = await BingoCard.find({
          lockedBy: userId,
          status: 'selected',
        });
        for (const card of lockedCards) {
          await releaseCard(card._id, userId);
          logger.debug(`Released card ${card._id} on disconnect for user ${userId}`);
        }
      } catch (err) {
        logger.error('Error releasing cards on disconnect:', err);
      }
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

module.exports = { initSocket, getIO };
