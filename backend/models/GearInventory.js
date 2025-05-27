const mongoose = require('mongoose');

// Serial numbers must be unique for all gear inventory items. This is enforced by a unique index in the schema.
const gearInventorySchema = new mongoose.Schema({
  label: { type: String, required: true, unique: true }, // e.g., "Canon R5 Body #1"
  category: { type: String, required: true }, // e.g., "Camera"
  serial: { 
    type: String,
    required: true, // Make serial required
    unique: true, // Enforce uniqueness
    sparse: true,
    set: v => v === '' ? 'N/A' : v // Convert empty strings to "N/A" as default value
  },
  // NEW: Quantity support for items like batteries
  quantity: { 
    type: Number, 
    default: 1, // Default to 1 for backward compatibility
    min: 1 
  },
  // NEW: Track reservations for quantity items
  reservations: [{
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    quantity: { type: Number, required: true },
    checkOutDate: Date,
    checkInDate: Date,
    createdAt: { type: Date, default: Date.now }
  }],
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
      checkInDate: Date,
      // NEW: Track quantity in history for quantity items
      quantity: { type: Number, default: 1 }
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

// NEW: Method to get available quantity for given dates
gearInventorySchema.methods.getAvailableQuantity = function(checkOutDate, checkInDate) {
  if (this.quantity === 1) {
    // For single items, use existing logic
    return this.status === 'available' ? 1 : 0;
  }
  
  // For quantity items, calculate available quantity
  const normalizeDate = (dateStr) => {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  };
  
  const reqStart = normalizeDate(checkOutDate);
  const reqEnd = normalizeDate(checkInDate);
  
  let reservedQuantity = 0;
  
  // Check current reservations for overlaps
  this.reservations.forEach(reservation => {
    const resStart = normalizeDate(reservation.checkOutDate);
    const resEnd = normalizeDate(reservation.checkInDate);
    
    // Check for overlap: (startA <= endB) && (endA >= startB)
    if (reqStart <= resEnd && reqEnd >= resStart) {
      reservedQuantity += reservation.quantity;
    }
  });
  
  return Math.max(0, this.quantity - reservedQuantity);
};

// NEW: Method to reserve quantity
gearInventorySchema.methods.reserveQuantity = function(eventId, userId, quantity, checkOutDate, checkInDate) {
  const availableQty = this.getAvailableQuantity(checkOutDate, checkInDate);
  
  if (quantity > availableQty) {
    throw new Error(`Only ${availableQty} units available for the requested dates`);
  }
  
  // Add reservation
  this.reservations.push({
    eventId,
    userId,
    quantity,
    checkOutDate,
    checkInDate
  });
  
  // Add to history
  this.history.push({
    user: userId,
    event: eventId,
    checkOutDate,
    checkInDate,
    quantity
  });
  
  // Update status if this is a single-quantity item
  if (this.quantity === 1) {
    this.status = 'checked_out';
    this.checkedOutBy = userId;
    this.checkedOutEvent = eventId;
    this.checkOutDate = checkOutDate;
    this.checkInDate = checkInDate;
  }
};

// NEW: Method to release quantity reservation
gearInventorySchema.methods.releaseQuantity = function(eventId, checkOutDate, checkInDate, quantityToRelease = null) {
  console.log(`[RELEASE DEBUG] Called with:`, { eventId, checkOutDate, checkInDate, quantityToRelease });
  const normalizeDate = (dateStr) => {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  };
  const reqStart = normalizeDate(checkOutDate);
  const reqEnd = normalizeDate(checkInDate);

  // Overlap function
  const rangesOverlap = (startA, endA, startB, endB) => (startA <= endB && endA >= startB);

  if (quantityToRelease === null || quantityToRelease === undefined) {
    // Release ALL reservations for this event and overlapping dates
    const originalCount = this.reservations.length;
    this.reservations = this.reservations.filter(reservation => {
      if (reservation.eventId.toString() !== eventId.toString()) return true;
      const resStart = normalizeDate(reservation.checkOutDate);
      const resEnd = normalizeDate(reservation.checkInDate);
      // Remove if date ranges overlap
      const shouldRemove = rangesOverlap(resStart, resEnd, reqStart, reqEnd);
      return !shouldRemove;
    });
    console.log(`[RELEASE DEBUG] Release ALL: removed ${originalCount - this.reservations.length} reservations`);
  } else {
    // Release specific quantity for this event and overlapping dates
    let remainingToRelease = quantityToRelease;
    const originalCount = this.reservations.length;
    const newReservations = [];
    for (const reservation of this.reservations) {
      if (reservation.eventId.toString() !== eventId.toString() || remainingToRelease <= 0) {
        newReservations.push(reservation);
        continue;
      }
      const resStart = normalizeDate(reservation.checkOutDate);
      const resEnd = normalizeDate(reservation.checkInDate);
      // Use overlap logic
      if (rangesOverlap(resStart, resEnd, reqStart, reqEnd)) {
        if (reservation.quantity <= remainingToRelease) {
          remainingToRelease -= reservation.quantity;
        } else {
          const modifiedReservation = { ...reservation.toObject() };
          modifiedReservation.quantity = reservation.quantity - remainingToRelease;
          remainingToRelease = 0;
          newReservations.push(modifiedReservation);
        }
      } else {
        newReservations.push(reservation);
      }
    }
    this.reservations = newReservations;
    console.log(`[RELEASE DEBUG] Release SPECIFIC: processed ${originalCount - this.reservations.length} reservations, ${remainingToRelease} units still to release`);
  }

  // Update status for single-quantity items
  if (this.quantity === 1) {
    this.status = 'available';
    this.checkedOutBy = null;
    this.checkedOutEvent = null;
    this.checkOutDate = null;
    this.checkInDate = null;
  }
};

module.exports = mongoose.model('GearInventory', gearInventorySchema); 