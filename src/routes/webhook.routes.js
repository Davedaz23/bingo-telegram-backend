const express = require('express');
const router = express.Router();
const { validateTelegramWebhook } = require('../middleware/telegramAuth');
const { verifyAndCompleteDeposit } = require('../services/paymentService');
const crypto = require('crypto');
const logger = require('../utils/logger');

// ─── Chapa Payment Webhook ────────────────────────────────────────────────────
router.post('/chapa', async (req, res) => {
  try {
    // Verify Chapa webhook signature if they provide one
    // For now, we verify via the API call inside verifyAndCompleteDeposit

    const { tx_ref, status } = req.body;
    logger.info(`Chapa webhook: ${tx_ref} status=${status}`);

    if (status === 'success' && tx_ref) {
      try {
        await verifyAndCompleteDeposit(tx_ref);
      } catch (err) {
        logger.warn(`Webhook deposit verify failed for ${tx_ref}: ${err.message}`);
      }
    }

    // Always return 200 to Chapa
    res.status(200).json({ status: 'received' });
  } catch (err) {
    logger.error('Chapa webhook error:', err);
    res.status(200).json({ status: 'received' }); // still 200
  }
});

// ─── Telegram Bot Webhook ─────────────────────────────────────────────────────
router.post('/telegram', validateTelegramWebhook, async (req, res) => {
  try {
    const update = req.body;
    logger.debug('Telegram update received:', JSON.stringify(update).slice(0, 200));
    // Process Telegram bot commands here if needed
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('Telegram webhook error:', err);
    res.status(200).json({ ok: true });
  }
});

module.exports = router;
