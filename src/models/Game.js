const mongoose = require('mongoose');
const { GAME_STATUS, BINGO_PATTERNS } = require('../config/constants');

const gameSchema = new mongoose.Schema({
  gameCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    index: true,
  },

  status: {
    type: String,
    enum: Object.values(GAME_STATUS),
    default: GAME_STATUS.WAITING,
    index: true,
  },

  cardPrice: {
    type: Number,
    required: true,
  },

  platformFeePercent: {
    type: Number,
    required: true,
    default: 10,
  },

  winPattern: {
    type: String,
    enum: Object.values(BINGO_PATTERNS),
    default: BINGO_PATTERNS.ANY_LINE,
  },

  // Players who bought cards
  players: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    telegramId: String,
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'BingoCard' },
    joinedAt: { type: Date, default: Date.now },
  }],

  maxPlayers: { type: Number, default: 100 },
  minPlayers: { type: Number, default: 2 },

  // Number drawing
  drawSequence: [Number],     // pre-generated shuffle of 1-75
  drawnNumbers: [Number],     // numbers called so far
  currentDrawIndex: { type: Number, default: 0 },
  drawIntervalMs: { type: Number, default: 5000 },

  // Prize pool
  prizePool: { type: Number, default: 0 },
  platformFeeCollected: { type: Number, default: 0 },

  // Winner
  winner: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    telegramId: String,
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'BingoCard' },
    winningNumber: Number,   // the number that completed bingo
    prizeAmount: Number,
    claimedAt: Date,
  },

  // Timing
  scheduledStartAt: Date,
  startedAt: Date,
  endedAt: Date,
  countdownStartedAt: Date,

  // Flags
  isRefunded: { type: Boolean, default: false },
  refundReason: { type: String, default: null },
  refundedAt: Date,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin who created

}, { timestamps: true });

gameSchema.virtual('playerCount').get(function () {
  return this.players.length;
});

gameSchema.virtual('isJoinable').get(function () {
  return (
    this.status === GAME_STATUS.WAITING &&
    this.players.length < this.maxPlayers
  );
});

gameSchema.index({ status: 1, createdAt: -1 });
gameSchema.index({ 'players.userId': 1 });

module.exports = mongoose.model('Game', gameSchema);
