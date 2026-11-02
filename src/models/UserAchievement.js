const mongoose = require('mongoose');

const userAchievementSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  achievementCode: {
    type: String,
    required: true,
    index: true,
  },
  achievementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Achievement',
    default: null,
  },
  unlockedAt: {
    type: Date,
    default: Date.now,
  },
  rewardClaimed: {
    type: Boolean,
    default: false,
  },
  rewardClaimedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

userAchievementSchema.index({ userId: 1, achievementCode: 1 }, { unique: true });

module.exports = mongoose.model('UserAchievement', userAchievementSchema);

