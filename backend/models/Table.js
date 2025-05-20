const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  label: String,
  checked: Boolean
}, { _id: false });

// Updated gear category schema to support the new structure
const gearCategorySchema = new mongoose.Schema({
  Cameras: [itemSchema],
  Lenses: [itemSchema],
  Lighting: [itemSchema],
  Support: [itemSchema],
  Accessories: [itemSchema]
}, { _id: false });

// New gear list schema with metadata
const gearListSchema = new mongoose.Schema({
  meta: {
    description: String,
    created: Date
  },
  categories: gearCategorySchema
}, { _id: false });

const programSchema = new mongoose.Schema({
  date: String,
  name: String,
  startTime: String,
  endTime: String,
  location: String,
  photographer: String,
  notes: String,
  done: { type: Boolean, default: false }
}, { _id: false });

// ✅ NEW: Separate crew row schema with ObjectId _id
const crewRowSchema = new mongoose.Schema({
  date: String,
  role: String,
  name: String,
  startTime: String,
  endTime: String,
  totalHours: Number,
  notes: String
}, { _id: true }); // ✅ Adds _id to each row for bulletproof tracking

const tableSchema = new mongoose.Schema({
  title: String,
  owners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  leads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Per-event leads
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // ✅ Updated to use schema with _id
  rows: [crewRowSchema],
  
  general: {
    location: String,
    weather: String,
    start: String,
    end: String,
    client: String,
    attendees: Number,
    budget: String,
    summary: { type: String, default: "" },
    contacts: [
      {
        name: String,
        number: String,
        email: String,
        role: String
      }
    ],
    locations: [
      {
        name: String,
        address: String,
        event: String
      }
    ]
  },
  gear: {
    lists: {
      type: Map,
      of: gearListSchema, // Updated to use the new schema with metadata
      default: {}
    },
    checkOutDate: String,
    checkInDate: String
  },
  travel: [
    {
      date: String,
      time: String,
      airline: String,
      name: String,
      ref: String
    }
  ],
  accommodation: [
    {
      checkin: String,
      checkout: String,
      hotel: String,
      name: String,
      ref: String
    }
  ],
  cardLog: [
    {
      date: String,
      entries: [
        {
          camera: String,
          card1: String,
          card2: String,
          user: String
        }
      ]
    }
  ],
  programSchedule: {
    type: [programSchema],
    default: []
  },
  archived: { type: Boolean, default: false },
  // Admin-only notes for this event/table
  adminNotes: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
      title: { type: String, required: true },
      date: { type: String, required: true }, // ISO date string
      content: { type: String, default: '' }
    }
  ],
  // Crew cost calculator rates
  crewRates: { type: Object, default: {} }
}, { timestamps: true });

// Add utility methods for date handling if needed
tableSchema.methods.getFormattedDate = function(dateStr) {
  if (!dateStr) return null;
  // Parse string to Date with timezone handling
  const date = new Date(dateStr);
  return date;
};

// Helper method to check if gear dates overlap
tableSchema.methods.doGearDatesOverlap = function(startDateStr1, endDateStr1, startDateStr2, endDateStr2) {
  // Create dates at midnight for accurate day comparison
  const normalizeDate = (dateStr) => {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  };
  
  const start1 = normalizeDate(startDateStr1);
  const end1 = normalizeDate(endDateStr1);
  const start2 = normalizeDate(startDateStr2);
  const end2 = normalizeDate(endDateStr2);
  
  // Overlap if: (startA <= endB) && (endA >= startB)
  return start1 <= end2 && end1 >= start2;
};

module.exports = mongoose.model('Table', tableSchema);
