const mongoose = require('mongoose');
const { TRANSACTION_TYPE, TRANSACTION_STATUS } = require('../config/constants');

const virtualPointTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  telegramId: { type: String, index: true },

  type: {
    type: String,
    enum: Object.values(TRANSACTION_TYPE),
    required: true,
    index: true,
  },

  status: {
    type: String,
    enum: Object.values(TRANSACTION_STATUS),
    default: TRANSACTION_STATUS.COMPLETED,
  },

  amount: {
    type: Number,
    required: true,
  },

  balanceBefore: {
    type: Number,
    required: true,
  },

  balanceAfter: {
    type: Number,
    required: true,
  },

  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    default: null,
    index: true,
  },

  cardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BingoCard',
    default: null,
  },

  achievementCode: {
    type: String,
    default: null,
  },

  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  description: {
    type: String,
    default: null,
  },

  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
}, {
  timestamps: true,
});

virtualPointTransactionSchema.index({ userId: 1, createdAt: -1 });
virtualPointTransactionSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('VirtualPointTransaction', virtualPointTransactionSchema);

