const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Game = require('../models/Game');
const BingoCard = require('../models/BingoCard');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { creditBalance, debitBalance, calculatePrize } = require('./walletService');
const { generateBingoCard, checkBingo, generateDrawSequence } = require('../utils/bingoUtils');
const { getIO } = require('../socket/socketManager');
const { GAME_STATUS, CARD_STATUS, TRANSACTION_TYPE, GAME_CONFIG, CARD_LOCK_TTL_SECONDS } = require('../config/constants');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

function generateGameCode() {
  return 'BG' + Date.now().toString(36).toUpperCase().slice(-6);
}

/**
 * Ensure exactly one game in SELECTION state exists.
 * If none, create one with 400 cards.
 */
async function ensureSelectionGame() {
  let game = await Game.findOne({ status: GAME_STATUS.SELECTION }).sort({ createdAt: -1 });
  if (!game) {
    game = await Game.create({
      gameCode: generateGameCode(),
      cardPrice: GAME_CONFIG.CARD_PRICE,
      platformFeePercent: GAME_CONFIG.PLATFORM_FEE_PERCENT,
      winPattern: 'any_line',
      maxPlayers: GAME_CONFIG.MAX_PLAYERS,
      minPlayers: GAME_CONFIG.MIN_PLAYERS,
      drawIntervalMs: GAME_CONFIG.NUMBER_DRAW_INTERVAL_MS,
      drawSequence: generateDrawSequence(),
      status: GAME_STATUS.SELECTION,
    });

    await generateCardsForGame(game._id, GAME_CONFIG.CARDS_PER_GAME);
    logger.info(`Auto-created selection game: ${game.gameCode} with ${GAME_CONFIG.CARDS_PER_GAME} cards`);
    getIO().emit('game:new', { gameId: game._id, gameCode: game.gameCode, cardPrice: game.cardPrice });
  }
  return game;
}

async function createGame(adminUserId, options = {}) {
  const game = await Game.create({
    gameCode: generateGameCode(),
    cardPrice: options.cardPrice || GAME_CONFIG.CARD_PRICE,
    platformFeePercent: options.platformFeePercent || GAME_CONFIG.PLATFORM_FEE_PERCENT,
    winPattern: options.winPattern || 'any_line',
    maxPlayers: options.maxPlayers || GAME_CONFIG.MAX_PLAYERS,
    minPlayers: options.minPlayers || GAME_CONFIG.MIN_PLAYERS,
    drawIntervalMs: options.drawIntervalMs || GAME_CONFIG.NUMBER_DRAW_INTERVAL_MS,
    drawSequence: generateDrawSequence(),
    status: GAME_STATUS.SELECTION,
    createdBy: adminUserId,
  });

  await generateCardsForGame(game._id, options.cardCount || GAME_CONFIG.CARDS_PER_GAME);
  logger.info(`Game created: ${game.gameCode} by admin ${adminUserId}`);
  getIO().emit('game:new', { gameId: game._id, gameCode: game.gameCode, cardPrice: game.cardPrice });
  return game;
}

async function ensureNextGameOnFinish(finishedGameId) {
  const finished = await Game.findById(finishedGameId);
  if (!finished) return;

  const existingSelection = await Game.findOne({ status: GAME_STATUS.SELECTION });
  if (existingSelection) return;

  const game = await Game.create({
    gameCode: generateGameCode(),
    cardPrice: GAME_CONFIG.CARD_PRICE,
    platformFeePercent: GAME_CONFIG.PLATFORM_FEE_PERCENT,
    winPattern: 'any_line',
    maxPlayers: GAME_CONFIG.MAX_PLAYERS,
    minPlayers: GAME_CONFIG.MIN_PLAYERS,
    drawIntervalMs: GAME_CONFIG.NUMBER_DRAW_INTERVAL_MS,
    drawSequence: generateDrawSequence(),
    status: GAME_STATUS.SELECTION,
  });

  await generateCardsForGame(game._id, GAME_CONFIG.CARDS_PER_GAME);
  logger.info(`Auto-created next game after finish: ${game.gameCode}`);
  getIO().emit('game:new', { gameId: game._id, gameCode: game.gameCode, cardPrice: game.cardPrice });
}

