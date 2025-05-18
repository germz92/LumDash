const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
console.log('SENDGRID_API_KEY loaded:', !!process.env.SENDGRID_API_KEY);
console.log('SENDGRID_FROM_EMAIL:', process.env.SENDGRID_FROM_EMAIL);
console.log('APP_URL:', process.env.APP_URL);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || ['https://www.lumdash.app', 'https://spa-lumdash-backend.onrender.com', 'https://germainedavid.github.io'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true
  }
});

io.on('connection', (socket) => {
  console.log('Socket.IO: Client connected');
});

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || ['https://www.lumdash.app', 'https://spa-lumdash-backend.onrender.com', 'https://germainedavid.github.io'],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.use(express.json());

// Helper function to notify clients about data changes
function notifyDataChange(eventType, additionalData = null, tableId = null) {
  console.log(`📢 Emitting ${eventType} event for tableId: ${tableId || 'all'}`);
  // Always include the tableId in the event data to help clients filter relevant events
  const eventData = tableId 
    ? { ...(additionalData || {}), tableId } 
    : additionalData;
    
  if (eventData) {
    io.emit(eventType, eventData);
  } else {
    io.emit(eventType, tableId ? { tableId } : {});
  }
}

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
  const { email, password, fullName, role } = req.body; // 🔥 updated

  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashed, fullName, role: role || 'user' }); // 🔥 updated

  await user.save();
  io.emit('usersChanged'); // Notify all clients
  res.json({ message: 'User created' });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user._id, fullName: user.fullName, role: user.role }, process.env.JWT_SECRET);
  res.json({ token, fullName: user.fullName, role: user.role });
});

// Forgot Password Endpoint
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    // For security, always respond with success
    return res.json({ message: 'If that email is registered, a reset link has been sent.' });
  }
  const token = require('crypto').randomBytes(32).toString('hex');
  user.resetPasswordToken = token;
  user.resetPasswordExpires = Date.now() + 1000 * 60 * 60; // 1 hour
  await user.save();

  const resetUrl = `${process.env.APP_URL}/reset-password.html?token=${token}`;
  const msg = {
    to: user.email,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: 'Password Reset Request',
    html: `<p>You requested a password reset for your LumDash account.</p>
           <p><a href="${resetUrl}">Click here to reset your password</a></p>
           <p>If you did not request this, you can ignore this email.</p>`
  };
  try {
    await sgMail.send(msg);
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('SendGrid error:', err);
    res.status(500).json({ error: 'Failed to send reset email.' });
  }
});

// Reset Password Endpoint
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() }
  });
  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired token.' });
  }
  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  res.json({ message: 'Password has been reset.' });
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

// --- ADMIN NOTES ENDPOINTS (MULTI-NOTE) ---
// Get all admin notes for a table (owners only)
app.get('/api/tables/:id/admin-notes', authenticate, async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  if (!table.owners.map(String).includes(req.user.id)) {
    return res.status(403).json({ error: 'Only owners can view admin notes' });
  }
  res.json({ adminNotes: table.adminNotes || [] });
});

// Add a new admin note (owners only)
app.post('/api/tables/:id/admin-notes', authenticate, async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  if (!table.owners.map(String).includes(req.user.id)) {
    return res.status(403).json({ error: 'Only owners can add admin notes' });
  }
  const { title, content, date } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  let noteDate = date;
  if (!noteDate) {
    const now = new Date();
    noteDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
  }
  const note = {
    title,
    content: content || '',
    date: noteDate
  };
  table.adminNotes.push(note);
  await table.save();
  res.json({ adminNotes: table.adminNotes });
});

// Edit an admin note (owners only)
app.put('/api/tables/:id/admin-notes/:noteId', authenticate, async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  if (!table.owners.map(String).includes(req.user.id)) {
    return res.status(403).json({ error: 'Only owners can edit admin notes' });
  }
  const note = table.adminNotes.id(req.params.noteId);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  note.title = req.body.title || note.title;
  note.content = req.body.content || note.content;
  await table.save();
  res.json({ adminNotes: table.adminNotes });
});

