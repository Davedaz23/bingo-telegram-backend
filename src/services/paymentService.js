const { v4: uuidv4 } = require('uuid');
const DepositRequest = require('../models/DepositRequest');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { creditBalance } = require('./walletService');
const { TRANSACTION_TYPE, TRANSACTION_STATUS, DEPOSIT_STATUS, DEPOSIT_CHANNELS } = require('../config/constants');
const { getIO } = require('../socket/socketManager');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * Extract a transaction reference / ID from SMS text
 * Handles:
 * - Telebirr: "Transaction number is 8GH4K9LM" / "Transaction ID: ..."
 * - CBE Bank: "Ref: FT26306QWXYZ" / "Reference: ..." / "FT..."
 * - CBE Birr: "Transaction ID is 123456789"
 * - Generic: "Receipt No: ..." / "Trx: ..."
 */
function extractReference(smsText) {
  if (!smsText) return null;
  const cleaned = smsText.replace(/\r?\n/g, ' ').trim();

  // 1. Explicit transaction ID/number
  const txnMatch = cleaned.match(/(?:transaction\s*(?:number|id|no)|txn\s*(?:id|no|num)?|receipt\s*(?:no|num)?)[:\s]+(?:is\s*)?([A-Z0-9]{6,25})/i);
  if (txnMatch) return txnMatch[1].toUpperCase();

  // 2. CBE Bank Ref pattern: "Ref: FT26...", "Reference: FT...", "Ref No: ..."
  const refMatch = cleaned.match(/(?:ref(?:erence)?(?:\s*no)?|rrn)[:\s]+([A-Z0-9]{6,25})/i);
  if (refMatch) return refMatch[1].toUpperCase();

  // 3. Standalone FT reference (CBE standard format: FT followed by digits/letters)
  const cbeFtMatch = cleaned.match(/\b(FT[0-9A-Z]{8,22})\b/i);
  if (cbeFtMatch) return cbeFtMatch[1].toUpperCase();

  // 4. Standalone alphanumeric token of length 8-20 (e.g. Telebirr alphanumeric code)
  const tokens = cleaned.split(/\s+/);
  for (const token of tokens) {
    const cleanToken = token.replace(/[^A-Za-z0-9]/g, '');
    if (cleanToken.length >= 8 && cleanToken.length <= 16 && /[A-Z]/.test(cleanToken) && /[0-9]/.test(cleanToken)) {
      return cleanToken.toUpperCase();
    }
  }

  return null;
}

/**
 * Extract amount in ETB / Birr from SMS text
 */
function extractAmount(smsText) {
  if (!smsText) return null;
  const cleaned = smsText.replace(/\r?\n/g, ' ').trim();

  const patterns = [
    /(?:transferred|received|debited|credited|paid|amount|amt)[:\s]*(?:etb|birr)?[:\s]*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:etb|birr)[:\s]*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:birr|etb)/i,
  ];

  for (const p of patterns) {
    const m = cleaned.match(p);
    if (m && m[1]) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) return val;
    }
  }

  return null;
}

/**
 * Request a deposit via SMS (User Side)
 */
