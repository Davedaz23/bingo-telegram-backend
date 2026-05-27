const mongoose = require('mongoose');
const { WITHDRAWAL_STATUS } = require('../config/constants');

const withdrawalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  telegramId: String,
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },

  amount: { type: Number, required: true, min: 1 },

  // Destination
  accountNumber: { type: String, required: true },
  bankName: { type: String },
  phoneNumber: { type: String },
  accountHolderName: { type: String },

  status: {
    type: String,
    enum: Object.values(WITHDRAWAL_STATUS),
    default: WITHDRAWAL_STATUS.PENDING,
    index: true,
  },

  // Admin processing
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  processedAt: Date,
  adminNote: { type: String, default: null },

  // Payment reference
  paymentReference: { type: String, default: null },
  gatewayResponse: { type: mongoose.Schema.Types.Mixed, default: null },

  rejectionReason: { type: String, default: null },

}, { timestamps: true });

withdrawalSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
