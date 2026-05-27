const mongoose = require('mongoose');
const { DEPOSIT_STATUS, DEPOSIT_CHANNELS } = require('../config/constants');

const depositRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  telegramId: { type: String, index: true },
  amount: { type: Number, required: true },
  channel: {
    type: String,
    enum: DEPOSIT_CHANNELS,
    required: true,
  },
  userSmsText: { type: String, required: true },
  adminSmsText: { type: String, default: null },
  status: {
    type: String,
    enum: Object.values(DEPOSIT_STATUS),
    default: DEPOSIT_STATUS.PENDING,
  },
  matchedRef: { type: String, default: null }, // extracted reference from SMS
  matchedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  note: { type: String, default: null },
}, { timestamps: true });

depositRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('DepositRequest', depositRequestSchema);
