const mongoose = require('mongoose');
const { CARD_STATUS } = require('../config/constants');

const bingoCardSchema = new mongoose.Schema({
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true,
    index: true,
  },

  cardNumber: { type: Number, required: true }, // card #1, #2, ... within game

  // The 5x5 grid: { B: [n,n,n,n,n], I: [...], N: [...], G: [...], O: [...] }
  card: {
    B: [Number],
    I: [Number],
    N: [Number],
    G: [Number],
    O: [Number],
  },

  status: {
    type: String,
    enum: Object.values(CARD_STATUS),
    default: CARD_STATUS.AVAILABLE,
    index: true,
  },

  // Ownership
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ownerTelegramId: { type: String, default: null },

  // Optimistic locking: when a user "selects" this card, we lock it temporarily
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lockedAt: { type: Date, default: null },
  lockExpiresAt: { type: Date, default: null, index: true },

  purchasedAt: { type: Date, default: null },

  // For winner verification
  markedNumbers: [Number], // which numbers have been marked on this card
}, {
  timestamps: true,
});

// Compound index for atomic selection
bingoCardSchema.index({ gameId: 1, status: 1 });
bingoCardSchema.index({ gameId: 1, cardNumber: 1 }, { unique: true });
bingoCardSchema.index({ lockExpiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL on lockExpiry field

/**
 * Atomically try to lock a card for a user.
 * Returns true if lock succeeded, false if already locked/purchased.
 */
bingoCardSchema.statics.tryLock = async function (cardId, userId, ttlSeconds = 120) {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() + ttlSeconds * 1000);

  const result = await this.findOneAndUpdate(
    {
      _id: cardId,
      status: CARD_STATUS.AVAILABLE,
      $or: [
        { lockedBy: null },
        { lockExpiresAt: { $lt: now } }, // expired lock
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

  return result;
};

/**
 * Release an expired or abandoned lock, returning card to AVAILABLE
 */
bingoCardSchema.statics.releaseLock = async function (cardId, userId) {
  return this.findOneAndUpdate(
    { _id: cardId, lockedBy: userId, status: CARD_STATUS.SELECTED },
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
 * Confirm purchase: atomically move from SELECTED → PURCHASED
 */
bingoCardSchema.statics.confirmPurchase = async function (cardId, userId) {
  const now = new Date();
  // Allow purchase even if lock expired, as long as this user was the locker
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
        purchasedAt: now,
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
      },
    },
    { new: true }
  );
};

module.exports = mongoose.model('BingoCard', bingoCardSchema);
