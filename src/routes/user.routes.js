const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateTelegram } = require('../middleware/telegramAuth');
const { AppError } = require('../middleware/errorHandler');

router.use(authenticateTelegram);

// Get profile
router.get('/me', async (req, res) => {
  const user = await User.findById(req.userId).select('-__v');
  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, user });
});

// Update payment info
router.put('/me/payment-info', async (req, res) => {
  const { accountNumber, bankName, phoneNumber } = req.body;
  const user = await User.findByIdAndUpdate(
    req.userId,
    { paymentInfo: { accountNumber, bankName, phoneNumber } },
    { new: true }
  );
  res.json({ success: true, message: 'Payment info updated', user });
});

// Leaderboard
router.get('/leaderboard', async (req, res) => {
  const leaders = await User.find({ isActive: true })
    .sort({ gamesWon: -1, totalWon: -1 })
    .limit(50)
    .select('firstName username gamesPlayed gamesWon totalWon telegramId');
  res.json({ success: true, leaders });
});

module.exports = router;
