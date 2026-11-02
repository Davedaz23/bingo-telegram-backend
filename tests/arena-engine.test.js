const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const User = require('../src/models/User');
const Game = require('../src/models/Game');
const BingoCard = require('../src/models/BingoCard');
const {
  ensureSelectionGame,
  getActiveArenaGame,
  quickJoinArena,
  claimBingo,
} = require('../src/services/gameService');
const { checkBingo, checkOneAway } = require('../src/utils/bingoUtils');
const { GAME_STATUS } = require('../src/config/constants');

async function runArenaIntegrationTest() {
  console.log('--- STARTING ARENA ENGINE INTEGRATION TEST ---');
  await connectDB();

  try {
    // 1. Setup Test Users
    let userA = await User.findOne({ telegramId: 'arena_test_user_a' });
    if (!userA) {
      userA = await User.create({
        telegramId: 'arena_test_user_a',
        username: 'test_player_a',
        firstName: 'Alice',
        virtualPoints: 1000,
        role: 'user',
      });
    } else {
      userA.virtualPoints = 1000;
      await userA.save();
    }

    let userB = await User.findOne({ telegramId: 'arena_test_user_b' });
    if (!userB) {
      userB = await User.create({
        telegramId: 'arena_test_user_b',
        username: 'test_player_b',
        firstName: 'Bob',
        virtualPoints: 1000,
        role: 'user',
      });
    } else {
      userB.virtualPoints = 1000;
      await userB.save();
    }

    console.log(`✓ Test Users Ready: ${userA.firstName} (${userA.virtualPoints} VP), ${userB.firstName} (${userB.virtualPoints} VP)`);

    // 2. Fetch or initialize active arena
    const arenaState = await getActiveArenaGame(userA._id);
    console.log(`✓ Arena active game retrieved: #${arenaState.game.gameCode} (Status: ${arenaState.game.status}, PrizePool: ${arenaState.game.prizePool} VP)`);

    // 3. User A 1-Tap Quick Join
    const joinResA = await quickJoinArena(userA._id, 1);
    console.log(`✓ Alice 1-Tap Quick Joined! Assigned card #${joinResA.cards[0].cardNumber}`);
    
    // Check Alice's balance
    const updatedUserA = await User.findById(userA._id);
    console.assert(updatedUserA.virtualPoints === 990, `Alice balance should be 990, got ${updatedUserA.virtualPoints}`);

    // 4. User B Quick Join
    const joinResB = await quickJoinArena(userB._id, 1);
    console.log(`✓ Bob 1-Tap Quick Joined! Assigned card #${joinResB.cards[0].cardNumber}`);
    const updatedGame = await Game.findById(joinResB.game._id);
    console.log(`✓ Game players count: ${updatedGame.players.length}, PrizePool: ${updatedGame.prizePool} VP`);

    // 5. Test Win Pattern & One Away Detection
    const cardDoc = await BingoCard.findById(joinResA.cards[0]._id);
    const firstRowNums = [cardDoc.card.B[0], cardDoc.card.I[0], cardDoc.card.N[0], cardDoc.card.G[0], cardDoc.card.O[0]];
    
    // Simulate 4 out of 5 drawn
    const partialDraw = firstRowNums.slice(0, 4);
    const oneAwayRes = checkOneAway(cardDoc.card, partialDraw, 'any_line');
    console.log(`✓ One-away check: ${oneAwayRes ? `ON FIRE! Needs [${oneAwayRes.neededNumbers.join(', ')}]` : 'None'}`);
    console.assert(oneAwayRes && oneAwayRes.neededNumbers.includes(firstRowNums[4]), 'One-away detected correct missing number');

    // Simulate complete 5-in-a-row draw
    const fullDraw = firstRowNums;
    const winRes = checkBingo(cardDoc.card, fullDraw, 'any_line');
    console.log(`✓ Full line win check: ${winRes ? `WIN! (${winRes.type} index ${winRes.index})` : 'No win'}`);
    console.assert(winRes && winRes.type === 'row' && winRes.index === 0, 'Win detected on row 0');

    // 6. Set game active with these numbers and test claimBingo
    await Game.updateOne(
      { _id: updatedGame._id },
      {
        $set: {
          status: GAME_STATUS.ACTIVE,
          drawnNumbers: fullDraw,
          currentDrawIndex: fullDraw.length,
        },
      }
    );

    const claimRes = await claimBingo(updatedGame._id.toString(), userA._id.toString());
    console.log(`✓ Bingo Claim Result: Winner prize credited: +${claimRes.winnerPrize} VP!`);

    const finalUserA = await User.findById(userA._id);
    console.log(`✓ Alice Final Balance: ${finalUserA.virtualPoints} VP (Games won: ${finalUserA.gamesWon})`);
    console.assert(finalUserA.gamesWon >= 1, 'Alice gamesWon should be incremented');

    const finishedGame = await Game.findById(updatedGame._id);
    console.assert(finishedGame.status === GAME_STATUS.FINISHED, 'Game should be finished');
    console.assert(finishedGame.winners.length === 1, 'Game should have 1 winner in winners array');
    console.log(`✓ Finished game winner: ${finishedGame.winners[0].firstName} won ${finishedGame.winners[0].prizePoints} VP`);

    console.log('--- ALL ARENA ENGINE TESTS COMPLETED SUCCESSFULLY! ---');
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runArenaIntegrationTest();
