const SystemSetting = require('../models/SystemSetting');
const { ECONOMY } = require('../config/constants');
const logger = require('../utils/logger');

const WELCOME_BONUS_KEY = 'welcome_bonus';

// In-memory cache for fast hot-path lookups
const settingsCache = new Map();
const CACHE_TTL_MS = 60000;
let lastCacheUpdate = 0;

async function refreshCache() {
  try {
    const settings = await SystemSetting.find();
    settingsCache.clear();
    for (const s of settings) {
      settingsCache.set(s.key, s.value);
    }
    lastCacheUpdate = Date.now();
  } catch (err) {
    logger.warn('Failed to refresh settings cache:', err.message);
  }
}

async function getSetting(key, defaultValue = null) {
  if (Date.now() - lastCacheUpdate > CACHE_TTL_MS) {
    await refreshCache();
  }
  if (settingsCache.has(key)) {
    return settingsCache.get(key);
  }
  const setting = await SystemSetting.findOne({ key });
  if (setting) {
    settingsCache.set(key, setting.value);
    return setting.value;
  }
  return defaultValue;
}

async function setSetting(key, value, category = 'gameplay', description = null, updatedBy = null) {
  const result = await SystemSetting.findOneAndUpdate(
    { key },
    {
      $set: {
        key,
        value,
        category,
        ...(description ? { description } : {}),
        ...(updatedBy ? { updatedBy } : {}),
      },
    },
    { upsert: true, new: true }
  );
  settingsCache.set(key, value);
  return result.value;
}

async function getWelcomeBonus() {
  const cached = await getSetting(WELCOME_BONUS_KEY);
  if (typeof cached === 'number' && cached > 0) return cached;
  const envVal = parseFloat(process.env.WELCOME_BONUS);
  if (!isNaN(envVal) && envVal > 0) return envVal;
  return ECONOMY.WELCOME_BONUS_POINTS;
}

async function setWelcomeBonus(value, adminId = null) {
  const amount = parseFloat(value);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Welcome bonus must be a positive number');
  }
  await setSetting(
    WELCOME_BONUS_KEY,
    amount,
    'economy',
    'Free Virtual Points granted upon player registration',
    adminId
  );
  return amount;
}

async function isMaintenanceMode() {
  return (await getSetting('maintenance_mode', false)) === true;
}

module.exports = {
  getSetting,
  setSetting,
  getWelcomeBonus,
  setWelcomeBonus,
  isMaintenanceMode,
  WELCOME_BONUS_KEY,
};
