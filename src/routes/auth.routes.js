// ─────────────────────────────────────────────────────────────
// routes/auth.routes.js
// ─────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateTelegram } = require('../middleware/telegramAuth');

// Email/password auth
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Telegram auth (kept as alternative)
router.post('/telegram', authController.telegramLogin);
router.post('/dev-login', authController.devLogin);

// Protected
router.get('/me', authenticateTelegram, authController.getMe);

module.exports = router;
