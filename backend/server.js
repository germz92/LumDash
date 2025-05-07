const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config();

const app = express();

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.use(express.json());

const User = require('./models/User');
const Table = require('./models/Table');
const GearInventory = require('./models/GearInventory');

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI environment variable is not set!');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

function authenticate(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'No token' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// AUTH
app.post('/api/auth/register', async (req, res) => {
  const { email, password, fullName } = req.body; // 🔥 updated

  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashed, fullName }); // 🔥 updated

  await user.save();
  res.json({ message: 'User created' });
});


app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user._id, fullName: user.fullName }, process.env.JWT_SECRET)  ;
  res.json({ token, fullName: user.fullName });
});

// TABLE ROUTES
app.post('/api/tables', authenticate, async (req, res) => {
  const { title, general } = req.body;

  const table = new Table({
    title,
    owners: [req.user.id],  // ✅ Corrected here
    sharedWith: [],
    rows: [],
    general: {
      client: general?.client || '',
      start: general?.start || '',
      end: general?.end || ''
    },
    gear: {
      lists: {
        Default: {
          Cameras: [],
          Lenses: [],
          Lighting: [],
          Support: [],
          Accessories: []
        }
      }
    }
  });

  await table.save();
  res.json(table);
});


app.get('/api/tables', authenticate, async (req, res) => {
  const tables = await Table.find({
    $or: [
      { owners: req.user.id }, // ✅ use correct field name
      { sharedWith: req.user.id }
    ]
  });
  res.json(tables);
});


app.get('/api/tables/:id', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  res.json(table);
});

app.post('/api/tables/:id/rows', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  table.rows.push(req.body);
  await table.save();
  res.json(table);
});

app.put('/api/tables/:id', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || !table.owners.includes(req.user.id)) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  table.rows = req.body.rows;
  await table.save();
  res.json({ message: 'Table updated' });
});

// NEW ✨ Save card log per event
app.put('/api/tables/:id/cardlog', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  
  try {
    // Use findOneAndUpdate instead of findById + save to avoid version conflicts
    const result = await Table.findOneAndUpdate(
      { 
        _id: req.params.id,
        $or: [
          { owners: req.user.id },
          { sharedWith: req.user.id }
        ]
      },
      { $set: { cardLog: req.body.cardLog || [] } },
      { new: true, runValidators: true }
    );
    
    if (!result) {
      return res.status(403).json({ error: 'Not authorized or not found' });
    }
    
    res.json({ message: 'Card log saved' });
  } catch (err) {
    console.error('Error updating card log:', err);
    res.status(500).json({ error: 'Failed to update card log' });
  }
});

// GENERAL INFO
app.get('/api/tables/:id/general', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  res.json(table.general || {});
});

app.put('/api/tables/:id/general', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }

  console.log('Received general PUT body:', req.body);
  console.log('Current general data in DB:', table.general);

  table.general = {
    ...table.general,  // keep existing data
    ...req.body,
    summary: req.body.summary || req.body.eventSummary || table.general.summary || ''
  };

  console.log('Saving general data to DB:', table.general);

  await table.save();
  res.json({ message: 'General info updated' });
});


//GEAR
// ✅ GET gear checklist(s)
app.get('/api/tables/:id/gear', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  try {
    const table = await Table.findById(req.params.id);
    if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
      return res.status(403).json({ error: 'Not authorized or not found' });
    }

    const lists = table.gear?.lists ? Object.fromEntries(table.gear.lists) : {};
    const checkOutDate = table.gear?.checkOutDate || '';
    const checkInDate = table.gear?.checkInDate || '';
    
    console.log("Sending gear data:", {
      tableId: req.params.id,
      checkOutDate, 
      checkInDate
    });
    
    res.json({ lists, checkOutDate, checkInDate });
  } catch (err) {
    console.error('Error retrieving gear data:', err);
    res.status(500).json({ error: 'Server error while retrieving gear data' });
  }
});

// ✅ PUT (save) gear checklist(s)
app.put('/api/tables/:id/gear', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  try {
    const table = await Table.findById(req.params.id);
    if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
      return res.status(403).json({ error: 'Not authorized or not found' });
    }

    const { lists, checkOutDate, checkInDate } = req.body;

    if (!lists || typeof lists !== 'object') {
      return res.status(400).json({ error: 'Invalid format for gear lists' });
    }

    // ✅ Ensure gear object exists
    if (!table.gear) {
      table.gear = { lists: {} };
    }

    table.gear.lists = lists;
    if (typeof checkOutDate !== 'undefined') table.gear.checkOutDate = checkOutDate;
    if (typeof checkInDate !== 'undefined') table.gear.checkInDate = checkInDate;
    await table.save();

    res.json({ message: 'Gear checklists saved' });
  } catch (err) {
    console.error('Gear save error:', err);
    res.status(500).json({ error: 'Server error while saving gear' });
  }
});



