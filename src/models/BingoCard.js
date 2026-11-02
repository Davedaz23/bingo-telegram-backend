const mongoose = require('mongoose');
const { CARD_STATUS, GAME_FORMAT } = require('../config/constants');

const bingoCardSchema = new mongoose.Schema({
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true,
    index: true,
  },

  gameFormat: {
    type: String,
    enum: Object.values(GAME_FORMAT),
    default: GAME_FORMAT.BALL_75,
  },

  cardNumber: {
    type: Number,
    required: true,
  },

  // Structure for 75-ball: { B: [...], I: [...], N: [...], G: [...], O: [...] }
  // Structure for 90-ball: { grid: [[...], [...], [...]] }
  cardData: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },

  // Flat list of all numbers on the card (excluding FREE space / 0) for quick search
  allNumbers: [Number],

  status: {
    type: String,
    enum: Object.values(CARD_STATUS),
    default: CARD_STATUS.AVAILABLE,
    index: true,
  },

  // Ownership
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  ownerTelegramId: { type: String, default: null },

  // Reservation / Lock
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lockedAt: { type: Date, default: null },
  lockExpiresAt: { type: Date, default: null, index: true },

  purchasedAt: { type: Date, default: null },

  // Numbers marked on this card
  markedNumbers: [Number],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Backward compatibility virtual for card field
bingoCardSchema.virtual('card').get(function () {
  return this.cardData;
}).set(function (val) {
  this.cardData = val;
});

// Compound indexes
bingoCardSchema.index({ gameId: 1, cardNumber: 1 }, { unique: true });
bingoCardSchema.index({ gameId: 1, status: 1 });
bingoCardSchema.index({ gameId: 1, ownerId: 1 });

/**
 * Atomically reserve / lock a card for a player
 */
bingoCardSchema.statics.tryLock = async function (cardId, userId, ttlSeconds = 120) {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() + ttlSeconds * 1000);

  return this.findOneAndUpdate(
    {
      _id: cardId,
      status: CARD_STATUS.AVAILABLE,
      $or: [
        { lockedBy: null },
        { lockExpiresAt: { $lt: now } },
      ],
    },
    {
      $set: {
        status: CARD_STATUS.SELECTED,
        lockedBy: userId,
        lockedAt: now,
        lockExpiresAt: lockExpiry,
      },
    },
    { new: true }
  );
};

/**
 * Release a card lock back to available
 */
bingoCardSchema.statics.releaseLock = async function (cardId, userId) {
  return this.findOneAndUpdate(
    {
      _id: cardId,
      lockedBy: userId,
      status: CARD_STATUS.SELECTED,
    },
    {
      $set: {
        status: CARD_STATUS.AVAILABLE,
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
      },
    },
    { new: true }
  );
};

/**
 * Confirm purchase of a reserved card
 */
bingoCardSchema.statics.confirmPurchase = async function (cardId, userId) {
  return this.findOneAndUpdate(
    {
      _id: cardId,
      lockedBy: userId,
      status: CARD_STATUS.SELECTED,
    },
    {
      $set: {
        status: CARD_STATUS.PURCHASED,
        ownerId: userId,
        purchasedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
      },
    },
    { new: true }
  );
};

module.exports = mongoose.model('BingoCard', bingoCardSchema);
