const Game = require('../models/Game');
const BingoCard = require('../models/BingoCard');
const {
  ensureSelectionGame,
  createGame,
  selectCard,
  releaseCard,
  purchaseCard,
  startGameCountdown,
  claimBingo,
  cancelAndRefund,
  generateCardsForGame,
} = require('../services/gameService');
const { GAME_STATUS } = require('../config/constants');
const { AppError } = require('../middleware/errorHandler');

/**
 * GET /api/games - list open games
 */
exports.listGames = async (req, res) => {
  await ensureSelectionGame();

  const games = await Game.find({
    status: { $in: [GAME_STATUS.SELECTION, GAME_STATUS.STARTING, GAME_STATUS.ACTIVE] },
  })
    .select('-drawSequence -drawnNumbers -players')
    .sort({ createdAt: -1 })
    .limit(20);

  res.json({ success: true, games });
};

/**
 * GET /api/games/:id
 */
exports.getGame = async (req, res) => {
  const game = await Game.findById(req.params.id)
    .select('-drawSequence')
    .populate('players.userId', 'firstName username telegramId');

  if (!game) throw new AppError('Game not found', 404);
  res.json({ success: true, game });
};

/**
 * GET /api/games/:id/cards - list available cards
 */
exports.getGameCards = async (req, res) => {
  const now = new Date();
  const cards = await BingoCard.find({
    gameId: req.params.id,
    $or: [
      { status: 'available' },
      { status: 'selected', lockExpiresAt: { $gt: now } },
    ],
  }).select('cardNumber status lockedBy card');

  // Mask actual card numbers for unowned cards
  const sanitized = cards.map(c => ({
    _id: c._id,
    cardNumber: c.cardNumber,
    status: c.status,
    isLockedByMe: c.lockedBy?.toString() === req.userId,
    card: c.lockedBy?.toString() === req.userId || c.status === 'purchased' ? c.card : null,
  }));

  res.json({ success: true, cards: sanitized });
};

/**
 * POST /api/games/:id/cards/:cardId/select
 */
exports.selectCard = async (req, res) => {
  const card = await selectCard(req.params.id, req.params.cardId, req.userId);
  res.json({
    success: true,
    message: 'Card locked for 2 minutes. Complete purchase to confirm.',
    card: {
      _id: card._id,
      cardNumber: card.cardNumber,
      card: card.card,
      lockExpiresAt: card.lockExpiresAt,
    },
  });
};

/**
 * POST /api/games/:id/cards/:cardId/release
 */
exports.releaseCard = async (req, res) => {
  await releaseCard(req.params.cardId, req.userId);
  res.json({ success: true, message: 'Card released' });
};

/**
 * POST /api/games/:id/cards/:cardId/purchase
 */
exports.purchaseCard = async (req, res) => {
  const result = await purchaseCard(req.params.id, req.params.cardId, req.userId);
  res.json({
    success: true,
    message: 'Card purchased successfully!',
    card: result.card,
    prizePool: result.prizePool,
  });
};

/**
 * POST /api/games/:id/bingo - claim bingo
 */
exports.claimBingo = async (req, res) => {
  const result = await claimBingo(req.params.id, req.userId);
  res.json({
    success: true,
    message: '🎉 BINGO! You won!',
    prize: result.winnerPrize,
    platformFee: result.platformFee,
  });
};

/**
 * GET /api/games/history - user's game history
 */
exports.getMyHistory = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const skip = (page - 1) * limit;

  const games = await Game.find({
    'players.userId': req.userId,
    status: { $in: [GAME_STATUS.FINISHED, GAME_STATUS.CANCELLED] },
  })
    .select('gameCode status prizePool winner endedAt cardPrice players')
    .sort({ endedAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Game.countDocuments({ 'players.userId': req.userId });

  res.json({ success: true, games, total, page, pages: Math.ceil(total / limit) });
};
