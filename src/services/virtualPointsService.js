const mongoose = require('mongoose');
const User = require('../models/User');
const VirtualPointTransaction = require('../models/VirtualPointTransaction');
const AuditLog = require('../models/AuditLog');
const {
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
  ECONOMY,
  AUDIT_ACTIONS,
  ROLES,
} = require('../config/constants');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * Atomically credit virtual points to a user
 */
async function creditPoints(userId, amount, type, meta = {}, session = null) {
  if (amount <= 0) return null;
  const opts = session ? { session } : {};

  const user = await User.findById(userId).session(session || null);
  if (!user) throw new AppError('User not found', 404);

  const balanceBefore = user.virtualPoints || 0;
  const balanceAfter = balanceBefore + amount;

  const updateFields = {
    $inc: { virtualPoints: amount },
  };

  if (type === TRANSACTION_TYPE.GAME_WIN) {
    updateFields.$inc.totalPointsWon = amount;
    if (amount > (user.highestWin || 0)) {
      updateFields.$set = { highestWin: amount };
    }
  }

  await User.updateOne({ _id: userId }, updateFields, opts);

  const tx = await VirtualPointTransaction.create([{
    userId,
    telegramId: user.telegramId,
    type,
    status: TRANSACTION_STATUS.COMPLETED,
    amount,
    balanceBefore,
    balanceAfter,
    gameId: meta.gameId || null,
    cardId: meta.cardId || null,
    achievementCode: meta.achievementCode || null,
    adminId: meta.adminId || null,
    description: meta.description || `Credit: ${type}`,
    metadata: meta.metadata || null,
  }], opts);

  return tx[0];
}

/**
 * Atomically debit virtual points from a user
 */
async function debitPoints(userId, amount, type, meta = {}, session = null) {
  if (amount <= 0) return { transaction: null, user: await User.findById(userId) };
  const opts = session ? { session } : {};

  // Atomic debit with balance constraint
  const user = await User.findOneAndUpdate(
    { _id: userId, virtualPoints: { $gte: amount } },
    {
      $inc: {
        virtualPoints: -amount,
        totalPointsSpent: amount,
        ...(type === TRANSACTION_TYPE.CARD_PURCHASE ? { cardsPurchased: 1 } : {}),
      },
    },
    { new: true, ...opts }
  );

  if (!user) {
    const exists = await User.exists({ _id: userId });
    if (!exists) throw new AppError('User not found', 404);
    throw new AppError('Insufficient Birr balance', 400);
  }

  const tx = await VirtualPointTransaction.create([{
    userId,
    telegramId: user.telegramId,
    type,
    status: TRANSACTION_STATUS.COMPLETED,
    amount: -amount,
    balanceBefore: user.virtualPoints + amount,
    balanceAfter: user.virtualPoints,
    gameId: meta.gameId || null,
    cardId: meta.cardId || null,
    adminId: meta.adminId || null,
    description: meta.description || `Debit: ${type}`,
    metadata: meta.metadata || null,
  }], opts);

  return { transaction: tx[0], user };
}

/**
 * Calculate Daily Quest Streak Bonus (starts at 5 Birr, increments up to max 300 Birr)
 * Designed to reward daily retention while maintaining sustainable platform unit economics.
 */
function calculateStreakBonus(streakDay) {
  if (streakDay <= 1) return 5;
  const milestones = [0, 5, 7, 10, 14, 18, 23, 30]; // Days 1 to 7
  if (streakDay <= 7) return milestones[streakDay];
  // Day 8+: +5 Birr each consecutive day up to hard ceiling of 300 Birr
  const bonus = 30 + (streakDay - 7) * 5;
  return Math.min(300, bonus);
}

/**
 * Claim daily login quest reward with streak progression
 * Requirement: Player must login and play AT LEAST 5 games on the day.
 * Starts from 5 Birr on Day 1.
 * Increments each consecutive day up to max 300 Birr.
 * If player fails today (misses a day or < 5 games), streak resets back to 5 Birr next time.
 */
