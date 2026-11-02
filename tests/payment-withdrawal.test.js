const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const User = require('../src/models/User');
const DepositRequest = require('../src/models/DepositRequest');
const Withdrawal = require('../src/models/Withdrawal');
const {
  requestSmsDeposit,
  autoMatchSmsDeposit,
} = require('../src/services/paymentService');
const {
  getDailyRewardStatus,
  claimDailyReward,
} = require('../src/services/virtualPointsService');
const {
  requestWithdrawal,
  processWithdrawal,
  rejectWithdrawal,
} = require('../src/services/withdrawalService');
const { DEPOSIT_STATUS, WITHDRAWAL_STATUS } = require('../src/config/constants');

async function runPaymentAndWithdrawalTests() {
  console.log('====================================================');
  console.log('--- STARTING BIRR CASHIER & 5-GAME QUEST TESTS ---');
  console.log('====================================================');

  await connectDB();

  try {
    const today = new Date().toISOString().slice(0, 10);

    // 1. Setup Test Users
    let testUser = await User.findOne({ telegramId: 'test_player_tele' });
    if (!testUser) {
      testUser = await User.create({
        telegramId: 'test_player_tele',
        username: 'alice_tele',
        firstName: 'Alice',
        virtualPoints: 100,
        role: 'user',
        gamesPlayed: 0,
        dailyGamesPlayed: 0,
        lastGamePlayedDate: null,
      });
    } else {
      testUser.virtualPoints = 100;
      testUser.gamesPlayed = 0;
      testUser.dailyGamesPlayed = 0;
      testUser.lastGamePlayedDate = null;
      testUser.lastDailyRewardDate = null;
      testUser.streakDays = 0;
      await testUser.save();
    }

    let testAdmin = await User.findOne({ telegramId: 'test_admin_tele' });
    if (!testAdmin) {
      testAdmin = await User.create({
        telegramId: 'test_admin_tele',
        username: 'admin_tele',
        firstName: 'Admin Bob',
        virtualPoints: 5000,
        role: 'admin',
      });
    }

    // Clean up past records for isolated run
    await DepositRequest.deleteMany({ userId: testUser._id });
    await Withdrawal.deleteMany({ userId: testUser._id });

    console.log(`✓ Test User setup: ${testUser.firstName} (${testUser.virtualPoints} Birr)`);
    console.log(`✓ Test Admin setup: ${testAdmin.firstName}`);

    // ──────────────────────────────────────────────────────────
    // TEST 1: SMS DEPOSIT & AUTO-MATCHING (1:1 BIRR CREDIT)
    // ──────────────────────────────────────────────────────────
    console.log('\n[TEST 1] Testing SMS Deposit & Core Parameter Auto-Matching in Birr...');

    const userSms = 'You have transferred ETB 250.00 to BINGO SERVICES on 02/11/2026. Ref: RB88229911. Telebirr.';
    const deposit = await requestSmsDeposit(testUser._id, 250, 'telebirr', userSms);

    if (deposit.status !== DEPOSIT_STATUS.PENDING) throw new Error('Deposit should be PENDING initially');
    if (deposit.matchedRef !== 'RB88229911') throw new Error(`Extracted ref mismatch. Expected RB88229911, got ${deposit.matchedRef}`);
    if (deposit.amount !== 250) throw new Error(`Extracted amount mismatch. Expected 250, got ${deposit.amount}`);
    console.log(`✓ User pasted SMS deposit created: Ref ${deposit.matchedRef}, Amount ${deposit.amount} Birr`);

    // Admin pastes corresponding received SMS
    const adminSms = 'You have received 250.00 ETB from Alice on 02/11/2026. Transaction No: RB88229911. Telebirr.';
    const matchResult = await autoMatchSmsDeposit(adminSms, testAdmin._id);

    if (!matchResult.matchedDeposit) throw new Error('Auto match failed to find matching deposit');
    if (matchResult.matchedDeposit.status !== DEPOSIT_STATUS.COMPLETED) {
      throw new Error(`Deposit status should be COMPLETED, got ${matchResult.matchedDeposit.status}`);
    }

    // Verify 1:1 Birr credited
    const userAfterDeposit = await User.findById(testUser._id);
    const expectedBirr = 100 + 250; // 350 Birr
    if (userAfterDeposit.virtualPoints !== expectedBirr) {
      throw new Error(`User balance expected ${expectedBirr} Birr, got ${userAfterDeposit.virtualPoints}`);
    }
    console.log(`✓ Admin auto-match verified! Credited 1:1 -> Balance is now ${userAfterDeposit.virtualPoints} Birr`);

    // ──────────────────────────────────────────────────────────
    // TEST 2: 5-GAME DAILY QUEST & REWARD INCREMENTS (5 -> 300 BIRR)
    // ──────────────────────────────────────────────────────────
    console.log('\n[TEST 2] Testing 5-Game Daily Quest & Retention Increments...');

    // A: 0 games played today -> blocked
    const status0 = await getDailyRewardStatus(testUser._id);
    if (status0.hasMetPlayRequirement !== false) throw new Error('hasMetPlayRequirement should be false with 0 games');
    if (status0.gamesRemaining !== 5) throw new Error(`Expected 5 games remaining, got ${status0.gamesRemaining}`);
    if (status0.canClaim !== false) throw new Error('canClaim should be false when games played < 5');

    let blocked0 = false;
    try {
      await claimDailyReward(testUser._id);
    } catch (err) {
      blocked0 = true;
      console.log(`✓ Claim blocked correctly (0/5 games): "${err.message}"`);
    }
    if (!blocked0) throw new Error('claimDailyReward should fail when 0 games played today');

    // B: 3 games played today -> blocked (2 more needed)
    await User.updateOne({ _id: testUser._id }, {
      $set: { dailyGamesPlayed: 3, lastGamePlayedDate: today, gamesPlayed: 3 }
    });
    const status3 = await getDailyRewardStatus(testUser._id);
    if (status3.hasMetPlayRequirement !== false) throw new Error('hasMetPlayRequirement should be false with 3 games');
    if (status3.gamesRemaining !== 2) throw new Error(`Expected 2 games remaining, got ${status3.gamesRemaining}`);

    let blocked3 = false;
    try {
      await claimDailyReward(testUser._id);
    } catch (err) {
      blocked3 = true;
      console.log(`✓ Claim blocked correctly (3/5 games): "${err.message}"`);
    }
    if (!blocked3) throw new Error('claimDailyReward should fail when only 3 games played today');

    // C: 5 games played today -> unlocked!
    await User.updateOne({ _id: testUser._id }, {
      $set: { dailyGamesPlayed: 5, lastGamePlayedDate: today, gamesPlayed: 5 }
    });
    const status5 = await getDailyRewardStatus(testUser._id);
    if (!status5.hasMetPlayRequirement) throw new Error('hasMetPlayRequirement should be true with 5 games');
    if (!status5.canClaim) throw new Error('canClaim should be true with 5 games');
    if (status5.nextRewardPoints !== 5) throw new Error(`Day 1 bonus should start from 5 Birr, got ${status5.nextRewardPoints}`);

    // D: Claim Day 1 Quest Reward (+5 Birr)
    const claimRes1 = await claimDailyReward(testUser._id);
    if (claimRes1.pointsAwarded !== 5) throw new Error(`Day 1 reward should be 5 Birr, got ${claimRes1.pointsAwarded}`);
    if (claimRes1.streakDays !== 1) throw new Error(`Streak should be 1, got ${claimRes1.streakDays}`);

    const userAfterDay1 = await User.findById(testUser._id);
    const expectedAfterDay1 = expectedBirr + 5; // 355
    if (userAfterDay1.virtualPoints !== expectedAfterDay1) {
      throw new Error(`Balance after Day 1 expected ${expectedAfterDay1}, got ${userAfterDay1.virtualPoints}`);
    }
    console.log(`✓ Day 1 Quest Claimed! +${claimRes1.pointsAwarded} Birr (Streak: Day 1). New Balance: ${userAfterDay1.virtualPoints} Birr`);

    // E: Duplicate claim on same day blocked
    let threwDuplicate = false;
    try {
      await claimDailyReward(testUser._id);
    } catch (err) {
      threwDuplicate = true;
      console.log(`✓ Duplicate claim blocked correctly: "${err.message}"`);
    }
    if (!threwDuplicate) throw new Error('Duplicate claim should throw error');

    // F: Day 2 Continuous Streak -> Awards 7 Birr (+2 increment)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await User.updateOne({ _id: testUser._id }, {
      $set: {
        lastDailyRewardDate: yesterday,
        streakDays: 1,
        dailyGamesPlayed: 5,
        lastGamePlayedDate: today,
      }
    });
    const claimRes2 = await claimDailyReward(testUser._id);
    if (claimRes2.pointsAwarded !== 7) throw new Error(`Day 2 reward should be 7 Birr, got ${claimRes2.pointsAwarded}`);
    if (claimRes2.streakDays !== 2) throw new Error(`Streak should be 2, got ${claimRes2.streakDays}`);
    console.log(`✓ Day 2 Continuous Streak Claimed! +${claimRes2.pointsAwarded} Birr (Streak: Day 2). Next: 10 Birr`);

    // G: Failed Yesterday / Missed Day -> Resets back to 5 Birr
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await User.updateOne({ _id: testUser._id }, {
      $set: {
        lastDailyRewardDate: threeDaysAgo,
        streakDays: 5, // was high streak previously
        dailyGamesPlayed: 5,
        lastGamePlayedDate: today,
      }
    });
    const claimResReset = await claimDailyReward(testUser._id);
    if (claimResReset.pointsAwarded !== 5) throw new Error(`Reset reward should be 5 Birr, got ${claimResReset.pointsAwarded}`);
    if (claimResReset.streakDays !== 1) throw new Error(`Streak should reset to 1, got ${claimResReset.streakDays}`);
    console.log(`✓ Streak Reset Verified after missed day! Awarded ${claimResReset.pointsAwarded} Birr and restarted streak.`);

    // ──────────────────────────────────────────────────────────
    // TEST 3: WITHDRAWAL REQUEST, ESCROW & REFUND ON REJECT
    // ──────────────────────────────────────────────────────────
    console.log('\n[TEST 3] Testing Withdrawal Request, Escrow Holding & Admin Reject/Refund...');

    const freshUser = await User.findById(testUser._id);
    const balanceBeforeW = freshUser.virtualPoints;

    // Request 100 Birr withdrawal
    const w1 = await requestWithdrawal(testUser._id, 100, {
      channel: 'cbebirr',
      phoneNumber: '0922334455',
      accountHolderName: 'Alice Test',
    });

    const userInEscrow = await User.findById(testUser._id);
    if (userInEscrow.virtualPoints !== balanceBeforeW - 100) {
      throw new Error(`Balance in escrow expected ${balanceBeforeW - 100}, got ${userInEscrow.virtualPoints}`);
    }
    console.log(`✓ 100 Birr withdrawal requested. Held in escrow: ${userInEscrow.virtualPoints} Birr remaining`);

    // Admin rejects withdrawal
    await rejectWithdrawal(w1._id, testAdmin._id, 'Invalid phone number format');
    const userAfterRefund = await User.findById(testUser._id);
    if (userAfterRefund.virtualPoints !== balanceBeforeW) {
      throw new Error(`Balance after refund expected ${balanceBeforeW}, got ${userAfterRefund.virtualPoints}`);
    }
    console.log(`✓ Withdrawal rejected with reason. Refund verified! Balance restored to ${userAfterRefund.virtualPoints} Birr`);

    // ──────────────────────────────────────────────────────────
    // TEST 4: WITHDRAWAL APPROVAL & COMPLETION
    // ──────────────────────────────────────────────────────────
    console.log('\n[TEST 4] Testing Withdrawal Approval & Mark Paid...');

    // User requests 150 Birr withdrawal via Telebirr
    const w2 = await requestWithdrawal(testUser._id, 150, {
      channel: 'telebirr',
      phoneNumber: '0911223344',
      accountHolderName: 'Alice Test',
    });

    const completedW = await processWithdrawal(w2._id, testAdmin._id, 'TX-TELE-PAID-9922');
    if (completedW.status !== WITHDRAWAL_STATUS.COMPLETED) {
      throw new Error(`Withdrawal status expected COMPLETED, got ${completedW.status}`);
    }
    if (completedW.paymentReference !== 'TX-TELE-PAID-9922') {
      throw new Error(`Payment reference mismatch: ${completedW.paymentReference}`);
    }

    const finalUser = await User.findById(testUser._id);
    const expectedFinal = balanceBeforeW - 150;
    if (finalUser.virtualPoints !== expectedFinal) {
      throw new Error(`Final balance expected ${expectedFinal}, got ${finalUser.virtualPoints}`);
    }
    console.log(`✓ Withdrawal approved with reference "TX-TELE-PAID-9922"! Final User Balance: ${finalUser.virtualPoints} Birr`);

    console.log('\n====================================================');
    console.log('🎉 ALL CASHIER, BIRR & 5-GAME QUEST TESTS PASSED! 🎉');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ TEST RUN FAILED:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

runPaymentAndWithdrawalTests();
