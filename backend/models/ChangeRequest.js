const mongoose = require('mongoose');

const changeRequestSchema = new mongoose.Schema({
  tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true, index: true },
  shareToken: { type: String, required: true },
  // 'schedule' (default) or 'shotlist' - which section this request belongs to
  section: { type: String, enum: ['schedule', 'shotlist'], default: 'schedule' },
  type: { type: String, enum: ['edit', 'add'], required: true },
  // For edits - reference to existing program entry
  programId: { type: String, default: null },
  programDate: { type: String, default: null },
  // Proposed data (schedule fields)
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
  // Shotlist-specific fields
  shotlistId: { type: String, default: null }, // Which shotlist this belongs to
  shotlistName: { type: String, default: '' }, // Display name of the shotlist
  itemId: { type: String, default: null }, // For edit requests, the item being edited
  proposedItemData: {
    title: { type: String, default: '' }
  },
  originalItemData: {
    title: { type: String, default: '' }
  },
  // Meta
  clientName: { type: String, default: 'Client' },
  clientMessage: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('ChangeRequest', changeRequestSchema);