async function claimDailyReward(userId) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const todayGamesPlayed = user.lastGamePlayedDate === today ? (user.dailyGamesPlayed || 0) : 0;

  // Requirement: must have played at least 5 games today
  if (todayGamesPlayed < 5) {
    const remaining = 5 - todayGamesPlayed;
    throw new AppError(
      `Complete today's quest: play ${remaining} more ${remaining === 1 ? 'game' : 'games'} in the 75-Ball Arena to unlock your daily bonus! (${todayGamesPlayed}/5 played)`,
      400
    );
  }

  if (user.lastDailyRewardDate === today) {
    throw new AppError('Daily quest reward already claimed today. Come back tomorrow!', 400);
  }

  // Calculate streak & bonus: continuous streak increments; missed day resets to Day 1 (5 Birr)
  let newStreak = 1;
  if (user.lastDailyRewardDate) {
    const lastDate = new Date(user.lastDailyRewardDate);
    const currentDate = new Date(today);
    const diffDays = Math.round((currentDate - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      newStreak = (user.streakDays || 0) + 1;
    } else if (diffDays === 0) {
      throw new AppError('Daily quest reward already claimed today', 400);
    } else {
      // Missed one or more days: reset to Day 1 (5 Birr)
      newStreak = 1;
    }
  }

  const points = calculateStreakBonus(newStreak);

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        streakDays: newStreak,
        lastDailyRewardDate: today,
      },
    }
  );

  const tx = await creditPoints(userId, points, TRANSACTION_TYPE.DAILY_REWARD, {
    description: `Day ${newStreak} daily quest reward (+${points} Birr)`,
    metadata: { streakDays: newStreak, dailyGamesPlayed: todayGamesPlayed },
  });

  // Check streak achievements
  try {
    const { checkAndUnlockAchievements } = require('./achievementService');
    await checkAndUnlockAchievements(userId, 'streak_days', newStreak);
  } catch (err) {
    logger.warn('Failed to check streak achievements:', err.message);
  }

  const updatedUser = await User.findById(userId).select('virtualPoints streakDays lastDailyRewardDate dailyGamesPlayed');

  return {
    success: true,
    pointsAwarded: points,
    streakDays: newStreak,
    newBalance: updatedUser.virtualPoints,
    transaction: tx,
  };
}

/**
 * Get daily reward status, today's games played progress, and next reward amount
 */
async function getDailyRewardStatus(userId) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const today = new Date().toISOString().slice(0, 10);
  const isClaimedToday = user.lastDailyRewardDate === today;
  const todayGamesPlayed = user.lastGamePlayedDate === today ? (user.dailyGamesPlayed || 0) : 0;
  const hasMetPlayRequirement = todayGamesPlayed >= 5;

  // Streak calculation for preview
  let currentStreak = user.streakDays || 0;
  if (user.lastDailyRewardDate) {
    const lastDate = new Date(user.lastDailyRewardDate);
    const currentDate = new Date(today);
    const diffDays = Math.round((currentDate - lastDate) / (1000 * 60 * 60 * 24));
    if (diffDays > 1) {
      currentStreak = 0; // Streak broken if skipped a day, next will be Day 1
    }
  }

  const nextStreak = isClaimedToday ? currentStreak : currentStreak + 1;
  const nextRewardPoints = isClaimedToday ? calculateStreakBonus(currentStreak) : calculateStreakBonus(nextStreak);

  return {
    canClaim: !isClaimedToday && hasMetPlayRequirement,
    isClaimedToday,
    hasMetPlayRequirement,
    todayGamesPlayed,
    gamesRequired: 5,
    gamesRemaining: Math.max(0, 5 - todayGamesPlayed),
    streakDays: currentStreak,
    nextStreak,
    nextRewardPoints,
    maxBonusCap: 300,
    lastClaimDate: user.lastDailyRewardDate,
    streakRewards: [5, 7, 10, 14, 18, 23, 30],
  };
}

/**
 * Admin points adjustment with mandatory reason and audit log
 */
async function adminAdjustPoints(userId, adminUserId, amount, reason) {
  if (!amount || amount === 0) throw new AppError('Valid non-zero amount required', 400);
  if (!reason || reason.trim().length < 3) throw new AppError('Adjustment reason is required', 400);

  let tx;
  if (amount > 0) {
    tx = await creditPoints(userId, amount, TRANSACTION_TYPE.ADMIN_ADJUSTMENT, {
      adminId: adminUserId,
      description: `Admin adjustment: ${reason}`,
    });
  } else {
    const debitRes = await debitPoints(userId, Math.abs(amount), TRANSACTION_TYPE.ADMIN_ADJUSTMENT, {
      adminId: adminUserId,
      description: `Admin adjustment: ${reason}`,
    });
    tx = debitRes.transaction;
  }

  await AuditLog.create({
    action: AUDIT_ACTIONS.POINTS_ADJUSTED,
    actorType: 'admin',
    actorId: adminUserId,
    targetType: 'user',
    targetId: userId.toString(),
    details: { amount, reason, transactionId: tx?._id },
  });

  const updatedUser = await User.findById(userId).select('virtualPoints username firstName telegramId');
  return { transaction: tx, user: updatedUser };
}

/**
 * Calculate prize distribution
 */
function calculatePrize(prizePool, platformFeePercent = 0) {
  // In a free-to-play non-monetary virtual points system,
  // 100% of the prize pool goes to the players
  return {
    winnerPrize: prizePool,
    platformFee: 0,
  };
}

module.exports = {
  creditPoints,
  debitPoints,
  claimDailyReward,
  getDailyRewardStatus,
  adminAdjustPoints,
  calculatePrize,

  // Backward compatibility aliases
  creditBalance: creditPoints,
  debitBalance: debitPoints,
};

