const mongoose = require('mongoose');
const { TRANSACTION_TYPE, TRANSACTION_STATUS } = require('../config/constants');

const transactionSchema = new mongoose.Schema({
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
  },

  status: {
    type: String,
    enum: Object.values(TRANSACTION_STATUS),
    default: TRANSACTION_STATUS.PENDING,
  },

  amount: { type: Number, required: true },
  balanceBefore: { type: Number },
  balanceAfter: { type: Number },

  // Reference to related entity
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
  cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'BingoCard', default: null },
  relatedTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },

  // For transfers
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  toTelegramId: { type: String, default: null },

  // Payment gateway fields
  paymentReference: { type: String, default: null, index: true },
  paymentGateway: { type: String, default: null },
  gatewayResponse: { type: mongoose.Schema.Types.Mixed, default: null },

  description: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null },

  failureReason: { type: String, default: null },

}, { timestamps: true });

transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ paymentReference: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
