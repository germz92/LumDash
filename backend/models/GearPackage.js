const mongoose = require('mongoose');

// Define the schema for gear packages
const gearPackageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  userId: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  categories: {
    type: Map,
    of: [Object]
  },
  inventoryIds: [String]
});

// Create and export the model
module.exports = mongoose.model('GearPackage', gearPackageSchema); 