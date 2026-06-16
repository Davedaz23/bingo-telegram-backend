module.exports = {
  GAME_STATUS: {
    SELECTION: 'selection',     // cards available, players select
    STARTING: 'starting',       // countdown started
    ACTIVE: 'active',           // game in progress
    FINISHED: 'finished',       // game completed with winner
    CANCELLED: 'cancelled',     // cancelled (refund triggered)
    REFUNDING: 'refunding',     // refund in progress
  },

  CARD_STATUS: {
    AVAILABLE: 'available',
    SELECTED: 'selected',     // locked by a user temporarily
    PURCHASED: 'purchased',
    RELEASED: 'released',
  },

  TRANSACTION_TYPE: {
    DEPOSIT: 'deposit',
    WITHDRAWAL: 'withdrawal',
    TRANSFER: 'transfer',
    CARD_PURCHASE: 'card_purchase',
    GAME_WIN: 'game_win',
    REFUND: 'refund',
    PLATFORM_FEE: 'platform_fee',
  },

  TRANSACTION_STATUS: {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
  },

  WITHDRAWAL_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    REJECTED: 'rejected',
  },

  DEPOSIT_CHANNELS: ['cbe', 'cbebirr', 'abyssinia', 'telebirr'],

  DEPOSIT_STATUS: {
    PENDING: 'pending',
    SMS_MATCHED: 'sms_matched',
    COMPLETED: 'completed',
    REJECTED: 'rejected',
  },

  BINGO_PATTERNS: {
    FULL_CARD: 'full_card',
    ANY_LINE: 'any_line',
    FOUR_CORNERS: 'four_corners',
  },

  CARD_LOCK_TTL_SECONDS: 120,

  GAME_CONFIG: {
    MIN_PLAYERS: parseInt(process.env.MIN_PLAYERS) || 2,
    MAX_PLAYERS: parseInt(process.env.MAX_PLAYERS) || 400,
    CARDS_PER_GAME: 400,
    CARD_PRICE: parseFloat(process.env.CARD_PRICE) || 10,
    PLATFORM_FEE_PERCENT: parseFloat(process.env.PLATFORM_FEE_PERCENT) || 20,
    NUMBER_DRAW_INTERVAL_MS: 5000,
    START_COUNTDOWN_SECONDS: 8,
    SELECTION_COUNTDOWN_SECONDS: 30, // countdown when 2nd player joins before game starts
    SELECTION_TIMEOUT_SECONDS: 120, // wait up to 2 min for 2nd player after first selection
    REFUND_TIMEOUT_MINUTES: parseInt(process.env.REFUND_TIMEOUT_MINUTES) || 5,
  },

  BINGO_COLUMNS: {
    B: { min: 1,  max: 15 },
    I: { min: 16, max: 30 },
    N: { min: 31, max: 45 },
    G: { min: 46, max: 60 },
    O: { min: 61, max: 75 },
  },

  ROLES: {
    USER: 'user',
    ADMIN: 'admin',
    SUPER_ADMIN: 'super_admin',
  },

  REGISTRATION_BONUS: 20,
};
