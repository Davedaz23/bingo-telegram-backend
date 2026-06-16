const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const { ROLES, REGISTRATION_BONUS } = require('../config/constants');
const { creditBalance } = require('../services/walletService');
const { TRANSACTION_TYPE } = require('../config/constants');

/**
 * Validate Telegram Mini App initData
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateTelegramInitData(initData) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) return null;

    // Build data-check-string
    params.delete('hash');
    const entries = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    // Compute HMAC-SHA256
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.TELEGRAM_BOT_TOKEN)
      .digest();

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(entries)
      .digest('hex');

    if (computedHash !== hash) return null;

    // Check data freshness (max 1 hour old)
    const authDate = parseInt(params.get('auth_date'));
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 3600) return null;

    const userStr = params.get('user');
    if (!userStr) return null;

    return JSON.parse(userStr);
  } catch (err) {
    logger.warn('Telegram initData validation error:', err.message);
    return null;
  }
}

/**
 * Middleware: Authenticate via Telegram initData
 * Sets req.user with the authenticated user document
 */
const authenticateTelegram = async (req, res, next) => {
  try {
    // Support both Authorization header (JWT) and initData
    const authHeader = req.headers.authorization;
    const initData = req.headers['x-telegram-init-data'] || req.body?.initData;

    let telegramUser = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // JWT path (after first auth)
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.telegramId = decoded.telegramId;
        req.userId = decoded.userId;
        req.role = decoded.role;

        const user = await User.findById(decoded.userId).select('-__v');
        if (!user || !user.isActive) {
          return res.status(401).json({ success: false, message: 'User not found or deactivated' });
        }
        req.user = user;
        return next();
      } catch {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
      }
    }

    if (initData) {
      telegramUser = validateTelegramInitData(initData);
      if (!telegramUser) {
        return res.status(401).json({ success: false, message: 'Invalid Telegram authentication data' });
      }

      // Find or create user
      let user = await User.findOne({ telegramId: telegramUser.id.toString() });
      if (!user) {
        // First time: auto-register
        const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => id.trim());
        const role = adminIds.includes(telegramUser.id.toString()) ? ROLES.ADMIN : ROLES.USER;

        user = await User.create({
          telegramId: telegramUser.id.toString(),
          username: telegramUser.username || null,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name || null,
          role,
          languageCode: telegramUser.language_code || 'en',
        });
        logger.info(`New user registered: ${telegramUser.id} (${role})`);

        // Credit registration bonus
        await creditBalance(user._id, REGISTRATION_BONUS, TRANSACTION_TYPE.DEPOSIT, {
          description: 'Welcome bonus for new player',
        });
        logger.info(`Welcome bonus of ${REGISTRATION_BONUS} Birr credited to user ${user._id}`);
      } else {
        // Update profile fields if changed
        user.username = telegramUser.username || user.username;
        user.firstName = telegramUser.first_name;
        user.lastName = telegramUser.last_name || user.lastName;
        user.lastSeen = new Date();
        await user.save();
      }

      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Account is suspended' });
      }

      req.user = user;
      req.telegramId = user.telegramId;
      req.userId = user._id.toString();
      req.role = user.role;
      return next();
    }

    return res.status(401).json({ success: false, message: 'Authentication required' });
  } catch (err) {
    logger.error('Auth middleware error:', err);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

/**
 * Middleware: Require admin role
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || ![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

/**
 * Middleware: Validate Telegram webhook secret
 */
const validateTelegramWebhook = (req, res, next) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  next();
};

module.exports = { authenticateTelegram, requireAdmin, validateTelegramWebhook, validateTelegramInitData };