async function selectCard(gameId, cardId, userId) {
  const game = await Game.findById(gameId);
  if (!game) throw new AppError('Game not found', 404);
  if (!game.isJoinable) throw new AppError('Game is not accepting players', 400);

  const alreadyIn = game.players.some(p => p.userId.toString() === userId.toString());
  if (alreadyIn) throw new AppError('You already have a card in this game', 400);

  const card = await BingoCard.tryLock(cardId, userId, CARD_LOCK_TTL_SECONDS);
  if (!card) throw new AppError('Card is no longer available. Please select another.', 409);

  getIO().to(`game:${gameId}`).emit('card:locked', { cardId, cardNumber: card.cardNumber });
  logger.info(`Card ${card.cardNumber} locked by user ${userId} in game ${game.gameCode}`);

  return card;
}

async function releaseCard(cardId, userId) {
  const card = await BingoCard.releaseLock(cardId, userId);
  if (card) {
    getIO().to(`game:${card.gameId}`).emit('card:released', { cardId, cardNumber: card.cardNumber });
  }
  return card;
}

async function purchaseCard(gameId, cardId, userId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const game = await Game.findById(gameId).session(session);
    if (!game) throw new AppError('Game not found', 404);
    if (game.status !== GAME_STATUS.SELECTION && game.status !== GAME_STATUS.STARTING) {
      throw new AppError('Game is not accepting new players', 400);
    }

    const alreadyIn = game.players.some(p => p.userId.toString() === userId.toString());
    if (alreadyIn) throw new AppError('You already have a card in this game', 400);

    const card = await BingoCard.confirmPurchase(cardId, userId);
    if (!card) throw new AppError('Card lock expired or was taken. Please select again.', 409);

    const user = await User.findById(userId).session(session);
    if (!user) throw new AppError('User not found', 404);

    await debitBalance(userId, game.cardPrice, TRANSACTION_TYPE.CARD_PURCHASE, {
      gameId,
      cardId,
      description: `Card #${card.cardNumber} in game ${game.gameCode}`,
    }, session);

    await Game.updateOne(
      { _id: gameId },
      {
        $inc: { prizePool: game.cardPrice },
        $push: {
          players: {
            userId,
            telegramId: user.telegramId,
            cardId,
            joinedAt: new Date(),
          },
        },
      },
      { session }
    );

    await BingoCard.updateOne({ _id: cardId }, { ownerTelegramId: user.telegramId }, { session });

    await session.commitTransaction();

    const updatedGame = await Game.findById(gameId).populate('players.userId', 'firstName username');
    getIO().to(`game:${gameId}`).emit('game:playerJoined', {
      gameId,
      playerCount: updatedGame.players.length,
      prizePool: updatedGame.prizePool,
    });
    getIO().to(`game:${gameId}`).emit('card:purchased', { cardId, cardNumber: card.cardNumber, userId });

    logger.info(`User ${userId} purchased card ${card.cardNumber} in game ${game.gameCode}`);

    if (updatedGame.players.length >= 2 && game.status === GAME_STATUS.SELECTION) {
      await startGameCountdown(gameId);
    }

    return { card, prizePool: updatedGame.prizePool };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

async function startGameCountdown(gameId) {
  const game = await Game.findOneAndUpdate(
    { _id: gameId, status: GAME_STATUS.SELECTION },
    {
      status: GAME_STATUS.STARTING,
      countdownStartedAt: new Date(),
    },
    { new: true }
  );
  if (!game) return;

  getIO().to(`game:${gameId}`).emit('game:countdown', {
    gameId,
    seconds: GAME_CONFIG.START_COUNTDOWN_SECONDS,
    playerCount: game.players.length,
    prizePool: game.prizePool,
  });

  logger.info(`Game ${game.gameCode} countdown started (${game.players.length} players)`);

  setTimeout(async () => {
    await activateGame(gameId);
  }, GAME_CONFIG.START_COUNTDOWN_SECONDS * 1000);
}

async function activateGame(gameId) {
  const game = await Game.findOneAndUpdate(
    { _id: gameId, status: GAME_STATUS.STARTING },
    { status: GAME_STATUS.ACTIVE, startedAt: new Date() },
    { new: true }
  );
  if (!game) return;

  if (game.players.length < game.minPlayers) {
    logger.warn(`Game ${game.gameCode} cancelled: not enough players (${game.players.length}/${game.minPlayers})`);
    await cancelAndRefund(gameId, 'Not enough players to start');
    return;
  }

  getIO().to(`game:${gameId}`).emit('game:started', {
    gameId,
    gameCode: game.gameCode,
    playerCount: game.players.length,
    prizePool: game.prizePool,
  });

  logger.info(`Game ${game.gameCode} started with ${game.players.length} players`);
  scheduleNumberDraw(gameId, game.drawIntervalMs);
}

const drawIntervals = new Map();

function scheduleNumberDraw(gameId, intervalMs) {
  if (drawIntervals.has(gameId.toString())) {
    clearInterval(drawIntervals.get(gameId.toString()));
  }

  const interval = setInterval(async () => {
    await drawNextNumber(gameId.toString());
  }, intervalMs);

  drawIntervals.set(gameId.toString(), interval);
}

async function drawNextNumber(gameId) {
  const game = await Game.findById(gameId);
  if (!game || game.status !== GAME_STATUS.ACTIVE) {
    clearInterval(drawIntervals.get(gameId));
    drawIntervals.delete(gameId);
    return;
  }

  if (game.currentDrawIndex >= game.drawSequence.length) {
    clearInterval(drawIntervals.get(gameId));
    drawIntervals.delete(gameId);
    await cancelAndRefund(gameId, 'All 75 numbers drawn with no winner');
    return;
  }

  const number = game.drawSequence[game.currentDrawIndex];
  await Game.updateOne(
    { _id: gameId },
    {
      $push: { drawnNumbers: number },
      $inc: { currentDrawIndex: 1 },
    }
  );

  getIO().to(`game:${gameId}`).emit('game:numberDrawn', {
    gameId,
    number,
    drawnNumbers: [...game.drawnNumbers, number],
    drawIndex: game.currentDrawIndex + 1,
    totalNumbers: 75,
  });

  logger.debug(`Game ${game.gameCode}: drew number ${number} (${game.currentDrawIndex + 1}/75)`);
}

async function claimBingo(gameId, userId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const game = await Game.findById(gameId).session(session);
    if (!game || game.status !== GAME_STATUS.ACTIVE) {
      throw new AppError('Game is not active', 400);
    }

    if (game.winner && game.winner.userId) {
      throw new AppError('Game already has a winner', 400);
    }

    const player = game.players.find(p => p.userId.toString() === userId.toString());
    if (!player) throw new AppError('You are not in this game', 400);

    const card = await BingoCard.findById(player.cardId);
    if (!card) throw new AppError('Card not found', 404);

    const hasBingo = checkBingo(card.card, game.drawnNumbers, game.winPattern);
    if (!hasBingo) {
      throw new AppError('No valid BINGO on your card with the drawn numbers', 400);
    }

    clearInterval(drawIntervals.get(gameId.toString()));
    drawIntervals.delete(gameId.toString());

    const { winnerPrize, platformFee } = calculatePrize(game.prizePool, game.platformFeePercent);
    const winningNumber = game.drawnNumbers[game.drawnNumbers.length - 1];

    await creditBalance(userId, winnerPrize, TRANSACTION_TYPE.GAME_WIN, {
      gameId,
      description: `Bingo win in game ${game.gameCode}`,
    }, session);

    const user = await User.findById(userId).session(session);
    await Game.updateOne(
      { _id: gameId },
      {
        status: GAME_STATUS.FINISHED,
        platformFeeCollected: platformFee,
        endedAt: new Date(),
        winner: {
          userId,
          telegramId: user.telegramId,
          cardId: player.cardId,
          winningNumber,
          prizeAmount: winnerPrize,
          claimedAt: new Date(),
        },
      },
      { session }
    );

    await User.updateOne(
      { _id: userId },
      { $inc: { gamesWon: 1 } },
      { session }
    );

    const playerUserIds = game.players.map(p => p.userId);
    await User.updateMany(
      { _id: { $in: playerUserIds } },
      { $inc: { gamesPlayed: 1 } },
      { session }
    );

    await session.commitTransaction();

    getIO().to(`game:${gameId}`).emit('game:winner', {
      gameId,
      gameCode: game.gameCode,
      winner: {
        userId,
        telegramId: user.telegramId,
        firstName: user.firstName,
        username: user.username,
      },
      prizeAmount: winnerPrize,
      platformFee,
      drawnNumbers: game.drawnNumbers,
      winningNumber,
    });

    logger.info(`Game ${game.gameCode}: winner ${userId} won ${winnerPrize}`);

    await ensureNextGameOnFinish(gameId);

    return { winnerPrize, platformFee, game };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

async function cancelAndRefund(gameId, reason = 'Game cancelled') {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const game = await Game.findOneAndUpdate(
      { _id: gameId, isRefunded: false, status: { $nin: [GAME_STATUS.FINISHED, GAME_STATUS.CANCELLED] } },
      { status: GAME_STATUS.REFUNDING, refundReason: reason },
      { new: true, session }
    );

    if (!game) {
      await session.abortTransaction();
      return null;
    }

    for (const player of game.players) {
      try {
        await creditBalance(player.userId, game.cardPrice, TRANSACTION_TYPE.REFUND, {
          gameId,
          description: `Refund for game ${game.gameCode}: ${reason}`,
        }, session);
      } catch (err) {
        logger.error(`Refund failed for user ${player.userId} in game ${game.gameCode}:`, err);
      }
    }

    await Game.updateOne(
      { _id: gameId },
      { status: GAME_STATUS.CANCELLED, isRefunded: true, refundedAt: new Date(), endedAt: new Date() },
      { session }
    );

    await BingoCard.updateMany(
      { gameId, status: CARD_STATUS.SELECTED },
      {
        status: CARD_STATUS.AVAILABLE,
        lockedBy: null, lockedAt: null, lockExpiresAt: null,
      },
      { session }
    );

    await session.commitTransaction();

    getIO().to(`game:${gameId}`).emit('game:cancelled', {
      gameId,
      reason,
      refunded: true,
      playerCount: game.players.length,
      amountPerPlayer: game.cardPrice,
    });

    logger.info(`Game ${game.gameCode} cancelled & refunded: ${reason}`);

    await ensureNextGameOnFinish(gameId);

    return game;
  } catch (err) {
    await session.abortTransaction();
    logger.error('cancelAndRefund error:', err);
    throw err;
  } finally {
    session.endSession();
  }
}

async function generateCardsForGame(gameId, count = 400) {
  const cards = [];
  for (let i = 1; i <= count; i++) {
    cards.push({
      gameId,
      cardNumber: i,
      card: generateBingoCard(),
      status: CARD_STATUS.AVAILABLE,
    });
  }
  await BingoCard.insertMany(cards);
  logger.info(`Generated ${count} cards for game ${gameId}`);
}

module.exports = {
  ensureSelectionGame,
  createGame,
  ensureNextGameOnFinish,
  selectCard,
  releaseCard,
  purchaseCard,
  startGameCountdown,
  activateGame,
  drawNextNumber,
  claimBingo,
  cancelAndRefund,
  generateCardsForGame,
  drawIntervals,
};
