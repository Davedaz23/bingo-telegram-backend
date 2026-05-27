const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticateTelegram } = require('../middleware/telegramAuth');

router.use(authenticateTelegram);

router.post('/', paymentController.requestWithdrawal);
router.get('/', paymentController.getMyWithdrawals);

module.exports = router;
