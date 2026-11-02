const express = require('express');
const router = express.Router();
const User = require('../models/User');
const VirtualPointTransaction = require('../models/VirtualPointTransaction');
const { authenticateTelegram } = require('../middleware/telegramAuth');
const {
  claimDailyReward,
  getDailyRewardStatus,
  creditPoints,
} = require('../services/virtualPointsService');
const { getUserAchievements } = require('../services/achievementService');
const { TRANSACTION_TYPE } = require('../config/constants');
const { AppError } = require('../middleware/errorHandler');

router.use(authenticateTelegram);

// ─── Profile ────────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const user = await User.findById(req.userId).select('-__v -passwordHash -passwordResetToken');
  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, user });
});

// Update responsible play controls
router.put('/me/responsible-play', async (req, res) => {
  const { dailyPlayTimeLimitMinutes, dailyPointsLossLimit, selfExclusionHours } = req.body;
  const updateData = {};

  if (typeof dailyPlayTimeLimitMinutes === 'number') {
    updateData.dailyPlayTimeLimitMinutes = Math.max(0, dailyPlayTimeLimitMinutes);
  }
  if (typeof dailyPointsLossLimit === 'number') {
    updateData.dailyPointsLossLimit = Math.max(0, dailyPointsLossLimit);
  }
  if (selfExclusionHours && selfExclusionHours > 0) {
    updateData.selfExclusionUntil = new Date(Date.now() + selfExclusionHours * 3600000);
  }

  const user = await User.findByIdAndUpdate(req.userId, { $set: updateData }, { new: true });
  res.json({ success: true, message: 'Preferences updated', user });
});

// ─── Daily Rewards & Streaks ────────────────────────────────────────────────
router.get('/rewards/daily-status', async (req, res) => {
  const status = await getDailyRewardStatus(req.userId);
  res.json({ success: true, ...status });
});

router.post('/rewards/claim-daily', async (req, res) => {
  const result = await claimDailyReward(req.userId);
  res.json(result);
});

// ─── Free Virtual Points Faucet ─────────────────────────────────────────────
router.post('/faucet', async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new AppError('User not found', 404);

  if ((user.virtualPoints || 0) >= 50) {
    throw new AppError('Faucet is only available when your balance is under 50 VP!', 400);
  }

  const reloadAmount = 200;
  await creditPoints(req.userId, reloadAmount, TRANSACTION_TYPE.WELCOME_BONUS, {
    description: 'Free Faucet refill (+200 VP)',
  });

  const updatedUser = await User.findById(req.userId).select('virtualPoints');
  res.json({
    success: true,
    message: 'Refilled 200 Virtual Points!',
    pointsAwarded: reloadAmount,
    newBalance: updatedUser.virtualPoints,
  });
});

// ─── Achievements ───────────────────────────────────────────────────────────
router.get('/achievements', async (req, res) => {
  const achievements = await getUserAchievements(req.userId);
  res.json({ success: true, achievements });
});

// ─── Leaderboard ────────────────────────────────────────────────────────────
router.get('/leaderboard', async (req, res) => {
  const { period = 'all_time', limit = 50 } = req.query;

  // For all-time, query top users by gamesWon and totalPointsWon
  const query = { status: 'active' };

  const leaders = await User.find(query)
    .sort({ gamesWon: -1, totalPointsWon: -1, virtualPoints: -1 })
    .limit(Math.min(parseInt(limit) || 50, 100))
    .select('firstName lastName username photoUrl gamesPlayed gamesWon totalPointsWon virtualPoints telegramId');

  // Find calling user's rank
  const myUser = await User.findById(req.userId);
  let myRank = 1;
  if (myUser) {
    const higherRankCount = await User.countDocuments({
      status: 'active',
      $or: [
        { gamesWon: { $gt: myUser.gamesWon || 0 } },
        { gamesWon: myUser.gamesWon || 0, totalPointsWon: { $gt: myUser.totalPointsWon || 0 } },
      ],
    });
    myRank = higherRankCount + 1;
  }

  res.json({
    success: true,
    period,
    leaders: leaders.map((u, idx) => ({
      ...u.toObject(),
      rank: idx + 1,
      winRate: u.winRate || 0,
    })),
    myRank,
    myStats: myUser ? {
      rank: myRank,
      gamesWon: myUser.gamesWon,
      gamesPlayed: myUser.gamesPlayed,
      totalPointsWon: myUser.totalPointsWon,
      virtualPoints: myUser.virtualPoints,
    } : null,
  });
});

// ─── Transaction History ────────────────────────────────────────────────────
router.get('/transactions', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    VirtualPointTransaction.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    VirtualPointTransaction.countDocuments({ userId: req.userId }),
  ]);

  res.json({
    success: true,
    transactions,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

module.exports = router;
