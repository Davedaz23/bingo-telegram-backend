const express = require('express');
const router = express.Router();
const gameController = require('../controllers/game.controller');
const { authenticateTelegram } = require('../middleware/telegramAuth');

router.use(authenticateTelegram);

router.get('/', gameController.listGames);
router.get('/history', gameController.getMyHistory);
router.get('/:id', gameController.getGame);
router.get('/:id/cards', gameController.getGameCards);
router.post('/:id/cards/:cardId/select', gameController.selectCard);
router.post('/:id/cards/:cardId/release', gameController.releaseCard);
router.post('/:id/cards/:cardId/purchase', gameController.purchaseCard);
router.post('/:id/cards/:cardId/mark', gameController.markNumber);
router.post('/:id/bingo', gameController.claimBingo);
router.post('/:id/leave', gameController.leaveGame);

module.exports = router;
