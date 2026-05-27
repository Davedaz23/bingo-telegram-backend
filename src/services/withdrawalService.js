const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const { debitBalance, creditBalance } = require('./walletService');
const { TRANSACTION_TYPE, WITHDRAWAL_STATUS } = require('../config/constants');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const { getIO } = require('../socket/socketManager');

const MIN_WITHDRAWAL = 50;
const MAX_WITHDRAWAL = 100000;

/**
 * Create a withdrawal request
 */
async function requestWithdrawal(userId, amount, paymentDetails) {
  if (amount < MIN_WITHDRAWAL) throw new AppError(`Minimum withdrawal is ${MIN_WITHDRAWAL} ETB`, 400);
  if (amount > MAX_WITHDRAWAL) throw new AppError(`Maximum withdrawal is ${MAX_WITHDRAWAL} ETB`, 400);

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  if (!user.canAfford(amount)) throw new AppError('Insufficient balance', 400);

  // Prevent multiple pending withdrawals
  const pendingExists = await Withdrawal.exists({
    userId,
    status: { $in: [WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.PROCESSING] },
  });
  if (pendingExists) throw new AppError('You already have a pending withdrawal request', 400);

  // Debit balance immediately (hold funds)
  const { transaction } = await debitBalance(userId, amount, TRANSACTION_TYPE.WITHDRAWAL, {
    description: `Withdrawal request of ${amount} ETB`,
  });

  const withdrawal = await Withdrawal.create({
    userId,
    telegramId: user.telegramId,
    transactionId: transaction._id,
    amount,
    accountNumber: paymentDetails.accountNumber,
    bankName: paymentDetails.bankName,
    phoneNumber: paymentDetails.phoneNumber,
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
async function processWithdrawal(withdrawalId, adminUserId) {
  const withdrawal = await Withdrawal.findOneAndUpdate(
    { _id: withdrawalId, status: WITHDRAWAL_STATUS.PENDING },
    { status: WITHDRAWAL_STATUS.PROCESSING, processedBy: adminUserId, processedAt: new Date() },
    { new: true }
  );
  if (!withdrawal) throw new AppError('Withdrawal not found or already processing', 404);

  // In a real system you'd call a payment API here.
  // For now, mark as completed manually.
  await Withdrawal.updateOne(
    { _id: withdrawalId },
    { status: WITHDRAWAL_STATUS.COMPLETED, processedAt: new Date() }
  );

  // Notify user
  getIO().to(`user:${withdrawal.userId}`).emit('withdrawal:completed', {
    withdrawalId,
    amount: withdrawal.amount,
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
