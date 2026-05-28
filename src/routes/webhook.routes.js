const express = require('express');
const router = express.Router();
const { validateTelegramWebhook } = require('../middleware/telegramAuth');
const { processUpdate } = require('../services/telegramBot');
const logger = require('../utils/logger');

// ─── Telegram Bot Webhook ─────────────────────────────────────────────────────
router.post('/telegram', validateTelegramWebhook, async (req, res) => {
  try {
    const update = req.body;
    logger.debug('Telegram update received:', JSON.stringify(update).slice(0, 200));
    processUpdate(update);
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('Telegram webhook error:', err);
    res.status(200).json({ ok: true });
  }
});

module.exports = router;
