const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findById('6a6f9bdb3f220bb26791806e');
  console.log('User found:', !!user);
  if (user) {
    console.log('User data:', {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      isActive: user.isActive
    });
  }
  await mongoose.disconnect();
}

check().catch(e => console.error(e));
