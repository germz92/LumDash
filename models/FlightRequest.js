const mongoose = require('mongoose');

const flightRequestSchema = new mongoose.Schema({
  passengers: [{
    passengerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    email: String,
    phone: String,
  }],
  from: {
    code: String,
    city: String,
    state: String,
    name: String
  },
  to: {
    code: String,
    city: String,
    state: String,
    name: String
  },
  departDate: Date,
  returnDate: Date,
  departTimePreference: String,
  returnTimePreference: String,
  bookedDetails: {
    airline: String,
    flightNumber: String,
    confirmationCode: String,
    departTime: String,
    arriveTime: String,
    duration: String,
    bookedAt: Date,
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  returnBookedDetails: {
    airline: String,
    flightNumber: String,
    confirmationCode: String,
    departTime: String,
    arriveTime: String,
    duration: String
  },
  tripType: String,
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },
  eventName: String,
  status: String,
  notes: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('FlightRequest', flightRequestSchema, 'flightrequests');
