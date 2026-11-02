const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const { debitBalance, creditBalance } = require('./walletService');
const { TRANSACTION_TYPE, WITHDRAWAL_STATUS } = require('../config/constants');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const { getIO } = require('../socket/socketManager');

const MIN_WITHDRAWAL = 10;
const MAX_WITHDRAWAL = 100000;

/**
 * Create a withdrawal request
 */
async function requestWithdrawal(userId, amount, paymentDetails) {
  if (amount < MIN_WITHDRAWAL) throw new AppError(`Minimum withdrawal is ${MIN_WITHDRAWAL} Birr`, 400);
  if (amount > MAX_WITHDRAWAL) throw new AppError(`Maximum withdrawal is ${MAX_WITHDRAWAL} Birr`, 400);

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  if (!user.canAfford(amount)) throw new AppError(`Insufficient balance. You have ${user.virtualPoints} Birr`, 400);

  // Prevent multiple pending withdrawals
  const pendingExists = await Withdrawal.exists({
    userId,
    status: { $in: [WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.PROCESSING] },
  });
  if (pendingExists) throw new AppError('You already have a pending withdrawal request in progress', 400);

  // Debit balance immediately (hold funds in escrow)
  const { transaction } = await debitBalance(userId, amount, TRANSACTION_TYPE.WITHDRAWAL, {
    description: `Withdrawal request: ${amount} Birr via ${(paymentDetails.channel || 'telebirr').toUpperCase()}`,
  });

  const accountOrPhone = paymentDetails.accountNumber || paymentDetails.phoneNumber;
  if (!accountOrPhone) throw new AppError('Account number or phone number is required', 400);

  const withdrawal = await Withdrawal.create({
    userId,
    telegramId: user.telegramId,
    transactionId: transaction._id,
    amount,
    channel: paymentDetails.channel || 'telebirr',
    accountNumber: accountOrPhone,
    bankName: paymentDetails.bankName || paymentDetails.channel,
    phoneNumber: paymentDetails.phoneNumber || accountOrPhone,
    accountHolderName: paymentDetails.accountHolderName || user.fullName,
    status: WITHDRAWAL_STATUS.PENDING,
  });

  // Notify admins
  getIO().to('admins').emit('withdrawal:new', {
    withdrawalId: withdrawal._id,
    userId,
    amount,
    telegramId: user.telegramId,
    username: user.username,
  });

  logger.info(`Withdrawal request: ${withdrawal._id} | User: ${userId} | Amount: ${amount}`);
  return withdrawal;
}

/**
 * Admin: approve and process withdrawal
 */
async function processWithdrawal(withdrawalId, adminUserId, paymentReference = null) {
  const withdrawal = await Withdrawal.findOneAndUpdate(
    { _id: withdrawalId, status: { $in: [WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.PROCESSING] } },
    {
      status: WITHDRAWAL_STATUS.COMPLETED,
      processedBy: adminUserId,
      processedAt: new Date(),
      ...(paymentReference ? { paymentReference } : {}),
    },
    { new: true }
  );
  if (!withdrawal) throw new AppError('Withdrawal not found or already processed', 404);

  // Notify user
  getIO().to(`user:${withdrawal.userId}`).emit('withdrawal:completed', {
    withdrawalId,
    amount: withdrawal.amount,
    paymentReference,
  });

  logger.info(`Withdrawal processed: ${withdrawalId} by admin ${adminUserId}`);
  return withdrawal;
}

/**
 * Admin: reject withdrawal and refund balance
 */
async function rejectWithdrawal(withdrawalId, adminUserId, reason) {
  const withdrawal = await Withdrawal.findOneAndUpdate(
    { _id: withdrawalId, status: { $in: [WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.PROCESSING] } },
    {
      status: WITHDRAWAL_STATUS.REJECTED,
      rejectionReason: reason,
      processedBy: adminUserId,
      processedAt: new Date(),
    },
    { new: true }
  );
  if (!withdrawal) throw new AppError('Withdrawal not found or already finalized', 404);

  // Refund the held amount back to user
  await creditBalance(withdrawal.userId, withdrawal.amount, TRANSACTION_TYPE.REFUND, {
    relatedTransactionId: withdrawal.transactionId,
    description: `Withdrawal rejected: ${reason}`,
  });

  getIO().to(`user:${withdrawal.userId}`).emit('withdrawal:rejected', {
    withdrawalId,
    amount: withdrawal.amount,
    reason,
  });

  logger.info(`Withdrawal rejected: ${withdrawalId} by admin ${adminUserId}`);
  return withdrawal;
}

module.exports = { requestWithdrawal, processWithdrawal, rejectWithdrawal };
