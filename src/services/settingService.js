const Setting = require('../models/Setting');
const { REGISTRATION_BONUS } = require('../config/constants');

const WELCOME_BONUS_KEY = 'welcome_bonus';

async function getWelcomeBonus() {
  const setting = await Setting.findOne({ key: WELCOME_BONUS_KEY });
  if (setting && typeof setting.value === 'number' && setting.value > 0) {
    return setting.value;
  }
  const envVal = parseFloat(process.env.WELCOME_BONUS);
  if (!isNaN(envVal) && envVal > 0) {
    return envVal;
  }
  return REGISTRATION_BONUS;
}

async function setWelcomeBonus(value) {
  const amount = parseFloat(value);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Welcome bonus must be a positive number');
  }
  await Setting.findOneAndUpdate(
    { key: WELCOME_BONUS_KEY },
    { key: WELCOME_BONUS_KEY, value: amount, description: 'Welcome bonus amount for new player registration' },
    { upsert: true, new: true }
  );
  return amount;
}

module.exports = { getWelcomeBonus, setWelcomeBonus, WELCOME_BONUS_KEY };
