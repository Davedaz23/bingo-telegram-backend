const mongoose = require('mongoose');
const { ROLES, USER_STATUS, ECONOMY } = require('../config/constants');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  username: { type: String, default: null, trim: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, default: null, trim: true },
  photoUrl: { type: String, default: null },
  languageCode: { type: String, default: 'en' },

  // Admin / Dev email login
  email: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    default: null,
  },

  role: {
    type: String,
    enum: Object.values(ROLES),
    default: ROLES.USER,
    index: true,
  },

  status: {
    type: String,
    enum: Object.values(USER_STATUS),
    default: USER_STATUS.ACTIVE,
    index: true,
  },
  statusReason: { type: String, default: null },

  // Non-redeemable Virtual Points balance
  virtualPoints: {
    type: Number,
    default: ECONOMY.WELCOME_BONUS_POINTS,
    min: 0,
    index: true,
  },

  // Gaming Statistics
  gamesPlayed: { type: Number, default: 0 },
  dailyGamesPlayed: { type: Number, default: 0 },
  lastGamePlayedDate: { type: String, default: null }, // format: 'YYYY-MM-DD'
  gamesWon: { type: Number, default: 0, index: true },
  totalPointsWon: { type: Number, default: 0, index: true },
  totalPointsSpent: { type: Number, default: 0 },
  cardsPurchased: { type: Number, default: 0 },
  highestWin: { type: Number, default: 0 },

  // Daily Rewards & Engagement
  streakDays: { type: Number, default: 0 },
  lastDailyRewardDate: { type: String, default: null }, // format: 'YYYY-MM-DD'

  // Responsible Play Controls
  dailyPlayTimeLimitMinutes: { type: Number, default: 0 }, // 0 = unlimited
  dailyPointsLossLimit: { type: Number, default: 0 },       // 0 = unlimited
  selfExclusionUntil: { type: Date, default: null },

  lastSeen: { type: Date, default: Date.now },
  passwordResetToken: { type: String, default: null },
  passwordResetExpires: { type: Date, default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual for backward-compatibility with older balance references
userSchema.virtual('balance').get(function () {
  return this.virtualPoints;
}).set(function (val) {
  this.virtualPoints = val;
});

userSchema.virtual('fullName').get(function () {
  return `${this.firstName}${this.lastName ? ' ' + this.lastName : ''}`.trim();
});

userSchema.virtual('isActive').get(function () {
  return this.status === USER_STATUS.ACTIVE;
});

userSchema.virtual('isBanned').get(function () {
  return this.status === USER_STATUS.SUSPENDED;
});

userSchema.virtual('winRate').get(function () {
  if (!this.gamesPlayed || this.gamesPlayed === 0) return 0;
  return Math.round((this.gamesWon / this.gamesPlayed) * 100);
});

userSchema.methods.canAfford = function (points) {
  return (this.virtualPoints || 0) >= points;
};

// Compound Indexes for fast leaderboard queries
userSchema.index({ status: 1, gamesWon: -1, totalPointsWon: -1 });
userSchema.index({ status: 1, virtualPoints: -1 });

module.exports = mongoose.model('User', userSchema);
