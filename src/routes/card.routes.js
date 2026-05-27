const express = require('express');
const router = express.Router();
const BingoCard = require('../models/BingoCard');
const { authenticateTelegram } = require('../middleware/telegramAuth');
const { cardToGrid } = require('../utils/bingoUtils');
const { AppError } = require('../middleware/errorHandler');

router.use(authenticateTelegram);

// Get my card in a game with its grid
router.get('/:cardId', async (req, res) => {
  const card = await BingoCard.findOne({
    _id: req.params.cardId,
    ownerId: req.userId,
  });
  if (!card) throw new AppError('Card not found', 404);

  res.json({
    success: true,
    card: {
      _id: card._id,
      cardNumber: card.cardNumber,
      card: card.card,
      grid: cardToGrid(card.card),
    },
  });
});

module.exports = router;
