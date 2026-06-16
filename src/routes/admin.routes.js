const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticateTelegram, requireAdmin } = require('../middleware/telegramAuth');

router.use(authenticateTelegram, requireAdmin);

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// Game management
router.get('/games', adminController.listAllGames);
router.post('/games', adminController.createGame);
router.post('/games/:id/start', adminController.startGame);
router.post('/games/:id/cancel', adminController.cancelGame);

// User management
router.get('/users', adminController.listUsers);
router.post('/users/:userId/ban', adminController.banUser);
router.post('/users/:userId/unban', adminController.unbanUser);
router.post('/users/:userId/credit', adminController.manualCredit);

// Game player management
router.post('/games/:gameId/players/:userId/remove', adminController.removePlayerFromGame);

// Deposit management (SMS)
router.get('/deposits', adminController.listDepositRequests);
router.post('/deposits/:id/match', adminController.matchSmsDeposit);
router.post('/deposits/:id/confirm', adminController.confirmDeposit);

// Withdrawal management
router.get('/withdrawals', adminController.listWithdrawals);
router.post('/withdrawals/:id/approve', adminController.approveWithdrawal);
router.post('/withdrawals/:id/reject', adminController.rejectWithdrawal);

module.exports = router;