// TRAVEL / ACCOMMODATION
app.get('/api/tables/:id/travel', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  res.json({
    travel: table.travel || [],
    accommodation: table.accommodation || []
  });
});

app.put('/api/tables/:id/travel', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  table.travel = req.body.travel || [];
  table.accommodation = req.body.accommodation || [];
  await table.save();
  res.json({ message: 'Travel and accommodation saved' });
});

// DELETE
app.delete('/api/tables/:id', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || !table.owners.includes(req.user.id)) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  await table.deleteOne();
  res.json({ message: 'Table deleted' });
});

app.delete('/api/tables/:id/rows/:index', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }

  const idx = parseInt(req.params.index);
  if (isNaN(idx) || idx < 0 || idx >= table.rows.length) {
    return res.status(400).json({ error: 'Invalid row index' });
  }

  table.rows.splice(idx, 1);
  await table.save();
  res.json({ message: 'Row deleted' });
});

// USERS
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const users = await User.find({}, 'fullName email').sort({ fullName: 1 }); // 🔥 Corrected
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PROGRAM SCHEDULE
app.get('/api/tables/:id/program-schedule', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  res.json({ programSchedule: table.programSchedule || [] });
});

app.put('/api/tables/:id/program-schedule', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  
  try {
    // Use findOneAndUpdate instead of find + save to avoid version conflicts
    const result = await Table.findOneAndUpdate(
      { 
        _id: req.params.id,
        $or: [
          { owners: req.user.id },
          { sharedWith: req.user.id }
        ]
      },
      { $set: { programSchedule: req.body.programSchedule || [] } },
      { new: true, runValidators: true }
    );
    
    if (!result) {
      return res.status(403).json({ error: 'Not authorized or not found' });
    }
    
    res.json({ message: 'Program schedule updated' });
  } catch (err) {
    console.error('Error updating program schedule:', err);
    res.status(500).json({ error: 'Failed to update program schedule' });
  }
});

// Serve SPA shell and root
app.use(express.static(path.join(__dirname, '../frontend')));


// Serve static frontend assets
app.use('/pages', express.static(path.join(__dirname, '../frontend/pages')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));
app.use('/css', express.static(path.join(__dirname, '../frontend/css')));
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));


// Serve SPA shell and root
app.use(express.static(path.join(__dirname, '../frontend')));

// VERIFY TOKEN
app.get('/api/verify-token', authenticate, (req, res) => {
  res.json({ valid: true, user: req.user });
});


// GEAR INVENTORY API
// List all gear
app.get('/api/gear-inventory', authenticate, async (req, res) => {
  try {
    const gear = await GearInventory.find();
    res.json(gear);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch gear inventory' });
  }
});

