const { v4: uuidv4 } = require('uuid');
const DepositRequest = require('../models/DepositRequest');
const Transaction = require('../models/Transaction');
const { creditBalance } = require('./walletService');
const { TRANSACTION_TYPE, TRANSACTION_STATUS, DEPOSIT_STATUS, DEPOSIT_CHANNELS } = require('../config/constants');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * Extract a reference number from SMS text
 * Looks for common patterns like "Ref: XYZ", "Trx: XYZ", or a sequence of digits
 */
function extractReference(smsText) {
  const refPatterns = [
    /(?:ref|reference|trx|transaction|receipt)[:\s]*([A-Z0-9]{6,})/i,
    /([A-Z0-9]{8,20})/,
  ];
  for (const pattern of refPatterns) {
    const match = smsText.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Extract amount from SMS text
 */
function extractAmount(smsText) {
  const match = smsText.match(/(?:birr|etb|amount|amt)[:\s]*([\d,]+)/i) ||
                smsText.match(/([\d,]+)\s*(?:birr|etb)/i);
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  return null;
}

/**
 * Request a deposit via SMS (user side)
 */
async function requestSmsDeposit(userId, amount, channel, userSmsText) {
  if (!DEPOSIT_CHANNELS.includes(channel)) {
    throw new AppError(`Invalid channel. Use: ${DEPOSIT_CHANNELS.join(', ')}`, 400);
  }
  if (amount < 10) throw new AppError('Minimum deposit is 10 ETB', 400);
  if (amount > 50000) throw new AppError('Maximum deposit is 50,000 ETB', 400);
  if (!userSmsText || userSmsText.length < 5) throw new AppError('Valid SMS text required', 400);

  const User = require('../models/User');
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const deposit = await DepositRequest.create({
    userId,
    telegramId: user.telegramId,
    amount,
    channel,
    userSmsText,
    status: DEPOSIT_STATUS.PENDING,
  });

  logger.info(`SMS deposit requested: ${deposit._id} | User: ${userId} | Amount: ${amount} | Channel: ${channel}`);
  return {
    depositId: deposit._id,
    amount: deposit.amount,
    channel: deposit.channel,
    status: deposit.status,
  };
}

/**
 * Admin matches SMS and confirms deposit
 */
async function matchAndConfirmDeposit(depositId, adminSmsText, adminUserId) {
  const deposit = await DepositRequest.findById(depositId);
  if (!deposit) throw new AppError('Deposit request not found', 404);
  if (deposit.status !== DEPOSIT_STATUS.PENDING) {
    throw new AppError('Deposit already processed', 400);
  }
  if (!adminSmsText || adminSmsText.length < 5) throw new AppError('Valid admin SMS text required', 400);

  const userRef = extractReference(deposit.userSmsText);
  const adminRef = extractReference(adminSmsText);
  const userAmount = extractAmount(deposit.userSmsText);
  const adminAmount = extractAmount(adminSmsText);

  const amountMatch = adminAmount && Math.abs(adminAmount - deposit.amount) <= 1;
  const refMatch = userRef && adminRef && userRef === adminRef;

  deposit.adminSmsText = adminSmsText;
  deposit.matchedRef = adminRef || userRef || null;
  deposit.processedBy = adminUserId;

  if (amountMatch || refMatch) {
    deposit.status = DEPOSIT_STATUS.SMS_MATCHED;
    deposit.matchedAt = new Date();
    await deposit.save();

    await completeDeposit(deposit);
  } else {
    deposit.status = DEPOSIT_STATUS.COMPLETED;
    deposit.matchedAt = new Date();
    await deposit.save();

    await completeDeposit(deposit);
  }

  logger.info(`SMS deposit matched & confirmed: ${depositId} | User: ${deposit.userId} | Amount: ${deposit.amount}`);
  return { depositId: deposit._id, amount: deposit.amount, status: deposit.status };
}

/**
 * Admin manually confirms a deposit (bypass SMS matching)
 */
async function adminConfirmDeposit(depositId, adminUserId) {
  const deposit = await DepositRequest.findById(depositId);
  if (!deposit) throw new AppError('Deposit request not found', 404);
  if (deposit.status !== DEPOSIT_STATUS.PENDING) {
    throw new AppError('Deposit already processed', 400);
  }

  deposit.status = DEPOSIT_STATUS.COMPLETED;
  deposit.matchedAt = new Date();
  deposit.processedBy = adminUserId;
  await deposit.save();

  await completeDeposit(deposit);

  logger.info(`SMS deposit manually confirmed: ${depositId} | User: ${deposit.userId} | Amount: ${deposit.amount}`);
  return { depositId: deposit._id, amount: deposit.amount, status: deposit.status };
}

async function completeDeposit(deposit) {
  const txRef = `BNG-DEP-${uuidv4().replace(/-/g, '').slice(0, 16).toUpperCase()}`;

  await Transaction.create({
    userId: deposit.userId,
    telegramId: deposit.telegramId,
    type: TRANSACTION_TYPE.DEPOSIT,
    status: TRANSACTION_STATUS.COMPLETED,
    amount: deposit.amount,
    paymentReference: txRef,
    paymentGateway: deposit.channel,
    description: `Deposit ${deposit.amount} ETB via ${deposit.channel}`,
    metadata: {
      depositRequestId: deposit._id,
      matchedRef: deposit.matchedRef,
    },
  });

  await creditBalance(deposit.userId, deposit.amount, TRANSACTION_TYPE.DEPOSIT, {
    paymentReference: txRef,
    description: `Deposit ${deposit.amount} ETB via ${deposit.channel}`,
  });

  deposit.status = DEPOSIT_STATUS.COMPLETED;
  deposit.completedAt = new Date();
  await deposit.save();
}

module.exports = { requestSmsDeposit, matchAndConfirmDeposit, adminConfirmDeposit };
