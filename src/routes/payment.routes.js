const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticateTelegram } = require('../middleware/telegramAuth');

router.use(authenticateTelegram);

router.get('/balance', paymentController.getBalance);
router.post('/deposit', paymentController.initiateDeposit);
router.get('/deposit/accounts', paymentController.getDepositAccounts);
router.get('/transactions', paymentController.getTransactions);
router.post('/transfer', paymentController.transfer);

module.exports = router;
