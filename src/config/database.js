const mongoose = require('mongoose');
const logger = require('../utils/logger');

const FALLBACK_DIRECT_URI = 'mongodb://David:David@ac-yh860kf-shard-00-00.tfulgl0.mongodb.net:27017,ac-yh860kf-shard-00-01.tfulgl0.mongodb.net:27017,ac-yh860kf-shard-00-02.tfulgl0.mongodb.net:27017/defar-bingo?ssl=true&authSource=admin&retryWrites=true&w=majority';

const connectDB = async () => {
  const options = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  };

  const primaryUri = process.env.MONGODB_URI;

  try {
    const conn = await mongoose.connect(primaryUri, options);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting reconnect...');
    });

    return conn;
  } catch (error) {
    // If SRV lookup timed out or failed, try direct replica set URI
    if (primaryUri && primaryUri.startsWith('mongodb+srv://') && FALLBACK_DIRECT_URI) {
      logger.warn(`Primary SRV connection failed (${error.message}). Retrying with direct replica set hosts...`);
      try {
        const conn = await mongoose.connect(FALLBACK_DIRECT_URI, options);
        logger.info(`MongoDB Connected via direct replica set: ${conn.connection.host}`);
        return conn;
      } catch (fallbackError) {
        logger.error('Fallback direct MongoDB connection failed:', fallbackError.message);
        throw fallbackError;
      }
    }
    logger.error('MongoDB connection failed:', error.message);
    throw error;
  }
};

module.exports = connectDB;
