const mongoose = require('mongoose');

const passengerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: String,
  email: String,
  phone: String,
  dateOfBirth: Date,
  passportNumber: String,
  // Add other passenger fields as needed
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Passenger', passengerSchema, 'passengers');
