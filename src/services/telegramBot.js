const TelegramBot = require('node-telegram-bot-api');
const User = require('../models/User');
const Game = require('../models/Game');
const Transaction = require('../models/Transaction');
const { getIO } = require('../socket/socketManager');
const { ROLES, GAME_STATUS, WITHDRAWAL_STATUS, DEPOSIT_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

let bot = null;

function getRoleLabel(role) {
  const labels = { user: '👤 User', admin: '🛠 Admin', super_admin: '⭐ Super Admin' };
  return labels[role] || role;
}

function getCommands(role) {
  const cmds = [
    { cmd: '/start', desc: 'Welcome & command list' },
    { cmd: '/help', desc: 'Show this help' },
    { cmd: '/balance', desc: 'Check your balance' },
    { cmd: '/profile', desc: 'View your profile' },
  ];
  if ([ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(role)) {
    cmds.push({ cmd: '/stats', desc: 'System statistics' });
    cmds.push({ cmd: '/broadcast <message>', desc: 'Broadcast message to all users' });
  }
  if (role === ROLES.SUPER_ADMIN) {
    cmds.push({ cmd: '/add_admin <telegram_id>', desc: 'Promote user to admin' });
    cmds.push({ cmd: '/remove_admin <telegram_id>', desc: 'Demote admin to user' });
  }
  return cmds;
}

function formatCommands(commands) {
  return commands.map(c => `${c.cmd} — ${c.desc}`).join('\n');
}

function isAdmin(user) {
  return user && [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role);
}

function isSuperAdmin(user) {
  return user && user.role === ROLES.SUPER_ADMIN;
}

async function findUserByTelegramId(telegramId) {
  return User.findOne({ telegramId: String(telegramId) });
}

async function ensureUser(telegramUser) {
  let user = await User.findOne({ telegramId: String(telegramUser.id) });
  if (!user) {
    const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => id.trim());
    const role = adminIds.includes(String(telegramUser.id)) ? ROLES.ADMIN : ROLES.USER;
    user = await User.create({
      telegramId: String(telegramUser.id),
      username: telegramUser.username || null,
      firstName: telegramUser.first_name || 'User',
      lastName: telegramUser.last_name || null,
      role,
    });
    logger.info(`Bot: auto-registered user ${telegramUser.id}`);
  }
  return user;
}

async function handleStart(msg) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  const user = await ensureUser(from);
  const commands = getCommands(user.role);

  await bot.sendMessage(chatId,
    `🎱 *Ato Bingo Bot*\n\n` +
    `Welcome, *${user.firstName}*!\n` +
    `Role: ${getRoleLabel(user.role)}\n\n` +
    `*Available Commands:*\n${formatCommands(commands)}`,
    { parse_mode: 'Markdown' }
  );
}

async function handleHelp(msg) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  const user = await ensureUser(from);
  const commands = getCommands(user.role);

  await bot.sendMessage(chatId,
    `*Available Commands:*\n${formatCommands(commands)}`,
    { parse_mode: 'Markdown' }
  );
}

async function handleBalance(msg) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  const user = await findUserByTelegramId(from.id);
  if (!user) {
    await bot.sendMessage(chatId, 'You are not registered. Send /start first.');
    return;
  }

  await bot.sendMessage(chatId,
    `💰 *Balance*\n\nYour balance: *${user.balance.toFixed(2)} Birr*\n` +
    `Total deposited: ${user.totalDeposited.toFixed(2)} Birr\n` +
    `Total won: ${user.totalWon.toFixed(2)} Birr`,
    { parse_mode: 'Markdown' }
  );
}

async function handleProfile(msg) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  const user = await findUserByTelegramId(from.id);
  if (!user) {
    await bot.sendMessage(chatId, 'You are not registered. Send /start first.');
    return;
  }

  await bot.sendMessage(chatId,
    `👤 *Profile*\n\n` +
    `Name: ${user.firstName}${user.lastName ? ' ' + user.lastName : ''}\n` +
    `Username: ${user.username || 'N/A'}\n` +
    `Role: ${getRoleLabel(user.role)}\n` +
    `Balance: ${user.balance.toFixed(2)} Birr\n` +
    `Games Played: ${user.gamesPlayed}\n` +
    `Games Won: ${user.gamesWon}\n` +
    `Joined: ${new Date(user.createdAt).toLocaleDateString()}`,
    { parse_mode: 'Markdown' }
  );
}

async function handleStats(msg) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  const user = await findUserByTelegramId(from.id);
  if (!user || !isAdmin(user)) {
    await bot.sendMessage(chatId, '⛔ Admin access required.');
    return;
  }

  const [totalUsers, activeGames, totalGames, pendingWithdrawals, pendingDeposits] = await Promise.all([
    User.countDocuments({ isActive: true }),
    Game.countDocuments({ status: { $in: [GAME_STATUS.SELECTION, GAME_STATUS.STARTING, GAME_STATUS.ACTIVE] } }),
    Game.countDocuments(),
    Transaction.countDocuments({ type: 'withdrawal', status: 'pending' }),
    Transaction.countDocuments({ type: 'deposit', status: 'pending' }),
  ]);

  await bot.sendMessage(chatId,
    `📊 *System Statistics*\n\n` +
    `👥 Active Users: ${totalUsers}\n` +
    `🎮 Active Games: ${activeGames}\n` +
    `📋 Total Games: ${totalGames}\n` +
    `⏳ Pending Withdrawals: ${pendingWithdrawals}\n` +
    `⏳ Pending Deposits: ${pendingDeposits}`,
    { parse_mode: 'Markdown' }
  );
}

