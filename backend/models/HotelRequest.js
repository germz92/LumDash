const mongoose = require('mongoose');

// Read-only mirror of LumDash 2.0 hotel stays. strict: false keeps any
// fields this app does not use if a document is ever touched through this model.
const hotelRequestSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', default: null },
  eventName: { type: String, default: '' },
  preferredHotel: { type: String, default: '' },
  checkInDate: Date,
  checkOutDate: Date,
  guests: [{
    passengerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Passenger' },
    name: String
  }],
  status: String,
  bookedDetails: {
    hotelName: { type: String, default: '' },
    confirmationCode: { type: String, default: '' },
    address: { type: String, default: '' }
  }
}, { strict: false, timestamps: true });

module.exports = mongoose.model('HotelRequest', hotelRequestSchema, 'hotelrequests');
