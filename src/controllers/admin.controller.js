const Game = require('../models/Game');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const DepositRequest = require('../models/DepositRequest');
const {
  createGame,
  generateCardsForGame,
  startGameCountdown,
  cancelAndRefund,
} = require('../services/gameService');
const { matchAndConfirmDeposit, adminConfirmDeposit } = require('../services/paymentService');
const { processWithdrawal, rejectWithdrawal } = require('../services/withdrawalService');
const { creditBalance } = require('../services/walletService');
const { GAME_STATUS, TRANSACTION_TYPE, WITHDRAWAL_STATUS, DEPOSIT_STATUS } = require('../config/constants');
const { AppError } = require('../middleware/errorHandler');
const { getWelcomeBonus, setWelcomeBonus } = require('../services/settingService');
const logger = require('../utils/logger');

// ─── Game Management ──────────────────────────────────────────────────────────

exports.createGame = async (req, res) => {
  const game = await createGame(req.userId, req.body);
  res.status(201).json({ success: true, game });
};

exports.startGame = async (req, res) => {
  const game = await Game.findById(req.params.id);
  if (!game) throw new AppError('Game not found', 404);
  if (game.status !== GAME_STATUS.SELECTION) throw new AppError('Game not in selection state', 400);
  if (game.players.length < game.minPlayers) {
    throw new AppError(`Need at least ${game.minPlayers} players to start`, 400);
  }

  await startGameCountdown(req.params.id);
  res.json({ success: true, message: 'Countdown started' });
};

exports.cancelGame = async (req, res) => {
  const { reason } = req.body;
  const game = await cancelAndRefund(req.params.id, reason || 'Cancelled by admin');
  if (!game) throw new AppError('Game not found or already cancelled/finished', 404);
  res.json({ success: true, message: 'Game cancelled and refunds issued', game });
};

exports.listAllGames = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const filter = status ? { status } : {};
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [games, total] = await Promise.all([
    Game.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-drawSequence'),
    Game.countDocuments(filter),
  ]);

  res.json({ success: true, games, total });
};

// ─── User Management ──────────────────────────────────────────────────────────

exports.listUsers = async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const filter = search
    ? { $or: [{ username: new RegExp(search, 'i') }, { firstName: new RegExp(search, 'i') }, { telegramId: search }] }
    : {};

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).select('-__v -paymentInfo'),
    User.countDocuments(filter),
  ]);

  res.json({ success: true, users, total });
};

exports.banUser = async (req, res) => {
  const { reason } = req.body;
  const user = await User.findByIdAndUpdate(
    req.params.userId,
    { isBanned: true, isActive: false, banReason: reason },
    { new: true }
  );
  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, message: 'User banned', user });
};

exports.unbanUser = async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.userId,
    { isBanned: false, isActive: true, banReason: null },
    { new: true }
  );
  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, message: 'User unbanned', user });
};

exports.manualCredit = async (req, res) => {
  const { amount, reason } = req.body;
  if (!amount || isNaN(amount)) throw new AppError('Valid amount required', 400);

  await creditBalance(req.params.userId, parseFloat(amount), TRANSACTION_TYPE.DEPOSIT, {
    description: `Admin manual credit: ${reason || 'No reason'}`,
  });

  res.json({ success: true, message: `Credited ${amount} to user` });
};

exports.deleteUser = async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.userId);
  if (!user) throw new AppError('User not found', 404);
  logger.info(`Admin ${req.userId} deleted user ${req.params.userId}`);
  res.json({ success: true, message: 'User deleted' });
};

exports.removePlayerFromGame = async (req, res) => {
  const game = await Game.findById(req.params.gameId);
  if (!game) throw new AppError('Game not found', 404);

  const playerIndex = game.players.findIndex(p => p.userId.toString() === req.params.userId);
  if (playerIndex === -1) throw new AppError('Player not found in game', 404);

  game.players.splice(playerIndex, 1);
  game.playerCount = game.players.length;
  await game.save();

  logger.info(`Admin ${req.userId} removed player ${req.params.userId} from game ${req.params.gameId}`);
  res.json({ success: true, message: 'Player removed from game' });
};

// ─── Deposit Management (SMS) ─────────────────────────────────────────────────

exports.listDepositRequests = async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : { status: DEPOSIT_STATUS.PENDING };

  const deposits = await DepositRequest.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('userId', 'firstName username telegramId');

  res.json({ success: true, deposits });
};

exports.matchSmsDeposit = async (req, res) => {
  const { adminSmsText } = req.body;
  if (!adminSmsText) throw new AppError('Admin SMS text required', 400);

  const result = await matchAndConfirmDeposit(req.params.id, adminSmsText, req.userId);
  res.json({ success: true, ...result });
};

exports.confirmDeposit = async (req, res) => {
  const result = await adminConfirmDeposit(req.params.id, req.userId);
  res.json({ success: true, ...result });
};

// ─── Withdrawal Management ────────────────────────────────────────────────────

exports.listWithdrawals = async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : { status: WITHDRAWAL_STATUS.PENDING };

  const withdrawals = await Withdrawal.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('userId', 'firstName username telegramId');

  res.json({ success: true, withdrawals });
};

exports.approveWithdrawal = async (req, res) => {
  const withdrawal = await processWithdrawal(req.params.id, req.userId);
  res.json({ success: true, message: 'Withdrawal approved and processed', withdrawal });
};

exports.rejectWithdrawal = async (req, res) => {
  const { reason } = req.body;
  if (!reason) throw new AppError('Rejection reason required', 400);
  const withdrawal = await rejectWithdrawal(req.params.id, req.userId, reason);
  res.json({ success: true, message: 'Withdrawal rejected and refunded', withdrawal });
};

// ─── Settings Management ──────────────────────────────────────────────────

exports.getWelcomeBonusSetting = async (req, res) => {
  const amount = await getWelcomeBonus();
  res.json({ success: true, welcomeBonus: amount });
};

exports.setWelcomeBonusSetting = async (req, res) => {
  const { amount } = req.body;
  if (amount === undefined || amount === null) {
    throw new AppError('Amount is required', 400);
  }
  const value = await setWelcomeBonus(amount);
  res.json({ success: true, welcomeBonus: value });
};

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

exports.getDashboard = async (req, res) => {
  const [
    totalUsers, activeUsers,
    totalGames, activeGames, completedGames,
    pendingWithdrawals,
    pendingDeposits,
    recentTransactions,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    Game.countDocuments(),
    Game.countDocuments({ status: { $in: [GAME_STATUS.SELECTION, GAME_STATUS.ACTIVE, GAME_STATUS.STARTING] } }),
    Game.countDocuments({ status: GAME_STATUS.FINISHED }),
    Withdrawal.countDocuments({ status: WITHDRAWAL_STATUS.PENDING }),
    DepositRequest.countDocuments({ status: DEPOSIT_STATUS.PENDING }),
    Transaction.find().sort({ createdAt: -1 }).limit(10).populate('userId', 'firstName telegramId'),
  ]);

  const totalRevenue = await Transaction.aggregate([
    { $match: { type: 'platform_fee', status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  res.json({
    success: true,
    stats: {
      users: { total: totalUsers, active: activeUsers },
      games: { total: totalGames, active: activeGames, completed: completedGames },
      pendingWithdrawals,
      pendingDeposits,
      platformRevenue: totalRevenue[0]?.total || 0,
    },
    recentTransactions,
  });
};
