const mongoose = require('mongoose');

const changeRequestSchema = new mongoose.Schema({
  tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true, index: true },
  shareToken: { type: String, required: true },
  type: { type: String, enum: ['edit', 'add'], required: true },
  // For edits - reference to existing program entry
  programId: { type: String, default: null },
  programDate: { type: String, default: null },
  // Proposed data
  proposedData: {
    name: { type: String, default: '' },
    date: { type: String, default: '' },
    startTime: { type: String, default: '' },
    endTime: { type: String, default: '' },
    location: { type: String, default: '' },
    photographer: { type: String, default: '' },
    notes: { type: String, default: '' }
  },
  // Original data snapshot (for edits, to show diff)
  originalData: {
    name: { type: String, default: '' },
    date: { type: String, default: '' },
    startTime: { type: String, default: '' },
    endTime: { type: String, default: '' },
    location: { type: String, default: '' },
    photographer: { type: String, default: '' },
    notes: { type: String, default: '' }
  },
  // Meta
  clientName: { type: String, default: 'Client' },
  clientMessage: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('ChangeRequest', changeRequestSchema);
