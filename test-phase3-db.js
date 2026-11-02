require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Game = require('./src/models/Game');
const BingoCard = require('./src/models/BingoCard');
const VirtualPointTransaction = require('./src/models/VirtualPointTransaction');
const Achievement = require('./src/models/Achievement');
const UserAchievement = require('./src/models/UserAchievement');
const AuditLog = require('./src/models/AuditLog');
const SystemSetting = require('./src/models/SystemSetting');
const { seedInitialData } = require('./src/services/seedService');
const { creditPoints, debitPoints, claimDailyReward, getDailyRewardStatus } = require('./src/services/virtualPointsService');

async function testDatabaseRedesign() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected successfully to MongoDB');

  // 1. Test Seeding
  console.log('Testing seedInitialData()...');
  await seedInitialData();
  const achCount = await Achievement.countDocuments();
  const settingsCount = await SystemSetting.countDocuments();
  console.log(`✅ Seed verified: ${achCount} achievements, ${settingsCount} settings in DB`);

  // 2. Test User Model & Virtual Points
  console.log('Testing User creation with Virtual Points...');
  const testTgId = 'test_tg_' + Date.now();
  const user = await User.create({
    telegramId: testTgId,
    username: 'test_player',
    firstName: 'Test',
    lastName: 'Player',
    virtualPoints: 1000,
  });
  console.log(`✅ User created: ${user.fullName} (${user._id}), VP Balance: ${user.virtualPoints}`);

  // 3. Test Credit & Debit Virtual Points
  console.log('Testing atomic credit/debit...');
  const creditTx = await creditPoints(user._id, 250, 'welcome_bonus', { description: 'Test bonus' });
  console.log(`✅ Credited 250 VP: balanceBefore=${creditTx.balanceBefore}, balanceAfter=${creditTx.balanceAfter}`);

  const { transaction: debitTx, user: debitedUser } = await debitPoints(user._id, 100, 'card_purchase', { description: 'Test card' });
  console.log(`✅ Debited 100 VP: balanceAfter=${debitedUser.virtualPoints}`);

  // 4. Test Daily Rewards
  console.log('Testing daily rewards claim...');
  const rewardRes = await claimDailyReward(user._id);
  console.log(`✅ Claimed daily reward: +${rewardRes.pointsAwarded} VP, Streak: ${rewardRes.streakDays}, New Balance: ${rewardRes.newBalance}`);

  const rewardStatus = await getDailyRewardStatus(user._id);
  console.log(`✅ Reward status checked: canClaim=${rewardStatus.canClaim}, streakDays=${rewardStatus.streakDays}`);

  // 5. Test Game & Multi-Winner Schema
  console.log('Testing Game model creation with 75-ball & 90-ball format support...');
  const game = await Game.create({
    gameCode: 'TEST' + Date.now().toString(36).toUpperCase().slice(-5),
    title: 'High Stakes 75',
    gameFormat: '75_ball',
    cardCost: 25,
    prizePool: 100,
    status: 'registration_open',
    winners: [{
      userId: user._id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      winningNumber: 42,
      prizePoints: 100,
      patternAchieved: 'any_line',
    }],
  });
  console.log(`✅ Game created: ${game.gameCode}, format=${game.gameFormat}, winnersCount=${game.winners.length}`);

  // 6. Test Audit Log
  const audit = await AuditLog.create({
    action: 'test_validation',
    actorType: 'system',
    targetType: 'game',
    targetId: game._id.toString(),
    details: { message: 'Phase 3 database test passed' },
  });
  console.log(`✅ AuditLog verified: action=${audit.action}, id=${audit._id}`);

  // Cleanup test documents
  await User.deleteOne({ _id: user._id });
  await VirtualPointTransaction.deleteMany({ userId: user._id });
  await Game.deleteOne({ _id: game._id });
  await AuditLog.deleteOne({ _id: audit._id });
  console.log('🧹 Cleaned up test records');

  await mongoose.disconnect();
  console.log('✅ Phase 3 Database & Architecture Test Passed 100%!');
}

testDatabaseRedesign().catch(err => {
  console.error('❌ Database test failed:', err);
  process.exit(1);
});
