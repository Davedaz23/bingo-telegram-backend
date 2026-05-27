// ─────────────────────────────────────────────────────────────
// routes/auth.routes.js
// ─────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateTelegram } = require('../middleware/telegramAuth');

router.post('/telegram', authController.telegramLogin);
router.get('/me', authenticateTelegram, authController.getMe);

module.exports = router;
