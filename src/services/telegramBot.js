const TelegramBot = require('node-telegram-bot-api');
const User = require('../models/User');
const Game = require('../models/Game');
const Transaction = require('../models/Transaction');
const { getIO } = require('../socket/socketManager');
const { ROLES, GAME_STATUS } = require('../config/constants');
const logger = require('../utils/logger');
const { creditBalance } = require('../services/walletService');
const { TRANSACTION_TYPE } = require('../config/constants');
const { getWelcomeBonus } = require('../services/settingService');

let bot = null;
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://bingo-telegram-frontend.vercel.app';

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
    cmds.push({ cmd: '/broadcast', desc: 'Broadcast message to all users' });
  }
  if (role === ROLES.SUPER_ADMIN) {
    cmds.push({ cmd: '/add_admin', desc: 'Promote user to admin' });
    cmds.push({ cmd: '/remove_admin', desc: 'Demote admin to user' });
  }
  return cmds;
}

function getBotCommandObjects(role) {
  const cmds = [
    { command: 'start', description: 'Welcome & command list' },
    { command: 'help', description: 'Show available commands' },
    { command: 'balance', description: 'Check your balance' },
    { command: 'profile', description: 'View your profile' },
  ];
  if ([ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(role)) {
    cmds.push({ command: 'stats', description: 'System statistics' });
    cmds.push({ command: 'broadcast', description: 'Broadcast message to all users' });
  }
  if (role === ROLES.SUPER_ADMIN) {
    cmds.push({ command: 'add_admin', description: 'Promote user to admin' });
    cmds.push({ command: 'remove_admin', description: 'Demote admin to user' });
  }
  return cmds;
}

function formatCommands(commands) {
  return commands.map(c => `${c.cmd} — ${c.desc}`).join('\n');
}

function playNowKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🎮 Play Now', web_app: { url: MINI_APP_URL } }],
      [
        { text: '💰 Check Balance', callback_data: 'balance' },
        { text: '👤 Profile', callback_data: 'profile' },
      ],
      [
        { text: '📜 Transaction History', callback_data: 'history' },
        { text: '❓ Help', callback_data: 'help' },
      ],
    ],
  };
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🎮 Play Bingo', web_app: { url: MINI_APP_URL } }],
      [
        { text: '💰 Wallet', callback_data: 'wallet' },
        { text: '👤 Profile', callback_data: 'profile' },
      ],
      [
        { text: '📜 History', callback_data: 'history' },
        { text: '🎁 Bonuses', callback_data: 'bonuses' },
      ],
      [
        { text: '❓ Help & Rules', callback_data: 'help' },
        { text: '📞 Support', callback_data: 'support' },
      ],
    ],
  };
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

    // Credit registration bonus
    const bonus = await getWelcomeBonus();
    await creditBalance(user._id, bonus, TRANSACTION_TYPE.DEPOSIT, {
      description: 'Welcome bonus for new player',
    });
    logger.info(`Welcome bonus of ${bonus} Birr credited to user ${user._id}`);
  }
  return user;
}

async function setUserCommands(chatId, role) {
  try {
    await bot.setMyCommands(getBotCommandObjects(role), {
      scope: { type: 'chat', chat_id: chatId },
    });
  } catch (err) {
    logger.warn(`Bot: failed to set commands for chat ${chatId}:`, err.message);
  }
}

async function handleStart(msg) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  const user = await ensureUser(from);
  await setUserCommands(chatId, user.role);
  const commands = getCommands(user.role);

  const bonus = await getWelcomeBonus();
  const isNewUser = user.totalDeposited === 0 && user.balance === bonus;

  let welcomeText = `🎱 *Ato Bingo* — Welcome${isNewUser ? ' Back' : ''}!\n\n`;
  welcomeText += `👋 Hello *${user.firstName}*!\n`;
  welcomeText += `💰 Your Balance: *${user.balance.toFixed(2)} Birr*\n\n`;

  if (isNewUser) {
    welcomeText += `🎉 *Welcome Bonus: +${bonus} Birr!*\n`;
    welcomeText += `Start playing and win real money!\n\n`;
  }

  welcomeText += `🎯 *How to Play:*\n`;
  welcomeText += `1. Tap "Play Bingo" to open the game\n`;
  welcomeText += `2. Select your card(s) - ${bonus} Birr = ${Math.floor(bonus / 10)} cards free!\n`;
  welcomeText += `3. Wait for players to join (min 2)\n`;
  welcomeText += `4. Numbers drawn every 5 seconds\n`;
  welcomeText += `5. First BINGO wins the prize pool!\n\n`;
  welcomeText += `💡 *Commands:*\n${formatCommands(commands)}`;

  await bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: mainMenuKeyboard(),
  });
}

