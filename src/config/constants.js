module.exports = {
  // ─── Game Lifecycle States ──────────────────────────────────────────────────
  GAME_STATUS: {
    DRAFT: 'draft',
    SCHEDULED: 'scheduled',
    WAITING: 'waiting_for_players',
    REGISTRATION_OPEN: 'registration_open',
    REGISTRATION_CLOSED: 'registration_closed',
    STARTING: 'starting',
    IN_PROGRESS: 'in_progress',
    WINNER_DETECTED: 'winner_detected',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    PAUSED: 'paused',

    // Backward compatibility aliases
    SELECTION: 'registration_open',
    ACTIVE: 'in_progress',
    FINISHED: 'completed',
  },

  // ─── Game Variants & Formats ───────────────────────────────────────────────
  GAME_FORMAT: {
    BALL_75: '75_ball',
    BALL_90: '90_ball',
  },

  // ─── Winning Patterns ──────────────────────────────────────────────────────
  BINGO_PATTERNS: {
    ANY_LINE: 'any_line',
    HORIZONTAL_LINE: 'horizontal_line',
    VERTICAL_LINE: 'vertical_line',
    DIAGONAL_LINE: 'diagonal_line',
    FOUR_CORNERS: 'four_corners',
    FULL_HOUSE: 'full_house',
    MULTI_LINE: 'multi_line',
  },

  // ─── Tie Breaker Rules ─────────────────────────────────────────────────────
  TIE_BREAKER_RULES: {
    SPLIT_PRIZE: 'split_prize',
    FIRST_CLAIM: 'first_claim',
  },

  // ─── Card Statuses ─────────────────────────────────────────────────────────
  CARD_STATUS: {
    AVAILABLE: 'available',
    SELECTED: 'selected',       // locked by a user temporarily
    PURCHASED: 'purchased',
    RELEASED: 'released',
  },

  CARD_LOCK_TTL_SECONDS: 120,

  // ─── Virtual Points Transaction Ledger Types ──────────────────────────────
  TRANSACTION_TYPE: {
    WELCOME_BONUS: 'welcome_bonus',
    DAILY_REWARD: 'daily_reward',
    CARD_PURCHASE: 'card_purchase',
    GAME_WIN: 'game_win',
    GAME_REFUND: 'game_refund',
    ACHIEVEMENT_REWARD: 'achievement_reward',
    LEADERBOARD_REWARD: 'leaderboard_reward',
    STREAK_BONUS: 'streak_bonus',
    ADMIN_ADJUSTMENT: 'admin_adjustment',

    // Birr / VP Cashier & Payments
    DEPOSIT: 'deposit',
    WITHDRAWAL: 'withdrawal',
    REFUND: 'refund',
  },

  TRANSACTION_STATUS: {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
  },

  // ─── User Account Roles & Statuses ────────────────────────────────────────
  ROLES: {
    USER: 'user',
    MODERATOR: 'moderator',
    ADMIN: 'admin',
    SUPER_ADMIN: 'super_admin',
  },

  USER_STATUS: {
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    RESTRICTED: 'restricted',
  },

  // ─── Deprecated Legacy Financial Enums (preserved for graceful compatibility) ─
  DEPOSIT_STATUS: {
    PENDING: 'pending',
    SMS_MATCHED: 'sms_matched',
    COMPLETED: 'completed',
    REJECTED: 'rejected',
  },

  DEPOSIT_CHANNELS: ['cbe', 'cbebirr', 'abyssinia', 'telebirr'],

  WITHDRAWAL_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    REJECTED: 'rejected',
  },

  // ─── Virtual Point Economy Settings ───────────────────────────────────────
  ECONOMY: {
    WELCOME_BONUS_POINTS: 1000,
    DAILY_REWARD_BASE: 100,
    DAILY_REWARD_STREAK_STEP: 50,
    DAILY_REWARD_MAX: 500,
    DEFAULT_CARD_COST_POINTS: 10,
  },

  // ─── Default Game Configurations ──────────────────────────────────────────
  GAME_CONFIG: {
    MIN_PLAYERS: parseInt(process.env.MIN_PLAYERS) || 2,
    MAX_PLAYERS: parseInt(process.env.MAX_PLAYERS) || 100,
    CARDS_PER_GAME: 100,
    DEFAULT_CARD_COST: 10,
    MAX_CARDS_PER_PLAYER: 4,
    NUMBER_DRAW_INTERVAL_MS: 4000,
    START_COUNTDOWN_SECONDS: 10,
    REGISTRATION_COUNTDOWN_SECONDS: 30,
    INACTIVITY_TIMEOUT_SECONDS: 120,
  },

  // ─── Ball Ranges for 75-Ball Bingo ────────────────────────────────────────
  BINGO_75_COLUMNS: {
    B: { min: 1,  max: 15 },
    I: { min: 16, max: 30 },
    N: { min: 31, max: 45 },
    G: { min: 46, max: 60 },
    O: { min: 61, max: 75 },
  },
  BINGO_COLUMNS: {
    B: { min: 1,  max: 15 },
    I: { min: 16, max: 30 },
    N: { min: 31, max: 45 },
    G: { min: 46, max: 60 },
    O: { min: 61, max: 75 },
  },

  // ─── Ball Ranges for 90-Ball Bingo (9 columns) ───────────────────────────
  BINGO_90_COLUMNS: [
    { min: 1,  max: 9 },
    { min: 10, max: 19 },
    { min: 20, max: 29 },
    { min: 30, max: 39 },
    { min: 40, max: 49 },
    { min: 50, max: 59 },
    { min: 60, max: 69 },
    { min: 70, max: 79 },
    { min: 80, max: 90 },
  ],

  // ─── Audit Action Types ───────────────────────────────────────────────────
  AUDIT_ACTIONS: {
    USER_REGISTERED: 'user_registered',
    USER_SUSPENDED: 'user_suspended',
    USER_RESTRICTED: 'user_restricted',
    USER_RESTORED: 'user_restored',
    USER_ROLE_CHANGED: 'user_role_changed',
    POINTS_ADJUSTED: 'points_adjusted',
    DAILY_REWARD_CLAIMED: 'daily_reward_claimed',
    ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',
    GAME_CREATED: 'game_created',
    GAME_STARTED: 'game_started',
    GAME_PAUSED: 'game_paused',
    GAME_RESUMED: 'game_resumed',
    GAME_CANCELLED: 'game_cancelled',
    WINNER_DETERMINED: 'winner_determined',
    SETTINGS_UPDATED: 'settings_updated',
  },
};
