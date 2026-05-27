const cron = require('node-cron');
const Game = require('../models/Game');
const BingoCard = require('../models/BingoCard');
const { ensureSelectionGame, cancelAndRefund } = require('./gameService');
const { GAME_STATUS, CARD_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

function startGameScheduler() {
  // Every 30 seconds: ensure a selection game exists
  cron.schedule('*/30 * * * * *', async () => {
    try {
      await ensureSelectionGame();
    } catch (err) {
      logger.error('Ensure selection game error:', err);
    }
  });

  // Every minute: release expired card locks
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const result = await BingoCard.updateMany(
        {
          status: CARD_STATUS.SELECTED,
          lockExpiresAt: { $lt: now },
        },
        {
          $set: {
            status: CARD_STATUS.AVAILABLE,
            lockedBy: null,
            lockedAt: null,
            lockExpiresAt: null,
          },
        }
      );
      if (result.modifiedCount > 0) {
        logger.debug(`Released ${result.modifiedCount} expired card locks`);
      }
    } catch (err) {
      logger.error('Lock cleanup error:', err);
    }
  });

  // Every 5 minutes: cancel stale starting games
  cron.schedule('*/5 * * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - 10 * 60 * 1000);
      const staleGames = await Game.find({
        status: GAME_STATUS.STARTING,
        countdownStartedAt: { $lt: cutoff },
      });
      for (const game of staleGames) {
        logger.warn(`Cancelling stale starting game: ${game.gameCode}`);
        await cancelAndRefund(game._id.toString(), 'Game start timed out');
      }
    } catch (err) {
      logger.error('Stale game cleanup error:', err);
    }
  });

  // Every 30 minutes: log game stats
  cron.schedule('*/30 * * * *', async () => {
    try {
      const [selection, active, starting] = await Promise.all([
        Game.countDocuments({ status: GAME_STATUS.SELECTION }),
        Game.countDocuments({ status: GAME_STATUS.ACTIVE }),
        Game.countDocuments({ status: GAME_STATUS.STARTING }),
      ]);
      logger.info(`Game stats — Selection: ${selection} | Starting: ${starting} | Active: ${active}`);
    } catch (err) {
      logger.error('Stats cron error:', err);
    }
  });

  logger.info('Game scheduler cron jobs registered');
}

module.exports = { startGameScheduler };
