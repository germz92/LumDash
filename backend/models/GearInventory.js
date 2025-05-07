const mongoose = require('mongoose');

const gearInventorySchema = new mongoose.Schema({
  label: { type: String, required: true, unique: true }, // e.g., "Canon R5 Body #1"
  category: { type: String, required: true }, // e.g., "Camera"
  serial: { 
    type: String,
    required: true, // Make serial required
    sparse: true,
    set: v => v === '' ? 'N/A' : v // Convert empty strings to "N/A" as default value
  },
  status: { type: String, enum: ['available', 'checked_out'], default: 'available' },
  checkedOutBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  checkedOutEvent: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', default: null },
  checkOutDate: Date,
  checkInDate: Date,
  history: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      event: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },
      checkOutDate: Date,
      checkInDate: Date
    }
  ]
});

// Add a pre-save hook to ensure empty serial values are handled correctly
gearInventorySchema.pre('save', function(next) {
  // If serial is an empty string, set it to "N/A"
  if (!this.serial || this.serial === '') {
    this.serial = 'N/A';
  }
  next();
});

module.exports = mongoose.model('GearInventory', gearInventorySchema); 