// Delete an admin note (owners only)
app.delete('/api/tables/:id/admin-notes/:noteId', authenticate, async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  if (!table.owners.map(String).includes(req.user.id)) {
    return res.status(403).json({ error: 'Only owners can delete admin notes' });
  }
  table.adminNotes = table.adminNotes.filter(n => n._id.toString() !== req.params.noteId);
  await table.save();
  res.json({ adminNotes: table.adminNotes });
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
  
  io.emit('crewChanged'); // Notify about crew change
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
  
  notifyDataChange('crewChanged', null, req.params.id); // Notify about crew change with tableId
  notifyDataChange('tableUpdated', null, req.params.id); // Also notify about general table update with tableId
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

  notifyDataChange('cardsChanged', null, req.params.id); // Notify about card changes with tableId
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
  
  notifyDataChange('generalChanged', null, req.params.id); // Notify about general info changes with tableId
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

    // Extract gear data
    const lists = table.gear?.lists ? Object.fromEntries(table.gear.lists) : {};
    const checkOutDate = table.gear?.checkOutDate || '';
    const checkInDate = table.gear?.checkInDate || '';
    
    console.log("Sending gear data:", {
      tableId: req.params.id,
      checkOutDate, 
      checkInDate,
      listsCount: Object.keys(lists).length
    });
    
    res.json({ lists, checkOutDate, checkInDate });
  } catch (err) {
    console.error('Error getting gear:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ UPDATE gear checklist
app.put('/api/tables/:id/gear', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
    }
  try {
    // Find and update in one atomic operation (fixes versioning issues)
    const result = await Table.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [
          { owners: req.user.id },
          { sharedWith: req.user.id }
        ]
      },
      {
        $set: {
          'gear.lists': req.body.lists ? new Map(Object.entries(req.body.lists)) : new Map(),
          'gear.checkOutDate': req.body.checkOutDate || '',
          'gear.checkInDate': req.body.checkInDate || ''
        }
      },
      { new: true, runValidators: true }
    );

    if (!result) {
      return res.status(403).json({ error: 'Not authorized or not found' });
    }

    console.log("Updated gear for table:", req.params.id);
    console.log("Lists count:", result.gear?.lists ? result.gear.lists.size : 0);
    
    notifyDataChange('gearChanged', null, req.params.id); // Notify about gear changes with tableId
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error updating gear:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
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
  
  notifyDataChange('travelChanged', null, req.params.id); // Notify about travel/accommodation changes with tableId
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
  
  io.emit('crewChanged'); // Notify about crew change
  res.json({ message: 'Row deleted' });
});

// USERS (all authenticated users can view)
app.get('/api/users', authenticate, async (req, res) => {
  const users = await User.find({}, 'fullName email role').sort({ fullName: 1 });
  res.json(users.map(u => ({
    _id: u._id,
    name: u.fullName,
    email: u.email,
    role: u.role || 'user'
  })));
});

app.put('/api/users/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
  const { name, email, role } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.fullName = name;
  user.email = email;
  if (role) user.role = role;
  await user.save();
  io.emit('usersChanged'); // Notify all clients
  res.json({ message: 'User updated' });
});

app.delete('/api/users/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  io.emit('usersChanged'); // Notify all clients
  res.json({ message: 'User deleted' });
});

app.post('/api/users/:id/reset-password', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.password = await bcrypt.hash(password, 10);
  await user.save();
  io.emit('usersChanged'); // Notify all clients
  res.json({ message: 'Password reset' });
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
    
  notifyDataChange('scheduleChanged', null, req.params.id); // Notify clients of schedule change with tableId
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

    // Get the current user (sharing the event)
    const currentUser = await User.findById(req.user.id);
    const sharerName = currentUser ? (currentUser.name || currentUser.fullName || currentUser.email) : 'An owner';

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

    // Send email notification to the user
    try {
      const appUrl = process.env.APP_URL || 'https://lumdash.com';
      const eventUrl = `https://www.lumdash.app/dashboard.html#events`;
      
      const msg = {
        to: userToShare.email,
        from: process.env.SENDGRID_FROM_EMAIL,
        subject: makeOwner ? `You're now an owner of "${table.title}"` : `Event shared with you: "${table.title}"`,
        html: `
          <p>Hello ${userToShare.name || userToShare.fullName || 'there'},</p>
          <p>${sharerName} has ${makeOwner ? 'made you an owner of' : 'shared'} the event "${table.title}" with you.</p>
          <p>You can now access this event from your LumDash dashboard.</p>
          <p><a href="${eventUrl}" style="padding: 10px 15px; background-color: #CC0007; color: white; text-decoration: none; border-radius: 5px;">View Event</a></p>
          <p>If you have any questions, please contact the event owner directly.</p>
          <p>Thank you,<br>LumDash Team</p>
        `
      };
      
      await sgMail.send(msg);
      console.log(`Email notification sent to ${userToShare.email} for event ${table.title}`);
    } catch (emailErr) {
      // Log the error but don't fail the sharing process
      console.error('Failed to send email notification:', emailErr);
    }
    
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
  
  notifyDataChange('crewChanged', null, req.params.id); // Notify about crew change with tableId
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
  
  notifyDataChange('crewChanged', null, req.params.id); // Notify about crew change with tableId
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

  notifyDataChange('crewChanged', null, id); // Notify about crew change with tableId
  res.json({ success: true });
});

// PATCH endpoint to archive/unarchive an event
debugger;
app.patch('/api/tables/:id/archive', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || !table.owners.includes(req.user.id)) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  if (typeof req.body.archived !== 'boolean') {
    return res.status(400).json({ error: 'archived field must be boolean' });
  }
  table.archived = req.body.archived;
  await table.save();
  res.json({ message: `Event ${req.body.archived ? 'archived' : 'unarchived'}` });
});

// PATCH /api/tables/:id (partial update, e.g. crewRates)
app.patch('/api/tables/:id', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || !table.owners.includes(req.user.id)) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  try {
    const update = req.body;
    const updated = await Table.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SERVER
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server started on port ${PORT}`));
