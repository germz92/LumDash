const mongoose = require('mongoose');

const timesheetEntrySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['clock_in', 'clock_out', 'travel'],
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String, // HH:MM format, null for travel entries
    default: null
  },
  notes: {
    type: String,
    default: ''
  },
  // For pairing clock in/out entries
  pairId: {
    type: String,
    default: null
  },
  // For travel entries, store the hours directly
  hours: {
    type: Number,
    default: null
  },
  // Track if this was manually entered
  isManual: {
    type: Boolean,
    default: false
  },
  // UTC timestamp for accurate elapsed time calculation
  // Handles timezone changes (e.g., clock in PT, clock out ET)
  // Null for manual entries where user specifies exact date/time
  utcTimestamp: {
    type: Date,
    default: null
  }
}, { timestamps: true });

const timesheetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // One timesheet per user
  },
  entries: [timesheetEntrySchema]
}, { timestamps: true });

module.exports = mongoose.model('Timesheet', timesheetSchema);
