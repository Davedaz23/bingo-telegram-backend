const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { TRANSACTION_TYPE, TRANSACTION_STATUS } = require('../config/constants');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * Credit a user's balance atomically.
 * Always use a MongoDB session for atomicity.
 */
async function creditBalance(userId, amount, type, meta = {}, session = null) {
  const opts = session ? { session } : {};
  const user = await User.findById(userId).session(session || null);
  if (!user) throw new AppError('User not found', 404);

  const balanceBefore = user.balance;
  const balanceAfter = balanceBefore + amount;

  await User.updateOne(
    { _id: userId },
    {
      $inc: { balance: amount },
      ...(type === TRANSACTION_TYPE.GAME_WIN ? { $inc: { balance: amount, totalWon: amount } } : {}),
      ...(type === TRANSACTION_TYPE.DEPOSIT ? { $inc: { balance: amount, totalDeposited: amount } } : {}),
    },
    opts
  );

  const tx = await Transaction.create([{
    userId,
    telegramId: user.telegramId,
    type,
    status: TRANSACTION_STATUS.COMPLETED,
    amount,
    balanceBefore,
    balanceAfter,
    ...meta,
  }], opts);

  return tx[0];
}

/**
 * Debit a user's balance atomically.
 * Throws if insufficient funds.
 */
async function debitBalance(userId, amount, type, meta = {}, session = null) {
  const opts = session ? { session } : {};

  // Atomic debit: only succeeds if balance >= amount
  const user = await User.findOneAndUpdate(
    { _id: userId, balance: { $gte: amount } },
    {
      $inc: {
        balance: -amount,
        ...(type === TRANSACTION_TYPE.WITHDRAWAL ? { totalWithdrawn: amount } : {}),
      },
    },
    { new: true, ...opts }
  );

  if (!user) {
    // Check if user exists at all
    const exists = await User.exists({ _id: userId });
    if (!exists) throw new AppError('User not found', 404);
    throw new AppError('Insufficient balance', 400);
  }

  const tx = await Transaction.create([{
    userId,
    telegramId: user.telegramId,
    type,
    status: TRANSACTION_STATUS.COMPLETED,
    amount,
    balanceBefore: user.balance + amount, // before debit
    balanceAfter: user.balance,
    ...meta,
  }], opts);

  return { transaction: tx[0], user };
}

/**
 * Transfer between two users atomically using a session.
 */
async function transferBalance(fromUserId, toUserId, amount, meta = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Debit sender
    const { transaction: debitTx, user: sender } = await debitBalance(
      fromUserId,
      amount,
      TRANSACTION_TYPE.TRANSFER,
      { toUserId, description: meta.description, gameId: meta.gameId },
      session
    );

    // Credit receiver
    const creditTx = await creditBalance(
      toUserId,
      amount,
      TRANSACTION_TYPE.TRANSFER,
      { relatedTransactionId: debitTx._id, description: meta.description },
      session
    );

    // Link transactions
    await Transaction.updateOne(
      { _id: debitTx._id },
      { relatedTransactionId: creditTx._id },
      { session }
    );

    await session.commitTransaction();
    logger.info(`Transfer: ${fromUserId} → ${toUserId} | ${amount}`);
    return { debitTx, creditTx };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

/**
 * Collect platform fee from prize pool.
 */
function calculatePrize(prizePool, feePercent) {
  const fee = Math.floor((prizePool * feePercent) / 100);
  const winnerPrize = prizePool - fee;
  return { winnerPrize, platformFee: fee };
}

/**
 * Get a user's balance safely.
 */
async function getBalance(userId) {
  const user = await User.findById(userId).select('balance');
  if (!user) throw new AppError('User not found', 404);
  return user.balance;
}

module.exports = {
  creditBalance,
  debitBalance,
  transferBalance,
  calculatePrize,
  getBalance,
};