// Check out gear
app.post('/api/gear-inventory/checkout', authenticate, async (req, res) => {
  const { gearId, eventId, checkOutDate, checkInDate } = req.body;
  if (!gearId || !eventId || !checkOutDate || !checkInDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  console.log("Checkout request:", { gearId, eventId, checkOutDate, checkInDate });
  
  const gear = await GearInventory.findById(gearId);
  if (!gear) return res.status(404).json({ error: 'Gear not found' });

  // If gear is already checked out to this event, allow updating the dates
  if (gear.status === 'checked_out' && gear.checkedOutEvent && 
      gear.checkedOutEvent.toString() === eventId) {
    console.log("Gear already checked out to this event, updating dates");
    
    // Update the dates
    gear.checkOutDate = checkOutDate;
    gear.checkInDate = checkInDate;
    
    // Update the history entry for this event
    const historyEntry = gear.history.find(
      entry => entry.event && entry.event.toString() === eventId
    );
    
    if (historyEntry) {
      historyEntry.checkOutDate = checkOutDate;
      historyEntry.checkInDate = checkInDate;
    }
    
    await gear.save();
    return res.json({ message: 'Gear reservation updated', gear });
  }

  console.log("Found gear:", { 
    label: gear.label, 
    status: gear.status, 
    checkedOutEvent: gear.checkedOutEvent ? gear.checkedOutEvent.toString() : null,
    checkOutDate: gear.checkOutDate,
    checkInDate: gear.checkInDate,
    historyCount: gear.history?.length || 0
  });

  // Keep date as strings but use helper function for comparison
  const normalizeDate = (dateStr) => {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  };

  // Prevent overlapping reservations
  const reqStart = normalizeDate(checkOutDate);
  const reqEnd = normalizeDate(checkInDate);
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  
  console.log("Normalized dates:", {
    reqStart: reqStart.toISOString(),
    reqEnd: reqEnd.toISOString(),
    now: now.toISOString()
  });
  
  const overlaps = (entry) => {
    if (!entry.checkOutDate || !entry.checkInDate) return false;
    
    // Always compare event IDs as strings
    const entryEventId = entry.event ? entry.event.toString() : null;
    
    // Skip entries for this event
    if (entryEventId === eventId) {
      console.log(`Skipping entry for current event: ${entryEventId}`);
      return false;
    }
    
    const entryStart = normalizeDate(entry.checkOutDate);
    const entryEnd = normalizeDate(entry.checkInDate);
    
    console.log("Checking entry:", {
      event: entryEventId,
      entryStart: entryStart.toISOString(),
      entryEnd: entryEnd.toISOString()
    });
    
    // Only consider reservations that are not fully in the past
    if (entryEnd < now) {
      console.log("Skipping past reservation (end < now)");
      return false;
    }
    
    // Overlap if: (startA <= endB) && (endA >= startB)
    const isOverlap = reqStart <= entryEnd && reqEnd >= entryStart;
    if (isOverlap) {
      console.log("OVERLAP DETECTED!");
    }
    return isOverlap;
  };
  
  if (gear.history && gear.history.some(overlaps)) {
    console.log("Reservation rejected: overlapping dates");
    return res.status(409).json({ error: 'Gear is already reserved for overlapping dates.' });
  }

  // Store dates as strings for UI consistency
  gear.status = 'checked_out';
  gear.checkedOutBy = req.user.id;
  gear.checkedOutEvent = eventId;
  gear.checkOutDate = checkOutDate; // Keep as string
  gear.checkInDate = checkInDate;   // Keep as string
  
  gear.history.push({
    user: req.user.id,
    event: eventId,
    checkOutDate: checkOutDate, // Keep as string
    checkInDate: checkInDate    // Keep as string
  });
  
  await gear.save();
  console.log("Reservation successful");
  res.json({ message: 'Gear checked out', gear });
});

// Check in gear
app.post('/api/gear-inventory/checkin', authenticate, async (req, res) => {
  const { gearId, eventId, checkOutDate, checkInDate } = req.body;
  if (!gearId) return res.status(400).json({ error: 'Missing gearId' });
  const gear = await GearInventory.findById(gearId);
  if (!gear) return res.status(404).json({ error: 'Gear not found' });

  gear.status = 'available';
  gear.checkedOutBy = null;
  gear.checkedOutEvent = null;
  gear.checkOutDate = null;
  gear.checkInDate = null;

  // Remove reservation from history if eventId and dates are provided
  if (eventId && checkOutDate && checkInDate) {
    // Keep dates as strings but use Date objects for comparison
    const normalizeDate = (dateStr) => {
      const date = new Date(dateStr);
      date.setUTCHours(0, 0, 0, 0);
      return date;
    };
    
    const requestOutDate = normalizeDate(checkOutDate);
    const requestInDate = normalizeDate(checkInDate);
    
    gear.history = gear.history.filter(entry => {
      // Skip entries without required data
      if (!entry.event || !entry.checkOutDate || !entry.checkInDate) return true;
      
      // Check if event matches
      const eventMatches = entry.event.toString() === eventId;
      if (!eventMatches) return true;
      
      // Check if dates match (by comparing just the date parts, not time)
      const entryOutDate = normalizeDate(entry.checkOutDate);
      const entryInDate = normalizeDate(entry.checkInDate);
      
      const datesMatch = 
        entryOutDate.getUTCFullYear() === requestOutDate.getUTCFullYear() &&
        entryOutDate.getUTCMonth() === requestOutDate.getUTCMonth() &&
        entryOutDate.getUTCDate() === requestOutDate.getUTCDate() &&
        entryInDate.getUTCFullYear() === requestInDate.getUTCFullYear() &&
        entryInDate.getUTCMonth() === requestInDate.getUTCMonth() &&
        entryInDate.getUTCDate() === requestInDate.getUTCDate();
      
      // Keep entries that don't match our criteria
      return !eventMatches || !datesMatch;
    });
  }

  await gear.save();
  res.json({ message: 'Gear checked in', gear });
});

// Add new gear to inventory
app.post('/api/gear-inventory', authenticate, async (req, res) => {
  const { label, category, serial } = req.body;
  if (!label || !category) {
    return res.status(400).json({ error: 'Label and category are required' });
  }
  try {
    // Convert empty strings to "N/A"
    const serialValue = serial && typeof serial === 'string' && serial.trim() !== '' ? serial.trim() : 'N/A';
    
    // Check for duplicate serial (all serials must be unique now)
    const existingWithSerial = await GearInventory.findOne({ serial: serialValue });
    if (existingWithSerial) {
      return res.status(409).json({ 
        error: `Duplicate serial: this value already exists.`
      });
    }
    
    // Check for duplicate label (always required)
    const existingWithLabel = await GearInventory.findOne({ label: label.trim() });
    if (existingWithLabel) {
      return res.status(409).json({ 
        error: `Duplicate label: this value already exists.`
      });
    }
    
    const gear = new GearInventory({ 
      label, 
      category, 
      serial: serialValue 
    });
    await gear.save();
    res.json({ message: 'Gear added', gear });
  } catch (err) {
    console.error('Error adding gear:', err);
    res.status(500).json({ error: 'Failed to add gear: ' + err.message });
  }
});

// Delete gear from inventory
app.delete('/api/gear-inventory/:id', authenticate, async (req, res) => {
  try {
    const gearId = req.params.id;
    if (!gearId) return res.status(400).json({ error: 'Missing gear ID' });
    
    const gear = await GearInventory.findById(gearId);
    if (!gear) return res.status(404).json({ error: 'Gear not found' });
    
    // Don't allow deletion of checked out gear
    if (gear.status === 'checked_out') {
      return res.status(400).json({ error: 'Cannot delete gear that is currently checked out' });
    }
    
    await gear.deleteOne();
    res.json({ message: 'Gear deleted successfully' });
  } catch (err) {
    console.error('Error deleting gear:', err);
    res.status(500).json({ error: 'Failed to delete gear' });
  }
});

// Edit gear in inventory 
app.put('/api/gear-inventory/:id', authenticate, async (req, res) => {
  try {
    const gearId = req.params.id;
    const { label, category, serial } = req.body;
    
    if (!gearId) return res.status(400).json({ error: 'Missing gear ID' });
    if (!label || !category) return res.status(400).json({ error: 'Label and category are required' });
    
    const gear = await GearInventory.findById(gearId);
    if (!gear) return res.status(404).json({ error: 'Gear not found' });
    
    // Don't allow editing of checked out gear
    if (gear.status === 'checked_out') {
      return res.status(400).json({ error: 'Cannot edit gear that is currently checked out' });
    }
    
    // Convert empty strings to "N/A"
    const serialValue = serial && typeof serial === 'string' && serial.trim() !== '' ? serial.trim() : 'N/A';
    
    // Check for duplicate serial when changed
    if (serialValue !== gear.serial) {
      const existingWithSerial = await GearInventory.findOne({ 
        serial: serialValue,
        _id: { $ne: gearId } // Exclude current gear
      });
      if (existingWithSerial) {
        return res.status(409).json({ 
          error: `Duplicate serial: this value already exists.`
        });
      }
    }
    
    // Check for duplicate label when changed
    if (label !== gear.label) {
      const existingWithLabel = await GearInventory.findOne({ 
        label: label.trim(),
        _id: { $ne: gearId } // Exclude current gear
      });
      if (existingWithLabel) {
        return res.status(409).json({ 
          error: `Duplicate label: this value already exists.`
        });
      }
    }
    
    gear.label = label;
    gear.category = category;
    gear.serial = serialValue;
    
    await gear.save();
    res.json({ message: 'Gear updated successfully', gear });
  } catch (err) {
    console.error('Error updating gear:', err);
    res.status(500).json({ error: 'Failed to update gear: ' + err.message });
  }
});

// Repair gear inventory data
app.post('/api/gear-inventory/repair', authenticate, async (req, res) => {
  try {
    console.log("Starting gear inventory repair...");
    
    // Get all gear
    const allGear = await GearInventory.find();
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    
    const repairResults = [];
    
    for (const gear of allGear) {
      const originalHistoryCount = gear.history.length;
      let modified = false;
      
      // Repair 1: Remove any history entries with missing event IDs
      gear.history = gear.history.filter(entry => {
        if (!entry.event) {
          console.log(`Removing history entry without event ID from ${gear.label}`);
          modified = true;
          return false;
        }
        return true;
      });
      
      // Repair 2: Remove duplicate history entries for the same event
      const seenEvents = new Map();
      gear.history = gear.history.filter(entry => {
        const eventId = entry.event.toString();
        
        if (seenEvents.has(eventId)) {
          console.log(`Removing duplicate history entry for event ${eventId} from ${gear.label}`);
          modified = true;
          return false;
        }
        
        seenEvents.set(eventId, true);
        return true;
      });
      
      // Repair 3: Ensure gear status is correct
      if (gear.status === 'checked_out') {
        // If no checkedOutEvent but status is checked_out, fix it
        if (!gear.checkedOutEvent) {
          console.log(`Fixing gear ${gear.label} with checked_out status but no event`);
          gear.status = 'available';
          gear.checkOutDate = null;
          gear.checkInDate = null;
          modified = true;
        }
        // If gear is checked out but the check-in date is in the past, fix it
        else if (gear.checkInDate) {
          const checkInDate = new Date(gear.checkInDate);
          checkInDate.setUTCHours(0, 0, 0, 0);
          
          if (checkInDate < now) {
            console.log(`Auto-checking in gear ${gear.label} with past check-in date`);
            gear.status = 'available';
            gear.checkedOutEvent = null;
            gear.checkedOutBy = null;
            gear.checkOutDate = null;
            gear.checkInDate = null;
            modified = true;
          }
        }
      }
      
      if (modified) {
        await gear.save();
        repairResults.push({
          label: gear.label,
          historyBefore: originalHistoryCount,
          historyAfter: gear.history.length,
          statusChanged: modified,
          newStatus: gear.status
        });
      }
    }
    
    console.log("Repair complete:", repairResults);
    
    res.json({
      message: 'Repair complete',
      itemsRepaired: repairResults.length,
      details: repairResults
    });
  } catch (err) {
    console.error("Error during repair:", err);
    res.status(500).json({ error: 'Repair failed: ' + err.message });
  }
});

// Catch-all for SPA routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, '../frontend', 'dashboard.html'));
});


