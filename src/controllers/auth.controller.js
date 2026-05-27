const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validateTelegramInitData } = require('../middleware/telegramAuth');
const { ROLES } = require('../config/constants');
const logger = require('../utils/logger');

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
    user = await User.create({
      telegramId: telegramUser.id.toString(),
      username: telegramUser.username || null,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name || null,
      languageCode: telegramUser.language_code || 'en',
      role,
    });
    logger.info(`New user via auth: ${telegramUser.id} (${role})`);
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
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
  const user = await User.findById(req.userId).select('-__v -paymentInfo');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, user });
};
