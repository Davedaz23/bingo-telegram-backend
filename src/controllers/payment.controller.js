const { requestSmsDeposit } = require('../services/paymentService');
const { requestWithdrawal } = require('../services/withdrawalService');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const walletService = require('../services/walletService');
const { TRANSACTION_TYPE } = require('../config/constants');
const { AppError } = require('../middleware/errorHandler');

exports.initiateDeposit = async (req, res) => {
  const { amount, channel, smsText } = req.body;
  if (!channel) throw new AppError('Payment channel required (cbe, cbebirr, abyssinia, telebirr)', 400);
  if (!smsText) throw new AppError('SMS confirmation text required', 400);

  const parsedAmount = (amount !== undefined && amount !== null && !isNaN(amount)) ? parseFloat(amount) : 0;
  const result = await requestSmsDeposit(req.userId, parsedAmount, channel.toLowerCase(), smsText);
  res.json({ success: true, ...result });
};

exports.getTransactions = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const skip = (page - 1) * limit;
  const type = req.query.type;

  const filter = { userId: req.userId };
  if (type) filter.type = type;

  const [txs, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-gatewayResponse -__v'),
    Transaction.countDocuments(filter),
  ]);

  res.json({ success: true, transactions: txs, total, page, pages: Math.ceil(total / limit) });
};

exports.requestWithdrawal = async (req, res) => {
  const { amount, accountNumber, bankName, phoneNumber, accountHolderName } = req.body;
  if (!amount || isNaN(amount)) throw new AppError('Valid amount required', 400);
  if (!accountNumber) throw new AppError('Account number required', 400);

  const withdrawal = await requestWithdrawal(req.userId, parseFloat(amount), {
    accountNumber,
    bankName,
    phoneNumber,
    accountHolderName,
  });

  res.status(201).json({ success: true, withdrawal });
};

exports.getMyWithdrawals = async (req, res) => {
  const withdrawals = await Withdrawal.find({ userId: req.userId })
    .sort({ createdAt: -1 })
    .limit(30)
    .select('-gatewayResponse');

  res.json({ success: true, withdrawals });
};

exports.transfer = async (req, res) => {
  const { toTelegramId, amount, note } = req.body;
  if (!toTelegramId || !amount || isNaN(amount)) {
    throw new AppError('toTelegramId and valid amount required', 400);
  }

  const parsedAmount = parseFloat(amount);
  if (parsedAmount < 10) throw new AppError('Minimum transfer is 10 ETB', 400);

  if (req.user.telegramId === toTelegramId) {
    throw new AppError('Cannot transfer to yourself', 400);
  }

  const User = require('../models/User');
  const recipient = await User.findOne({ telegramId: toTelegramId });
  if (!recipient || !recipient.isActive) throw new AppError('Recipient not found', 404);

  const result = await walletService.transferBalance(req.userId, recipient._id, parsedAmount, {
    description: note || `Transfer to ${recipient.firstName}`,
  });

  res.json({
    success: true,
    message: `Transferred ${parsedAmount} ETB to ${recipient.firstName}`,
    transaction: result.debitTx,
  });
};

exports.getBalance = async (req, res) => {
  const balance = await walletService.getBalance(req.userId);
  res.json({ success: true, balance });
};

exports.getDepositAccounts = async (req, res) => {
  const accounts = {
    cbe: process.env.DEPOSIT_ACCOUNT_CBE || '1000123456789',
    cbebirr: process.env.DEPOSIT_ACCOUNT_CBEBIRR || '0900123456',
    abyssinia: process.env.DEPOSIT_ACCOUNT_ABYSSINIA || '1234567890',
    telebirr: process.env.DEPOSIT_ACCOUNT_TELEBIRR || '0911121314',
    accountName: process.env.DEPOSIT_ACCOUNT_NAME || 'Bingo Ethiopia PLC',
  };
  res.json({ success: true, accounts });
};