// MAKE OWNER
app.post('/api/tables/:id/share', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const { email, makeOwner } = req.body;
  const tableId = req.params.id;

  try {
    const userToShare = await User.findOne({ email: email.toLowerCase().trim() });
    if (!userToShare) return res.status(404).json({ error: 'User not found' });

    const table = await Table.findById(tableId);
    if (!table) return res.status(404).json({ error: 'Table not found' });

    const ownerIds = table.owners.map(id => id.toString());
    const targetId = userToShare._id.toString();

    if (!ownerIds.includes(req.user.id)) {
      return res.status(403).json({ error: 'Only an owner can share this table' });
    }

    if (makeOwner) {
      if (!ownerIds.includes(targetId)) {
        table.owners.push(userToShare._id);
      }
    } else {
      if (!table.sharedWith.map(id => id.toString()).includes(targetId)) {
        table.sharedWith.push(userToShare._id);
      }
    }

    await table.save();
    res.json({ message: makeOwner ? 'Ownership granted' : 'User added to table' });
  } catch (err) {
    console.error('Error sharing table:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/tables/:id/rows-by-id/:rowId', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }

  const rowId = req.params.rowId;
  const originalLength = table.rows.length;

  table.rows = table.rows.filter(row => row._id?.toString() !== rowId);

  if (table.rows.length === originalLength) {
    return res.status(404).json({ error: 'Row not found' });
  }

  await table.save();
  res.json({ message: 'Row deleted' });
});

app.put('/api/tables/:id/reorder-rows', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || !table.owners.includes(req.user.id)) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Replace with reordered list
  table.rows = req.body.rows;
  await table.save();
  res.json({ message: 'Row order saved' });
});

app.put('/api/tables/:id/rows/:rowId', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const { id, rowId } = req.params;
  const updatedRow = req.body;

  const table = await Table.findById(id);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const rowIndex = table.rows.findIndex(row => row._id.toString() === rowId);
  if (rowIndex === -1) {
    return res.status(400).json({ error: 'Invalid row index' });
  }

  table.rows[rowIndex] = { ...table.rows[rowIndex]._doc, ...updatedRow };
  await table.save();

  res.json({ success: true });
});

// SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server started on port ${PORT}`));
