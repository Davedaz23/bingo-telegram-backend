const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    index: true,
  },
  actorType: {
    type: String,
    enum: ['admin', 'moderator', 'system', 'user'],
    default: 'system',
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  targetType: {
    type: String,
    enum: ['user', 'game', 'card', 'settings', 'achievement', 'points', 'system'],
    default: 'system',
  },
  targetId: {
    type: String,
    default: null,
    index: true,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  ipAddress: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

