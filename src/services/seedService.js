const Achievement = require('../models/Achievement');
const SystemSetting = require('../models/SystemSetting');
const logger = require('../utils/logger');

const DEFAULT_ACHIEVEMENTS = [
  {
    code: 'first_win',
    title: 'First Victory',
    description: 'Win your very first Bingo game!',
    icon: '🎯',
    category: 'gameplay',
    pointsReward: 100,
    requirementType: 'games_won',
    requirementValue: 1,
  },
  {
    code: 'bingo_master_5',
    title: 'Bingo Master',
    description: 'Win 5 Bingo games.',
    icon: '👑',
    category: 'gameplay',
    pointsReward: 250,
    requirementType: 'games_won',
    requirementValue: 5,
  },
  {
    code: 'bingo_champion_25',
    title: 'Bingo Champion',
    description: 'Win 25 Bingo games and dominate the rooms!',
    icon: '🏆',
    category: 'gameplay',
    pointsReward: 1000,
    requirementType: 'games_won',
    requirementValue: 25,
  },
  {
    code: 'streak_3',
    title: 'Consistent Player',
    description: 'Claim daily rewards for 3 days in a row.',
    icon: '🔥',
    category: 'streaks',
    pointsReward: 150,
    requirementType: 'streak_days',
    requirementValue: 3,
  },
  {
    code: 'streak_7',
    title: 'Streak Legend',
    description: 'Reach a 7-day daily login streak!',
    icon: '⚡',
    category: 'streaks',
    pointsReward: 500,
    requirementType: 'streak_days',
    requirementValue: 7,
  },
  {
    code: 'cards_50',
    title: 'Card Collector',
    description: 'Purchase 50 Bingo cards.',
    icon: '🎟️',
    category: 'loyalty',
    pointsReward: 300,
    requirementType: 'cards_bought',
    requirementValue: 50,
  },
  {
    code: 'veteran_100',
    title: 'Century Club',
    description: 'Participate in 100 Bingo games.',
    icon: '💎',
    category: 'loyalty',
    pointsReward: 500,
    requirementType: 'games_played',
    requirementValue: 100,
  },
  {
    code: 'big_win_500',
    title: 'Jackpot Winner',
    description: 'Win 500 or more Virtual Points in a single game.',
    icon: '🌟',
    category: 'special',
    pointsReward: 250,
    requirementType: 'single_win_points',
    requirementValue: 500,
  },
];

const DEFAULT_SETTINGS = [
  {
    key: 'welcome_bonus',
    value: 1000,
    category: 'economy',
    description: 'Initial free Virtual Points granted to newly registered players.',
  },
  {
    key: 'daily_reward_base',
    value: 100,
    category: 'economy',
    description: 'Base Virtual Points for daily login reward.',
  },
  {
    key: 'daily_reward_streak_bonus',
    value: 50,
    category: 'economy',
    description: 'Additional points added per streak day (up to day 7).',
  },
  {
    key: 'maintenance_mode',
    value: false,
    category: 'maintenance',
    description: 'When true, non-admin players cannot join or start new games.',
  },
  {
    key: 'platform_name',
    value: 'Telegram Bingo Arena',
    category: 'branding',
    description: 'Display name of the game mini app.',
  },
];

async function seedInitialData() {
  try {
    for (const ach of DEFAULT_ACHIEVEMENTS) {
      await Achievement.findOneAndUpdate(
        { code: ach.code },
        { $setOnInsert: ach },
        { upsert: true, new: true }
      );
    }
    logger.info(`✅ Seeded ${DEFAULT_ACHIEVEMENTS.length} default achievements`);

    for (const set of DEFAULT_SETTINGS) {
      await SystemSetting.findOneAndUpdate(
        { key: set.key },
        { $setOnInsert: set },
        { upsert: true, new: true }
      );
    }
    logger.info(`✅ Seeded ${DEFAULT_SETTINGS.length} default system settings`);
  } catch (err) {
    logger.error('Failed to seed initial data:', err);
  }
}

module.exports = { seedInitialData, DEFAULT_ACHIEVEMENTS, DEFAULT_SETTINGS };

