const mongoose = require('mongoose');

const inviteSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  fullName: { type: String, required: true, trim: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  token: { type: String, required: true, unique: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date, default: null }
}, { timestamps: true });

inviteSchema.index({ email: 1, acceptedAt: 1 });

module.exports = mongoose.model('Invite', inviteSchema);
