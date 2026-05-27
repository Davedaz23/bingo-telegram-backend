const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { creditBalance } = require('./walletService');
const { TRANSACTION_TYPE, TRANSACTION_STATUS } = require('../config/constants');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

const chapaClient = axios.create({
  baseURL: process.env.CHAPA_BASE_URL || 'https://api.chapa.co/v1',
  headers: {
    Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

/**
 * Initiate a deposit via Chapa
 */
async function initiateDeposit(userId, amount) {
  if (amount < 10) throw new AppError('Minimum deposit is 10 ETB', 400);
  if (amount > 50000) throw new AppError('Maximum deposit is 50,000 ETB', 400);

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const txRef = `BNG-DEP-${uuidv4().replace(/-/g, '').slice(0, 16).toUpperCase()}`;

  // Create pending transaction
  const transaction = await Transaction.create({
    userId,
    telegramId: user.telegramId,
    type: TRANSACTION_TYPE.DEPOSIT,
    status: TRANSACTION_STATUS.PENDING,
    amount,
    paymentReference: txRef,
    paymentGateway: 'chapa',
    description: 'Wallet deposit via Chapa',
  });

  // Initialize Chapa payment
  const payload = {
    amount: amount.toString(),
    currency: 'ETB',
    email: `${user.telegramId}@bingo.telegram`,
    first_name: user.firstName,
    last_name: user.lastName || 'User',
    tx_ref: txRef,
    callback_url: `${process.env.APP_URL || 'https://yourdomain.com'}/webhook/chapa`,
    return_url: `https://t.me/YourBingoBot/app?ref=${txRef}`,
    customization: {
      title: 'Bingo Wallet Deposit',
      description: `Deposit ${amount} ETB to Bingo wallet`,
    },
  };

  const response = await chapaClient.post('/transaction/initialize', payload);

  if (response.data.status !== 'success') {
    await Transaction.updateOne(
      { _id: transaction._id },
      { status: TRANSACTION_STATUS.FAILED, failureReason: 'Chapa initialization failed', gatewayResponse: response.data }
    );
    throw new AppError('Payment initialization failed', 502);
  }

  await Transaction.updateOne(
    { _id: transaction._id },
    { gatewayResponse: response.data }
  );

  logger.info(`Deposit initiated: ${txRef} | User: ${userId} | Amount: ${amount}`);

  return {
    txRef,
    checkoutUrl: response.data.data.checkout_url,
    transactionId: transaction._id,
  };
}

/**
 * Verify and complete a deposit (called from webhook or return)
 */
async function verifyAndCompleteDeposit(txRef) {
  // Idempotency: check if already completed
  const existing = await Transaction.findOne({ paymentReference: txRef });
  if (!existing) throw new AppError('Transaction not found', 404);
  if (existing.status === TRANSACTION_STATUS.COMPLETED) {
    return { alreadyProcessed: true, transaction: existing };
  }
  if (existing.status === TRANSACTION_STATUS.FAILED) {
    throw new AppError('Transaction already marked as failed', 400);
  }

  // Verify with Chapa
  const response = await chapaClient.get(`/transaction/verify/${txRef}`);

  if (response.data.status !== 'success' || response.data.data.status !== 'success') {
    await Transaction.updateOne(
      { paymentReference: txRef },
      {
        status: TRANSACTION_STATUS.FAILED,
        failureReason: 'Payment verification failed',
        gatewayResponse: response.data,
      }
    );
    throw new AppError('Payment verification failed', 400);
  }

  const verifiedAmount = parseFloat(response.data.data.amount);

  // Update transaction and credit wallet
  await Transaction.updateOne(
    { paymentReference: txRef },
    { status: TRANSACTION_STATUS.COMPLETED, gatewayResponse: response.data }
  );

  await creditBalance(existing.userId, verifiedAmount, TRANSACTION_TYPE.DEPOSIT, {
    paymentReference: txRef,
    description: `Deposit ${verifiedAmount} ETB via Chapa`,
  });

  logger.info(`Deposit completed: ${txRef} | User: ${existing.userId} | Amount: ${verifiedAmount}`);
  return { alreadyProcessed: false, transaction: existing, amount: verifiedAmount };
}

module.exports = { initiateDeposit, verifyAndCompleteDeposit };