async function requestSmsDeposit(userId, amount, channel, userSmsText) {
  if (!channel || !DEPOSIT_CHANNELS.includes(channel.toLowerCase())) {
    throw new AppError(`Invalid payment channel. Available: ${DEPOSIT_CHANNELS.join(', ')}`, 400);
  }
  if (!userSmsText || userSmsText.trim().length < 5) {
    throw new AppError('Valid transfer confirmation SMS text is required', 400);
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const extractedAmt = extractAmount(userSmsText);
  const finalAmount = amount > 0 ? amount : (extractedAmt || 0);

  if (finalAmount < 10) throw new AppError('Minimum deposit is 10 Birr', 400);
  if (finalAmount > 100000) throw new AppError('Maximum deposit is 100,000 Birr', 400);

  const userRef = extractReference(userSmsText);

  // Check if this reference was already completed
  if (userRef) {
    const duplicate = await DepositRequest.findOne({
      matchedRef: userRef,
      status: DEPOSIT_STATUS.COMPLETED,
    });
    if (duplicate) {
      throw new AppError('This transaction reference has already been claimed and processed', 400);
    }
  }

  const deposit = await DepositRequest.create({
    userId,
    telegramId: user.telegramId,
    amount: finalAmount,
    channel: channel.toLowerCase(),
    userSmsText: userSmsText.trim(),
    matchedRef: userRef,
    status: DEPOSIT_STATUS.PENDING,
  });

  try {
    getIO().to('admins').emit('deposit:new', {
      depositId: deposit._id,
      userId,
      username: user.username,
      firstName: user.firstName,
      amount: deposit.amount,
      channel: deposit.channel,
      matchedRef: userRef,
    });
  } catch {}

  logger.info(`Deposit requested: ${deposit._id} | User: ${userId} | Amount: ${finalAmount} Birr | Ref: ${userRef}`);

  return {
    depositId: deposit._id,
    amount: deposit.amount,
    channel: deposit.channel,
    matchedRef: userRef,
    status: deposit.status,
  };
}

/**
 * Global Auto-Match: Admin pastes bank/telebirr SMS into a single box
 * System searches all pending deposits for matching Reference and Amount
 */
async function autoMatchSmsDeposit(adminSmsText, adminUserId) {
  if (!adminSmsText || adminSmsText.trim().length < 5) {
    throw new AppError('Valid bank/telebirr SMS text is required', 400);
  }

  const adminRef = extractReference(adminSmsText);
  const adminAmount = extractAmount(adminSmsText);

  if (!adminRef && !adminAmount) {
    throw new AppError('Could not detect a valid transaction reference or amount from the provided SMS text', 400);
  }

  // Find matching pending deposit
  let deposit = null;

  // 1. Priority match: exact reference
  if (adminRef) {
    deposit = await DepositRequest.findOne({
      status: DEPOSIT_STATUS.PENDING,
      matchedRef: adminRef,
    }).populate('userId', 'firstName username telegramId');
  }

  // 2. Secondary match: amount match with userSms containing reference or amount
  if (!deposit && adminAmount) {
    const candidates = await DepositRequest.find({
      status: DEPOSIT_STATUS.PENDING,
      amount: adminAmount,
    }).populate('userId', 'firstName username telegramId');

    if (candidates.length === 1) {
      deposit = candidates[0];
    } else if (candidates.length > 1 && adminRef) {
      // Find candidate whose userSmsText contains adminRef
      deposit = candidates.find(c => c.userSmsText.toUpperCase().includes(adminRef)) || candidates[0];
    }
  }

  if (!deposit) {
    throw new AppError(
      `No pending deposit found matching reference "${adminRef || 'N/A'}" and amount "${adminAmount ? adminAmount + ' Birr' : 'N/A'}".`,
      404
    );
  }

  deposit.adminSmsText = adminSmsText.trim();
  deposit.matchedRef = adminRef || deposit.matchedRef;
  deposit.processedBy = adminUserId;
  deposit.matchedAt = new Date();

  await completeDeposit(deposit);

  return {
    matched: true,
    matchedDeposit: deposit,
    depositId: deposit._id,
    amount: deposit.amount,
    channel: deposit.channel,
    user: deposit.userId,
    reference: deposit.matchedRef,
  };
}

/**
 * Admin matches SMS for a specific pending deposit
 */
async function matchAndConfirmDeposit(depositId, adminSmsText, adminUserId) {
  const deposit = await DepositRequest.findById(depositId).populate('userId', 'firstName username telegramId');
  if (!deposit) throw new AppError('Deposit request not found', 404);
  if (deposit.status !== DEPOSIT_STATUS.PENDING) {
    throw new AppError('Deposit already processed', 400);
  }
  if (!adminSmsText || adminSmsText.trim().length < 5) throw new AppError('Valid admin SMS text required', 400);

  const userRef = deposit.matchedRef || extractReference(deposit.userSmsText);
  const adminRef = extractReference(adminSmsText);
  const adminAmount = extractAmount(adminSmsText);

  const amountMatch = adminAmount && Math.abs(adminAmount - deposit.amount) <= 1;
  const refMatch = userRef && adminRef && (userRef === adminRef || deposit.userSmsText.toUpperCase().includes(adminRef) || adminSmsText.toUpperCase().includes(userRef));

  if (!amountMatch && !refMatch) {
    throw new AppError(
      `Parameters do not match: Expected amount ${deposit.amount} Birr, got ${adminAmount || 'unknown'} Birr. Ref: user=${userRef || 'none'}, admin=${adminRef || 'none'}.`,
      400
    );
  }

  deposit.adminSmsText = adminSmsText.trim();
  deposit.matchedRef = adminRef || userRef || deposit.matchedRef;
  deposit.processedBy = adminUserId;
  deposit.matchedAt = new Date();
  deposit.status = DEPOSIT_STATUS.SMS_MATCHED;

  await completeDeposit(deposit);

  logger.info(`Deposit matched & confirmed: ${depositId} | User: ${deposit.userId._id} | Amount: ${deposit.amount} Birr`);
  return { depositId: deposit._id, amount: deposit.amount, status: deposit.status, user: deposit.userId };
}

/**
 * Admin manually confirms a deposit (1-click bypass)
 */
async function adminConfirmDeposit(depositId, adminUserId) {
  const deposit = await DepositRequest.findById(depositId).populate('userId', 'firstName username telegramId');
  if (!deposit) throw new AppError('Deposit request not found', 404);
  if (deposit.status !== DEPOSIT_STATUS.PENDING) {
    throw new AppError('Deposit already processed', 400);
  }

  deposit.processedBy = adminUserId;
  deposit.matchedAt = new Date();

  await completeDeposit(deposit);

  logger.info(`Deposit manually approved: ${depositId} | User: ${deposit.userId._id} | Amount: ${deposit.amount}`);
  return { depositId: deposit._id, amount: deposit.amount, status: deposit.status, user: deposit.userId };
}

/**
 * Admin rejects a deposit request with a reason
 */
async function rejectDeposit(depositId, adminUserId, reason = 'Transaction not found or invalid') {
  const deposit = await DepositRequest.findById(depositId);
  if (!deposit) throw new AppError('Deposit request not found', 404);
  if (deposit.status !== DEPOSIT_STATUS.PENDING) {
    throw new AppError('Deposit already processed', 400);
  }

  deposit.status = DEPOSIT_STATUS.REJECTED;
  deposit.processedBy = adminUserId;
  deposit.note = reason;
  await deposit.save();

  try {
    getIO().to(`user:${deposit.userId}`).emit('deposit:rejected', {
      depositId: deposit._id,
      amount: deposit.amount,
      reason,
    });
  } catch {}

  logger.info(`Deposit rejected: ${depositId} | Reason: ${reason}`);
  return { depositId: deposit._id, status: deposit.status, reason };
}

/**
 * Finalize deposit: credit Birr balance and notify user
 */
async function completeDeposit(deposit) {
  const txRef = `BNG-DEP-${uuidv4().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
  const amount = deposit.amount;

  const { user } = await creditBalance(deposit.userId._id || deposit.userId, amount, TRANSACTION_TYPE.DEPOSIT, {
    paymentReference: deposit.matchedRef || txRef,
    description: `Deposit ${deposit.amount} Birr via ${deposit.channel.toUpperCase()}`,
    metadata: {
      depositRequestId: deposit._id,
      matchedRef: deposit.matchedRef,
    },
  });

  deposit.status = DEPOSIT_STATUS.COMPLETED;
  deposit.completedAt = new Date();
  await deposit.save();

  try {
    getIO().to(`user:${deposit.userId._id || deposit.userId}`).emit('deposit:completed', {
      depositId: deposit._id,
      amount: deposit.amount,
      newBalance: user.virtualPoints,
    });
  } catch {}
}

module.exports = {
  extractReference,
  extractAmount,
  requestSmsDeposit,
  autoMatchSmsDeposit,
  matchAndConfirmDeposit,
  adminConfirmDeposit,
  rejectDeposit,
};
