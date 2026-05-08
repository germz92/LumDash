const mongoose = require('mongoose');

const reimbursementItemSchema = new mongoose.Schema({
  date: Date,
  category: {
    type: String,
    enum: ['meals', 'travel', 'misc'],
    default: 'misc'
  },
  amount: { type: Number, default: 0 },
  notes: String,
  attachmentUrl: String,
  attachmentPublicId: String,
  attachmentName: String
});

const reimbursementRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },
  eventName: { type: String, default: '' },
  description: { type: String, default: '' },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'rejected'],
    default: 'draft'
  },
  dateSubmitted: Date,
  items: [reimbursementItemSchema],
  totalAmount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('ReimbursementRequest', reimbursementRequestSchema, 'reimbursementrequests');
