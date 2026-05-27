const mongoose = require('mongoose');
const { ROLES } = require('../config/constants');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  username: { type: String, default: null },
  firstName: { type: String, required: true },
  lastName: { type: String, default: null },
  languageCode: { type: String, default: 'en' },

  role: {
    type: String,
    enum: Object.values(ROLES),
    default: ROLES.USER,
  },

  // Wallet
  balance: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalDeposited: { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },
  totalWon: { type: Number, default: 0 },

  // Stats
  gamesPlayed: { type: Number, default: 0 },
  gamesWon: { type: Number, default: 0 },

  // Status
  isActive: { type: Boolean, default: true },
  isBanned: { type: Boolean, default: false },
  banReason: { type: String, default: null },

  lastSeen: { type: Date, default: Date.now },

  // Payment info (encrypted at service layer)
  paymentInfo: {
    accountNumber: { type: String, default: null },
    bankName: { type: String, default: null },
    phoneNumber: { type: String, default: null },
  },
}, {
  timestamps: true,
});

userSchema.virtual('fullName').get(function () {
  return `${this.firstName}${this.lastName ? ' ' + this.lastName : ''}`;
});

userSchema.methods.canAfford = function (amount) {
  return this.balance >= amount;
};

userSchema.index({ role: 1 });
userSchema.index({ balance: 1 });

module.exports = mongoose.model('User', userSchema);