async function handleBroadcast(msg, text) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  const user = await findUserByTelegramId(from.id);
  if (!user || !isAdmin(user)) {
    await bot.sendMessage(chatId, '⛔ Admin access required.');
    return;
  }

  const message = text.trim();
  if (!message) {
    await bot.sendMessage(chatId, 'Usage: /broadcast <message>');
    return;
  }

  try {
    getIO().emit('broadcast', {
      from: user.firstName,
      message,
      timestamp: new Date().toISOString(),
    });
    await bot.sendMessage(chatId, `✅ Broadcast sent to all connected users.\n\nMessage: ${message}`);
  } catch (err) {
    logger.error('Broadcast error:', err);
    await bot.sendMessage(chatId, '❌ Failed to send broadcast.');
  }
}

async function handleAddAdmin(msg, text) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  const user = await findUserByTelegramId(from.id);
  if (!user || !isSuperAdmin(user)) {
    await bot.sendMessage(chatId, '⛔ Super Admin access required.');
    return;
  }

  const targetId = text.trim();
  if (!targetId) {
    await bot.sendMessage(chatId, 'Usage: /add_admin <telegram_id>');
    return;
  }

  const target = await User.findOne({ telegramId: targetId });
  if (!target) {
    await bot.sendMessage(chatId, `❌ User with Telegram ID ${targetId} not found.`);
    return;
  }

  if (isAdmin(target)) {
    await bot.sendMessage(chatId, `ℹ️ ${target.firstName} is already an admin.`);
    return;
  }

  target.role = ROLES.ADMIN;
  await target.save();
  logger.info(`Bot: ${from.id} promoted ${targetId} to admin`);
  await bot.sendMessage(chatId, `✅ *${target.firstName}* promoted to Admin.`, { parse_mode: 'Markdown' });
}

async function handleRemoveAdmin(msg, text) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  const user = await findUserByTelegramId(from.id);
  if (!user || !isSuperAdmin(user)) {
    await bot.sendMessage(chatId, '⛔ Super Admin access required.');
    return;
  }

  const targetId = text.trim();
  if (!targetId) {
    await bot.sendMessage(chatId, 'Usage: /remove_admin <telegram_id>');
    return;
  }

  const target = await User.findOne({ telegramId: targetId });
  if (!target) {
    await bot.sendMessage(chatId, `❌ User with Telegram ID ${targetId} not found.`);
    return;
  }

  if (target.role !== ROLES.ADMIN) {
    await bot.sendMessage(chatId, `ℹ️ ${target.firstName} is not an admin.`);
    return;
  }

  target.role = ROLES.USER;
  await target.save();
  logger.info(`Bot: ${from.id} demoted ${targetId} from admin`);
  await bot.sendMessage(chatId, `✅ *${target.firstName}* demoted to User.`, { parse_mode: 'Markdown' });
}

async function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn('TELEGRAM_BOT_TOKEN not set — bot not initialized');
    return null;
  }

  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('TELEGRAM_WEBHOOK_URL not set — bot not initialized');
    return null;
  }

  bot = new TelegramBot(token, { polling: false });

  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  try {
    await bot.setWebHook(webhookUrl, { secret_token: secretToken });
    logger.info(`✅ Telegram bot webhook set to ${webhookUrl}`);
  } catch (err) {
    logger.error('Failed to set Telegram bot webhook:', err.message);
    return null;
  }

  bot.onText(/\/start/, async (msg) => {
    try { await handleStart(msg); } catch (err) { logger.error('Bot /start error:', err); }
  });

  bot.onText(/\/help/, async (msg) => {
    try { await handleHelp(msg); } catch (err) { logger.error('Bot /help error:', err); }
  });

  bot.onText(/\/balance/, async (msg) => {
    try { await handleBalance(msg); } catch (err) { logger.error('Bot /balance error:', err); }
  });

  bot.onText(/\/profile/, async (msg) => {
    try { await handleProfile(msg); } catch (err) { logger.error('Bot /profile error:', err); }
  });

  bot.onText(/\/stats/, async (msg) => {
    try { await handleStats(msg); } catch (err) { logger.error('Bot /stats error:', err); }
  });

  bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    try { await handleBroadcast(msg, match[1]); } catch (err) { logger.error('Bot /broadcast error:', err); }
  });

  bot.onText(/\/add_admin (.+)/, async (msg, match) => {
    try { await handleAddAdmin(msg, match[1]); } catch (err) { logger.error('Bot /add_admin error:', err); }
  });

  bot.onText(/\/remove_admin (.+)/, async (msg, match) => {
    try { await handleRemoveAdmin(msg, match[1]); } catch (err) { logger.error('Bot /remove_admin error:', err); }
  });

  return bot;
}

function processUpdate(update) {
  if (!bot) {
    logger.warn('Bot not initialized — update ignored');
    return;
  }
  bot.processUpdate(update);
}

module.exports = { initTelegramBot, processUpdate };
