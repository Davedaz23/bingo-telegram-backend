const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { validateTelegramInitData } = require('../middleware/telegramAuth');
const { ROLES, TRANSACTION_TYPE, TRANSACTION_STATUS } = require('../config/constants');
const { getWelcomeBonus } = require('../services/settingService');
const { creditBalance } = require('../services/walletService');
const logger = require('../utils/logger');

/**
 * POST /api/auth/register
 * Register with email and password
 */
exports.register = async (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ success: false, message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const bonus = await getWelcomeBonus();

  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash,
    firstName: firstName || email.split('@')[0],
    lastName: lastName || null,
    role: ROLES.USER,
    balance: bonus,
  });

  await Transaction.create({
    userId: user._id,
    type: TRANSACTION_TYPE.DEPOSIT,
    status: TRANSACTION_STATUS.COMPLETED,
    amount: bonus,
    balanceBefore: 0,
    balanceAfter: bonus,
    description: `Welcome bonus: ${bonus} Birr`,
  });

  logger.info(`New user registered via email: ${user.email} (${user._id}) — ${bonus} Birr welcome bonus`);

  const token = jwt.sign(
    { userId: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.status(201).json({
    success: true,
    token,
    user: {
      id: user._id,
      telegramId: user.telegramId,
      email: user.email,
      firstName: user.firstName,
      username: user.username,
      role: user.role,
      balance: user.balance,
    },
  });
};

/**
 * POST /api/auth/login
 * Login with email and password
 */
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Account suspended' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  user.lastSeen = new Date();
  await user.save();

  const token = jwt.sign(
    { userId: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    success: true,
    token,
    user: {
      id: user._id,
      telegramId: user.telegramId,
      email: user.email,
      firstName: user.firstName,
      username: user.username,
      role: user.role,
      balance: user.balance,
    },
  });
};

/**
 * POST /api/auth/telegram
 * Exchange Telegram initData for a JWT
 */
exports.telegramLogin = async (req, res) => {
  const { initData } = req.body;
  if (!initData) return res.status(400).json({ success: false, message: 'initData required' });

  const telegramUser = validateTelegramInitData(initData);
  if (!telegramUser) {
    return res.status(401).json({ success: false, message: 'Invalid or expired Telegram data' });
  }

  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => id.trim());
  const role = adminIds.includes(telegramUser.id.toString()) ? ROLES.ADMIN : ROLES.USER;

  let user = await User.findOne({ telegramId: telegramUser.id.toString() });
  if (!user) {
    const bonus = await getWelcomeBonus();

    user = await User.create({
      telegramId: telegramUser.id.toString(),
      username: telegramUser.username || null,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name || null,
      languageCode: telegramUser.language_code || 'en',
      role,
      balance: bonus,
    });

    await Transaction.create({
      userId: user._id,
      telegramId: user.telegramId,
      type: TRANSACTION_TYPE.DEPOSIT,
      status: TRANSACTION_STATUS.COMPLETED,
      amount: bonus,
      balanceBefore: 0,
      balanceAfter: bonus,
      description: `Welcome bonus: ${bonus} Birr`,
    });

    logger.info(`New user via Telegram: ${telegramUser.id} (${role}) — ${bonus} Birr welcome bonus`);
  } else {
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account suspended' });
    }
    user.lastSeen = new Date();
    await user.save();
  }

  const token = jwt.sign(
    { userId: user._id, telegramId: user.telegramId, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    success: true,
    token,
    user: {
      id: user._id,
      telegramId: user.telegramId,
      firstName: user.firstName,
      username: user.username,
      role: user.role,
      balance: user.balance,
    },
  });
};

/**
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
  }

  const resetToken = jwt.sign(
    { userId: user._id, type: 'password-reset' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  user.passwordResetToken = resetToken;
  user.passwordResetExpires = new Date(Date.now() + 3600000);
  await user.save();

  logger.info(`Password reset requested for ${user.email}`);

  res.json({
    success: true,
    message: 'If an account exists, a reset link has been sent.',
    resetToken,
  });
};

/**
 * POST /api/auth/reset-password
 */
exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ success: false, message: 'Token and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
  }

  const user = await User.findById(decoded.userId);
  if (!user || user.passwordResetToken !== token || user.passwordResetExpires < Date.now()) {
    return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  await user.save();

  logger.info(`Password reset successful for ${user.email}`);

  res.json({ success: true, message: 'Password reset successful' });
};

/**
 * POST /api/auth/dev-login
 * Development quick login (disabled in production)
 */
exports.devLogin = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, message: 'Dev login disabled in production' });
  }

  const { role = 'admin' } = req.body;
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '444206486').split(',').map(id => id.trim());
  const telegramId = role === 'admin' ? adminIds[0] : 'dev_player_' + Date.now().toString().slice(-4);
  const targetRole = role === 'admin' ? ROLES.ADMIN : ROLES.USER;

  let user = await User.findOne({ telegramId });
  if (!user) {
    user = await User.create({
      telegramId,
      username: role === 'admin' ? 'AdminDev' : 'DemoPlayer',
      firstName: role === 'admin' ? 'Admin' : 'Demo',
      lastName: 'Tester',
      role: targetRole,
      virtualPoints: 5000,
      status: 'active',
    });
  } else {
    user.role = targetRole;
    if ((user.virtualPoints || 0) < 500) user.virtualPoints = 2000;
    user.status = 'active';
    await user.save();
  }

  const token = jwt.sign(
    { userId: user._id, telegramId: user.telegramId, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    token,
    user: {
      id: user._id,
      telegramId: user.telegramId,
      firstName: user.firstName,
      username: user.username,
      role: user.role,
      virtualPoints: user.virtualPoints,
      balance: user.virtualPoints,
    },
  });
};

/**
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
  console.log('getMe called with userId:', req.userId, 'type:', typeof req.userId);
  const user = await User.findById(req.userId).select('-__v -paymentInfo');
  console.log('getMe found user:', !!user);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, user });
};