async function handleHelp(msg) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  const user = await ensureUser(from);
  const commands = getCommands(user.role);

  await bot.sendMessage(chatId,
    `*Available Commands:*\n${formatCommands(commands)}`,
    {
      parse_mode: 'Markdown',
      reply_markup: playNowKeyboard(),
    }
  );
}

async function handleBalance(msg) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  const user = await findUserByTelegramId(from.id);
  if (!user) {
    await bot.sendMessage(chatId, 'You are not registered. Send /start first.', {
      reply_markup: playNowKeyboard(),
    });
    return;
  }

  await bot.sendMessage(chatId,
    `💰 *Balance*\n\nYour balance: *${user.balance.toFixed(2)} Birr*\n` +
    `Total deposited: ${user.totalDeposited.toFixed(2)} Birr\n` +
    `Total won: ${user.totalWon.toFixed(2)} Birr`,
    {
      parse_mode: 'Markdown',
      reply_markup: playNowKeyboard(),
    }
  );
}

async function handleProfile(msg) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;

  const user = await findUserByTelegramId(from.id);
  if (!user) {
    await bot.sendMessage(chatId, 'You are not registered. Send /start first.', {
      reply_markup: playNowKeyboard(),
    });
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
    {
      parse_mode: 'Markdown',
      reply_markup: playNowKeyboard(),
    }
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

  const message = text ? text.trim() : '';
  if (!message) {
    await bot.sendMessage(chatId, 'Usage: /broadcast <message>\n\nExample:\n/broadcast Game starting in 5 minutes!');
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

  const targetId = text ? text.trim() : '';
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

  const targetId = text ? text.trim() : '';
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

async function handleTextMessage(msg) {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Use the button below to open the game:', {
    reply_markup: playNowKeyboard(),
  });
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

  // Set default bot commands (visible to users without a personal scope)
  try {
    await bot.setMyCommands([
      { command: 'start', description: 'Welcome & command list' },
      { command: 'help', description: 'Show available commands' },
      { command: 'balance', description: 'Check your balance' },
      { command: 'profile', description: 'View your profile' },
    ]);
    logger.info('✅ Default bot commands set');
  } catch (err) {
    logger.warn('Failed to set default commands:', err.message);
  }

  // Set the Menu Button to open the Mini App
  try {
    await bot.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: '🎮 Play Now',
        web_app: { url: MINI_APP_URL },
      },
    });
    logger.info(`✅ Menu button set to Mini App: ${MINI_APP_URL}`);
  } catch (err) {
    logger.warn('Failed to set menu button:', err.message);
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

  bot.onText(/\/broadcast(?: (.+))?/, async (msg, match) => {
    try { await handleBroadcast(msg, match ? match[1] : ''); } catch (err) { logger.error('Bot /broadcast error:', err); }
  });

  bot.onText(/\/add_admin (.+)/, async (msg, match) => {
    try { await handleAddAdmin(msg, match[1]); } catch (err) { logger.error('Bot /add_admin error:', err); }
  });

  bot.onText(/\/remove_admin (.+)/, async (msg, match) => {
    try { await handleRemoveAdmin(msg, match[1]); } catch (err) { logger.error('Bot /remove_admin error:', err); }
  });

  // Non-command text messages → prompt to Play Now
  bot.on('message', async (msg) => {
    try {
      if (msg.text && !msg.text.startsWith('/')) {
        await handleTextMessage(msg);
      }
    } catch (err) {
      // ignore
    }
  });

  // Callback queries for inline keyboard
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const from = query.from;
    const data = query.data;

    try {
      await bot.answerCallbackQuery(query.id);

      const user = await findUserByTelegramId(from.id);
      if (!user) {
        await bot.sendMessage(chatId, 'Please /start first to register.', { reply_markup: mainMenuKeyboard() });
        return;
      }

      switch (data) {
        case 'wallet':
        case 'balance':
          await bot.sendMessage(chatId,
            `💰 *Wallet*\n\n` +
            `Balance: *${user.balance.toFixed(2)} Birr*\n` +
            `Total Deposited: ${user.totalDeposited.toFixed(2)} Birr\n` +
            `Total Won: ${user.totalWon.toFixed(2)} Birr\n` +
            `Total Withdrawn: ${user.totalWithdrawn.toFixed(2)} Birr`,
            { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
          );
          break;

        case 'profile':
          await bot.sendMessage(chatId,
            `👤 *Profile*\n\n` +
            `Name: ${user.firstName}${user.lastName ? ' ' + user.lastName : ''}\n` +
            `Username: ${user.username || 'N/A'}\n` +
            `Role: ${getRoleLabel(user.role)}\n` +
            `Balance: ${user.balance.toFixed(2)} Birr\n` +
            `Games Played: ${user.gamesPlayed}\n` +
            `Games Won: ${user.gamesWon}\n` +
            `Joined: ${new Date(user.createdAt).toLocaleDateString()}`,
            { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
          );
          break;

        case 'history':
          const transactions = await Transaction.find({ userId: user._id })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
          if (transactions.length === 0) {
            await bot.sendMessage(chatId,
              `📜 *Transaction History*\n\nNo transactions yet.`,
              { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
            );
          } else {
            let text = `📜 *Recent Transactions*\n\n`;
            for (const tx of transactions) {
              const sign = tx.amount >= 0 ? '+' : '';
              const emoji = tx.type === 'deposit' ? '💰' : tx.type === 'withdrawal' ? '💸' : tx.type === 'game_win' ? '🏆' : tx.type === 'refund' ? '↩️' : '📝';
              text += `${emoji} ${sign}${tx.amount.toFixed(2)} Birr — ${tx.description || tx.type}\n`;
              text += `   ${new Date(tx.createdAt).toLocaleString()}\n\n`;
            }
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
          }
          break;

        case 'bonuses':
          const bonusAmt = await getWelcomeBonus();
          await bot.sendMessage(chatId,
            `🎁 *Bonuses & Rewards*\n\n` +
            `🎉 *Welcome Bonus:* ${bonusAmt} Birr (one-time)\n` +
            `💎 *Referral Bonus:* Coming soon!\n` +
            `🏆 *Daily Login:* Coming soon!\n` +
            `🎯 *Tournament Prizes:* Coming soon!\n\n` +
            `Your welcome bonus: ${user.totalDeposited === bonusAmt ? '✅ Claimed' : '🎁 Ready to claim'}`,
            { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
          );
          break;

        case 'help':
          await bot.sendMessage(chatId,
            `❓ *Help & Rules*\n\n` +
            `🎮 *How to Play:*\n` +
            `• Select cards during selection phase\n` +
            `• Min 2 players to start\n` +
            `• Numbers drawn every 5 seconds\n` +
            `• First valid BINGO wins\n\n` +
            `💳 *Payments:*\n` +
            `• Deposit via SMS (CBE, Telebirr, Abyssinia)\n` +
            `• Withdraw to bank/Mobile Money\n` +
            `• Min withdrawal: 50 Birr\n\n` +
            `🔒 *Fair Play:*\n` +
            `• Provably fair RNG\n` +
            `• Auto-refund if no winner\n\n` +
            `📞 Need help? Contact @AtoBingoSupport`,
            { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
          );
          break;

        case 'support':
          await bot.sendMessage(chatId,
            `📞 *Support*\n\n` +
            `For issues with:\n` +
            `• Deposits/Withdrawals\n` +
            `• Game problems\n• Game bugs\n` +
            `• Account issues\n\n` +
            `💬 Contact: @AtoBingoSupport\n` +
            `📧 Email: support@atobingo.com\n\n` +
            `Response time: < 24 hours`,
            { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() }
          );
          break;
      }
    } catch (err) {
      logger.error('Callback query error:', err);
    }
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
