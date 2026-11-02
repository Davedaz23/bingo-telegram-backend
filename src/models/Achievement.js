const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    default: '🏆',
  },
  category: {
    type: String,
    enum: ['gameplay', 'loyalty', 'streaks', 'special'],
    default: 'gameplay',
    index: true,
  },
  pointsReward: {
    type: Number,
    required: true,
    min: 0,
  },
  requirementType: {
    type: String,
    enum: ['games_won', 'games_played', 'streak_days', 'cards_bought', 'single_win_points', 'special'],
    required: true,
  },
  requirementValue: {
    type: Number,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Achievement', achievementSchema);

