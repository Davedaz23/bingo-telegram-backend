require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./socket/socketManager');
const connectDB = require('./config/database');
const logger = require('./utils/logger');
const { startGameScheduler } = require('./services/gameScheduler');
const { ensureSelectionGame } = require('./services/gameService');
const { initTelegramBot } = require('./services/telegramBot');

const PORT = process.env.PORT || 6000;

async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();
    logger.info('✅ MongoDB connected');

    // Create HTTP server
    const server = http.createServer(app);

    // Initialize Socket.IO
    initSocket(server);
    logger.info('✅ Socket.IO initialized');

    // Ensure a selection game exists
    await ensureSelectionGame();
    logger.info('✅ Selection game ensured');

    // Start game scheduler (cron jobs)
    startGameScheduler();
    logger.info('✅ Game scheduler started');

    // Initialize Telegram bot
    await initTelegramBot();
    logger.info('✅ Telegram bot initialized');

    server.listen(PORT, () => {
      logger.info(`🚀 Bingo server running on port ${PORT} [${process.env.NODE_ENV}]`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
