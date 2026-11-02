const Achievement = require('../models/Achievement');
const UserAchievement = require('../models/UserAchievement');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { creditPoints } = require('./virtualPointsService');
const { TRANSACTION_TYPE, AUDIT_ACTIONS } = require('../config/constants');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * Check if the user meets any locked achievements for a given metric and unlock them
 */
async function checkAndUnlockAchievements(userId, requirementType, currentValue) {
  try {
    const candidateAchievements = await Achievement.find({
      isActive: true,
      requirementType,
      requirementValue: { $lte: currentValue },
    });

    if (!candidateAchievements || candidateAchievements.length === 0) return [];

    const existingUserAchievements = await UserAchievement.find({
      userId,
      achievementCode: { $in: candidateAchievements.map(a => a.code) },
    }).select('achievementCode');

    const unlockedCodes = new Set(existingUserAchievements.map(ua => ua.achievementCode));
    const newlyUnlocked = [];

    for (const achievement of candidateAchievements) {
      if (!unlockedCodes.has(achievement.code)) {
        await UserAchievement.create({
          userId,
          achievementCode: achievement.code,
          achievementId: achievement._id,
          unlockedAt: new Date(),
          rewardClaimed: true, // auto-claim rewards for great UX
          rewardClaimedAt: new Date(),
        });

        // Credit points reward
        await creditPoints(userId, achievement.pointsReward, TRANSACTION_TYPE.ACHIEVEMENT_REWARD, {
          achievementCode: achievement.code,
          description: `Achievement Unlocked: ${achievement.title} (+${achievement.pointsReward} VP)`,
        });

        await AuditLog.create({
          action: AUDIT_ACTIONS.ACHIEVEMENT_UNLOCKED,
          actorType: 'system',
          targetType: 'user',
          targetId: userId.toString(),
          details: { achievementCode: achievement.code, pointsReward: achievement.pointsReward },
        });

        newlyUnlocked.push(achievement);
        logger.info(`User ${userId} unlocked achievement: ${achievement.code} (+${achievement.pointsReward} VP)`);
      }
    }

    return newlyUnlocked;
  } catch (err) {
    logger.error('Error checking achievements:', err);
    return [];
  }
}

/**
 * Get all achievements with unlocked status for a user
 */
async function getUserAchievements(userId) {
  const [allAchievements, userAchievements] = await Promise.all([
    Achievement.find({ isActive: true }).sort({ category: 1, requirementValue: 1 }),
    UserAchievement.find({ userId }),
  ]);

  const userAchMap = new Map();
  for (const ua of userAchievements) {
    userAchMap.set(ua.achievementCode, ua);
  }

  return allAchievements.map(ach => {
    const ua = userAchMap.get(ach.code);
    return {
      _id: ach._id,
      code: ach.code,
      title: ach.title,
      description: ach.description,
      icon: ach.icon,
      category: ach.category,
      pointsReward: ach.pointsReward,
      requirementType: ach.requirementType,
      requirementValue: ach.requirementValue,
      isUnlocked: !!ua,
      unlockedAt: ua?.unlockedAt || null,
      rewardClaimed: ua?.rewardClaimed || false,
    };
  });
}

module.exports = {
  checkAndUnlockAchievements,
  getUserAchievements,
};

