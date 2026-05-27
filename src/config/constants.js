module.exports = {
  GAME_STATUS: {
    WAITING: 'waiting',       // waiting for players
    STARTING: 'starting',     // countdown started
    ACTIVE: 'active',         // game in progress
    FINISHED: 'finished',     // game completed with winner
    CANCELLED: 'cancelled',   // cancelled (refund triggered)
    REFUNDING: 'refunding',   // refund in progress
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

  BINGO_PATTERNS: {
    FULL_CARD: 'full_card',
    ANY_LINE: 'any_line',       // horizontal, vertical, or diagonal
    FOUR_CORNERS: 'four_corners',
  },

  CARD_LOCK_TTL_SECONDS: 120, // 2 minutes to complete purchase after selecting

  GAME_CONFIG: {
    MIN_PLAYERS: parseInt(process.env.MIN_PLAYERS) || 2,
    MAX_PLAYERS: parseInt(process.env.MAX_PLAYERS) || 100,
    CARD_PRICE: parseFloat(process.env.CARD_PRICE) || 50,
    PLATFORM_FEE_PERCENT: parseFloat(process.env.PLATFORM_FEE_PERCENT) || 10,
    NUMBER_DRAW_INTERVAL_MS: 5000, // draw a number every 5 seconds
    START_COUNTDOWN_SECONDS: 30,
    MIN_PLAYERS_TO_AUTO_START: parseInt(process.env.MIN_PLAYERS) || 2,
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
};
