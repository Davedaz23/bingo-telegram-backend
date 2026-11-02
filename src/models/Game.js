const mongoose = require('mongoose');
const {
  GAME_STATUS,
  GAME_FORMAT,
  BINGO_PATTERNS,
  TIE_BREAKER_RULES,
  GAME_CONFIG,
} = require('../config/constants');

const playerEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  telegramId: { type: String, default: null },
  username: { type: String, default: null },
  firstName: { type: String, default: 'Player' },
  cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'BingoCard' },
  cardIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BingoCard' }],
  joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const winnerEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  telegramId: { type: String, default: null },
  username: { type: String, default: null },
  firstName: { type: String, default: 'Winner' },
  cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'BingoCard' },
  winningNumber: { type: Number, required: true },
  prizePoints: { type: Number, required: true },
  claimedAt: { type: Date, default: Date.now },
  patternAchieved: { type: String, default: 'any_line' },
  winningLine: {
    type: { type: String },
    index: { type: Number, default: null },
  },
}, { _id: false });

const gameSchema = new mongoose.Schema({
  gameCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    index: true,
  },

  title: {
    type: String,
    default: 'Classic Bingo Room',
    trim: true,
  },

  description: {
    type: String,
    default: 'Free-to-play Bingo room with virtual rewards.',
    trim: true,
  },

  gameFormat: {
    type: String,
    enum: Object.values(GAME_FORMAT),
    default: GAME_FORMAT.BALL_75,
    index: true,
  },

  status: {
    type: String,
    enum: Object.values(GAME_STATUS),
    default: GAME_STATUS.REGISTRATION_OPEN,
    index: true,
  },

  winPattern: {
    type: String,
    enum: Object.values(BINGO_PATTERNS),
    default: BINGO_PATTERNS.ANY_LINE,
  },

  tieBreakerRule: {
    type: String,
    enum: Object.values(TIE_BREAKER_RULES),
    default: TIE_BREAKER_RULES.SPLIT_PRIZE,
  },

  // Virtual points cost per card (0 for free games)
  cardCost: {
    type: Number,
    required: true,
    default: GAME_CONFIG.DEFAULT_CARD_COST,
    min: 0,
  },

  prizePool: {
    type: Number,
    default: 0,
    min: 0,
  },

  guaranteedPrize: {
    type: Number,
    default: 50,
    min: 0,
  },

  maxPlayers: {
    type: Number,
    default: GAME_CONFIG.MAX_PLAYERS,
  },

  minPlayers: {
    type: Number,
    default: GAME_CONFIG.MIN_PLAYERS,
  },

  maxCardsPerPlayer: {
    type: Number,
    default: GAME_CONFIG.MAX_CARDS_PER_PLAYER,
    min: 1,
    max: 12,
  },

  totalCardsCount: {
    type: Number,
    default: GAME_CONFIG.CARDS_PER_GAME,
  },

  visibility: {
    type: String,
    enum: ['public', 'private', 'unlisted'],
    default: 'public',
    index: true,
  },

  autoCall: {
    type: Boolean,
    default: true,
  },

  drawIntervalMs: {
    type: Number,
    default: GAME_CONFIG.NUMBER_DRAW_INTERVAL_MS,
  },

  // Number drawing sequence
  totalBalls: {
    type: Number,
    default: 75,
  },
  drawSequence: [Number],
  drawnNumbers: [Number],
  currentDrawIndex: {
    type: Number,
    default: 0,
  },
  lastDrawnAt: {
    type: Date,
    default: null,
  },

  // Registered players
  players: [playerEntrySchema],

  // Winners (supports simultaneous winners on same ball)
  winners: [winnerEntrySchema],

  // Timestamps
  scheduledStartAt: { type: Date, default: null },
  registrationStartedAt: { type: Date, default: Date.now },
  countdownStartedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  pausedAt: { type: Date, default: null },
  pauseReason: { type: String, default: null },

  // Refund / Cancellation tracking
  isRefunded: { type: Boolean, default: false },
  refundReason: { type: String, default: null },
  refundedAt: { type: Date, default: null },

  // Admin audit
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Backward compatibility virtuals
gameSchema.virtual('cardPrice').get(function () {
  return this.cardCost;
}).set(function (val) {
  this.cardCost = val;
});

gameSchema.virtual('winner').get(function () {
  return this.winners && this.winners.length > 0 ? this.winners[0] : null;
});

gameSchema.virtual('playerCount').get(function () {
  return this.players ? this.players.length : 0;
});

gameSchema.virtual('totalCardsSold').get(function () {
  if (!this.players) return 0;
  return this.players.reduce((sum, p) => sum + (p.cardIds ? p.cardIds.length : 0), 0);
});

gameSchema.virtual('isJoinable').get(function () {
  const currentCount = this.players ? this.players.length : 0;
  return (
    [GAME_STATUS.REGISTRATION_OPEN, GAME_STATUS.WAITING, GAME_STATUS.SELECTION].includes(this.status) &&
    currentCount < (this.maxPlayers || 100)
  );
});

gameSchema.index({ status: 1, createdAt: -1 });
gameSchema.index({ visibility: 1, status: 1 });
gameSchema.index({ 'players.userId': 1 });

module.exports = mongoose.model('Game', gameSchema);
