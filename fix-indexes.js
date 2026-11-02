const mongoose = require('mongoose');

async function fixIndexes() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bingo_telegram');
  const db = mongoose.connection.db;
  const collection = db.collection('users');

  // Drop existing telegramId index
  try {
    await collection.dropIndex('telegramId_1');
    console.log('Dropped telegramId_1 index');
  } catch (e) {
    console.log('Could not drop telegramId_1:', e.message);
  }

  // Drop existing email index if any
  try {
    await collection.dropIndex('email_1');
    console.log('Dropped email_1 index');
  } catch (e) {
    console.log('Could not drop email_1:', e.message);
  }

  await mongoose.disconnect();
  console.log('Done');
}

fixIndexes().catch(e => console.error(e));
