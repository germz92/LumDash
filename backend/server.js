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
  origin: function(origin, callback) {
    // Allow any origin
    callback(null, true);
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['rndr-id']
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
const GearPackage = require('./models/GearPackage');
const FolderLog = require('./models/FolderLog');

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
  
  // Notify clients about the new table
  notifyDataChange('tableCreated', { tableId: table._id });
  
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

// --- TASKS ENDPOINTS (COLLABORATIVE TO-DO LIST) ---
app.get('/api/tables/:id/tasks', authenticate, async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  if (!table.owners.map(String).includes(req.user.id) && !table.sharedWith.map(String).includes(req.user.id)) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  res.json({ tasks: table.tasks || [] });
});

app.post('/api/tables/:id/tasks', authenticate, async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  if (!table.owners.map(String).includes(req.user.id)) {
    return res.status(403).json({ error: 'Only owners can add tasks' });
  }
  const { title, deadline } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const task = {
    title,
    deadline: deadline || '',
    completed: false,
    createdBy: req.user.id
  };
  table.tasks.push(task);
  await table.save();
  const newTask = table.tasks[table.tasks.length - 1];
  notifyDataChange('taskAdded', { task: newTask }, req.params.id);
  res.json({ task: newTask });
});

app.put('/api/tables/:id/tasks/:taskId', authenticate, async (req, res) => {
  const table = await Table.findById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  if (!table.owners.map(String).includes(req.user.id)) {
    return res.status(403).json({ error: 'Only owners can edit tasks' });
  }
  const task = table.tasks.id(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (typeof req.body.title === 'string') task.title = req.body.title;
  if (typeof req.body.deadline === 'string') task.deadline = req.body.deadline;
  if (typeof req.body.completed === 'boolean') task.completed = req.body.completed;
  await table.save();
  notifyDataChange('taskUpdated', { task }, req.params.id);
  res.json({ task });
});

app.delete('/api/tables/:id/tasks/:taskId', authenticate, async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table) return res.status(404).json({ error: 'Table not found' });
    if (!table.owners.map(String).includes(req.user.id)) {
      return res.status(403).json({ error: 'Only owners can delete tasks' });
    }
    const taskIndex = table.tasks.findIndex(t => t._id && t._id.toString() === req.params.taskId);
    if (taskIndex === -1) {
      console.error(`Task not found: ${req.params.taskId} in table ${req.params.id}`);
      return res.status(404).json({ error: 'Task not found' });
    }
    table.tasks.splice(taskIndex, 1);
    await table.save();
    notifyDataChange('taskDeleted', { taskId: req.params.taskId }, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Server error while deleting task' });
  }
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
  
  // Notify about notes change with tableId
  notifyDataChange('notesChanged', null, req.params.id);
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
  
  // Notify about notes change with tableId
  notifyDataChange('notesChanged', null, req.params.id);
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
  
  // Notify about notes change with tableId
  notifyDataChange('notesChanged', null, req.params.id);
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
    // Get the old card log for diffing
    const oldTable = await Table.findById(req.params.id);
    const oldCardLog = oldTable ? (oldTable.cardLog || []) : [];
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
    // --- Partial update events for card log ---
    const newCardLog = req.body.cardLog || [];
    // Build maps for fast lookup
    const oldMap = new Map(oldCardLog.map(e => [e._id?.toString?.(), e]));
    const newMap = new Map(newCardLog.map(e => [e._id?.toString?.(), e]));
    // Added
    for (const e of newCardLog) {
      if (!oldMap.has(e._id?.toString?.())) {
        notifyDataChange('cardLogAdded', { cardLog: e }, req.params.id);
      }
    }
    // Updated
    for (const e of newCardLog) {
      const old = oldMap.get(e._id?.toString?.());
      if (old && JSON.stringify(e) !== JSON.stringify(old)) {
        notifyDataChange('cardLogUpdated', { cardLog: e }, req.params.id);
      }
    }
    // Deleted
    for (const e of oldCardLog) {
      if (!newMap.has(e._id?.toString?.())) {
        notifyDataChange('cardLogDeleted', { cardLog: e }, req.params.id);
      }
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
  const { title, general } = req.body;
  const table = await Table.findById(req.params.id);
  if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  
  // Only allow owners to update title
  if (table.owners.includes(req.user.id) && title) {
    table.title = title;
  }
  
  // Update general info if provided
  if (general) {
    table.general = {
      ...table.general,
      ...general
    };
  }
  
  await table.save();
  
  // Notify clients about the general info update
  notifyDataChange('generalChanged', null, req.params.id);
  notifyDataChange('tableUpdated', { tableId: req.params.id });
  
  res.json(table);
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
    // Get the old gear lists for diffing
    const oldTable = await Table.findById(req.params.id);
    const oldLists = oldTable && oldTable.gear && oldTable.gear.lists ? Object.fromEntries(oldTable.gear.lists) : {};

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

    // --- Granular event emission ---
    const newLists = result.gear && result.gear.lists ? Object.fromEntries(result.gear.lists) : {};
    const oldListNames = new Set(Object.keys(oldLists));
    const newListNames = new Set(Object.keys(newLists));

    // Additions
    for (const name of newListNames) {
      if (!oldListNames.has(name)) {
        notifyDataChange('gearListAdded', { listName: name, list: newLists[name] }, req.params.id);
      }
    }
    // Updates
    for (const name of newListNames) {
      if (oldListNames.has(name)) {
        // Compare JSON for simplicity
        if (JSON.stringify(oldLists[name]) !== JSON.stringify(newLists[name])) {
          notifyDataChange('gearListUpdated', { listName: name, list: newLists[name] }, req.params.id);
        }
      }
    }
    // Deletions
    for (const name of oldListNames) {
      if (!newListNames.has(name)) {
        notifyDataChange('gearListDeleted', { listName: name }, req.params.id);
      }
    }

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
  const table = await Table.findById(req.params.id);
  if (!table || !table.owners.includes(req.user.id)) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  await Table.findByIdAndDelete(req.params.id);
  
  // Notify clients about the table being deleted
  notifyDataChange('tableDeleted', { tableId: req.params.id });
  
  res.json({ success: true });
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
    // Get the old schedule for diffing
    const oldTable = await Table.findById(req.params.id);
    const oldSchedule = oldTable ? (oldTable.programSchedule || []) : [];
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
    // --- Partial update events ---
    const newSchedule = req.body.programSchedule || [];
    // Build maps for fast lookup
    const oldMap = new Map(oldSchedule.map(p => [p._id?.toString?.(), p]));
    const newMap = new Map(newSchedule.map(p => [p._id?.toString?.(), p]));
    // Added
    for (const p of newSchedule) {
      if (!oldMap.has(p._id?.toString?.())) {
        notifyDataChange('programAdded', { program: p }, req.params.id);
      }
    }
    // Updated
    for (const p of newSchedule) {
      const old = oldMap.get(p._id?.toString?.());
      if (old && JSON.stringify(p) !== JSON.stringify(old)) {
        notifyDataChange('programUpdated', { program: p }, req.params.id);
      }
    }
    // Deleted
    for (const p of oldSchedule) {
      if (!newMap.has(p._id?.toString?.())) {
        notifyDataChange('programDeleted', { program: p }, req.params.id);
      }
    }
    res.json({ message: 'Program schedule updated' });
  } catch (err) {
    console.error('Error updating program schedule:', err);
    res.status(500).json({ error: 'Failed to update program schedule' });
  }
});

// FOLDER LOGS
app.get('/api/tables/:id/folder-logs', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  
  try {
    const table = await Table.findById(req.params.id);
    if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
      return res.status(403).json({ error: 'Not authorized or not found' });
    }
    
    // Find folder log for this table or create a new one if it doesn't exist
    let folderLog = await FolderLog.findOne({ tableId: req.params.id });
    if (!folderLog) {
      folderLog = { folders: [] };
    }
    
    res.json({ folders: folderLog.folders || [] });
  } catch (err) {
    console.error('Error getting folder logs:', err);
    res.status(500).json({ error: 'Failed to get folder logs' });
  }
});

app.put('/api/tables/:id/folder-logs', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  
  try {
    const table = await Table.findById(req.params.id);
    if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
      return res.status(403).json({ error: 'Not authorized or not found' });
    }
    
    // Use findOneAndUpdate with upsert to create if it doesn't exist
    const result = await FolderLog.findOneAndUpdate(
      { tableId: req.params.id },
      { $set: { folders: req.body.folders || [] } },
      { new: true, upsert: true, runValidators: true }
    );
    
    // Notify clients about the folder logs update
    notifyDataChange('folderLogsChanged', null, req.params.id);
    res.json({ message: 'Folder logs updated' });
  } catch (err) {
    console.error('Error updating folder logs:', err);
    res.status(500).json({ error: 'Failed to update folder logs' });
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

  // Log current gear history before processing
  console.log(`[DEBUG] Gear history before checkout for ${gear.label} (${gear._id}):`, JSON.stringify(gear.history, null, 2));

  // Enforce exclusive reservation by serial (if present)
  if (gear.serial && gear.serial !== 'N/A') {
    // Find any other gear with the same serial
    const otherWithSerial = await GearInventory.findOne({ serial: gear.serial, _id: { $ne: gear._id } });
    if (otherWithSerial && otherWithSerial.status === 'checked_out') {
      console.log(`[DEBUG] Serial conflict: another item with serial ${gear.serial} is already checked out.`);
      return res.status(409).json({ error: 'Another item with this serial is already checked out.' });
    }
  }

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
    // Log updated gear history
    console.log(`[DEBUG] Gear history after update for ${gear.label} (${gear._id}):`, JSON.stringify(gear.history, null, 2));
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
      console.log(`[DEBUG] Skipping entry for current event: ${entryEventId}`);
      return false;
    }
    
    const entryStart = normalizeDate(entry.checkOutDate);
    const entryEnd = normalizeDate(entry.checkInDate);
    
    console.log(`[DEBUG] Checking entry:`, {
      event: entryEventId,
      entryStart: entryStart.toISOString(),
      entryEnd: entryEnd.toISOString()
    });
    
    // Only consider reservations that are not fully in the past
    if (entryEnd < now) {
      console.log("[DEBUG] Skipping past reservation (end < now)");
      return false;
    }
    
    // Overlap if: (startA <= endB) && (endA >= startB)
    const isOverlap = reqStart <= entryEnd && reqEnd >= entryStart;
    if (isOverlap) {
      console.log("[DEBUG] OVERLAP DETECTED!");
    }
    return isOverlap;
  };
  
  if (gear.history && gear.history.some(overlaps)) {
    console.log("[DEBUG] Reservation rejected: overlapping dates");
    // Log gear history at rejection
    console.log(`[DEBUG] Gear history at rejection for ${gear.label} (${gear._id}):`, JSON.stringify(gear.history, null, 2));
    return res.status(409).json({ error: 'Gear is already reserved for overlapping dates.' });
  }

  // Also check for other gear with the same serial (if present) for overlapping reservations
  if (gear.serial && gear.serial !== 'N/A') {
    const others = await GearInventory.find({ serial: gear.serial, _id: { $ne: gear._id } });
    for (const other of others) {
      if (other.history && other.history.some(overlaps)) {
        console.log(`[DEBUG] Serial overlap detected for other item with serial ${gear.serial}`);
        return res.status(409).json({ error: 'Another item with this serial has an overlapping reservation.' });
      }
    }
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
  // Log updated gear history
  console.log(`[DEBUG] Gear history after successful checkout for ${gear.label} (${gear._id}):`, JSON.stringify(gear.history, null, 2));
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

// ========= GEAR PACKAGES API =========

// Use the gear packages routes
const gearPackagesRoutes = require('./routes/gearPackages');
app.use('/api/gear-packages', authenticate, gearPackagesRoutes);

// Fallback route in case the module doesn't load properly
app.get('/api/gear-packages-fallback', authenticate, async (req, res) => {
  try {
    console.log('[Fallback] GET gear packages for user:', req.user.id);
    const GearPackage = require('./models/GearPackage');
    const packages = await GearPackage.find({ userId: String(req.user.id) })
      .sort({ createdAt: -1 })
      .select('_id name description createdAt');
    
    console.log(`[Fallback] Found ${packages.length} packages`);
    res.json(packages);
  } catch (err) {
    console.error('[Fallback] Error:', err);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// Add a direct test endpoint for diagnostic purposes
app.get('/api/gear-packages-test/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const GearPackage = require('./models/GearPackage');
    
    console.log('[Test] Directly testing user ID:', userId);
    console.log('[Test] Authenticated user ID:', req.user.id);
    
    // Helper to normalize user ID
    function normalizeUserId(id) {
      if (!id) return null;
      return String(id);
    }
    
    // First, try with exact match
    let packages = await GearPackage.find({ userId: userId })
      .sort({ createdAt: -1 })
      .select('_id name description createdAt');
    
    console.log(`[Test] Found ${packages.length} packages with exact userId match`);
    
    // If none found, try with normalized version
    if (packages.length === 0) {
      const normalizedId = normalizeUserId(userId);
      console.log(`[Test] Trying with normalized ID: ${normalizedId}`);
      
      packages = await GearPackage.find({ userId: normalizedId })
        .sort({ createdAt: -1 })
        .select('_id name description createdAt');
      
      console.log(`[Test] Found ${packages.length} packages with normalized userId match`);
      
      // If still none found, do a flexible search through all packages
      if (packages.length === 0) {
        console.log('[Test] Trying flexible search through all packages');
        const allPackages = await GearPackage.find()
          .select('_id name description createdAt userId');
        
        console.log(`[Test] Total packages in database: ${allPackages.length}`);
        
        // Log details of found packages
        if (allPackages.length > 0) {
          console.log('[Test] Sample of packages found:');
          allPackages.slice(0, 3).forEach((pkg, i) => {
            console.log(`  ${i+1}. ID: ${pkg._id}, Name: ${pkg.name}, UserId: ${pkg.userId}`);
          });
          
          // Try to find matches using flexible comparison
          const matchedPackages = allPackages.filter(pkg => normalizeUserId(pkg.userId) === normalizedId);
          console.log(`[Test] Found ${matchedPackages.length} packages with flexible comparison`);
          
          if (matchedPackages.length > 0) {
            packages = matchedPackages;
          }
        }
      }
    }
    
    res.json({
      requestedUserId: userId,
      normalizedUserId: normalizeUserId(userId),
      authenticatedUserId: req.user.id,
      normalizedAuthUserId: normalizeUserId(req.user.id),
      count: packages.length,
      packages: packages
    });
  } catch (err) {
    console.error('[Test] Error:', err);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// Add a simple endpoint to get ALL gear packages (no filtering)
app.get('/api/gear-packages-all', authenticate, async (req, res) => {
  try {
    console.log('[ALL] Getting all gear packages');
    const GearPackage = require('./models/GearPackage');
    
    // Get all packages in the database
    const packages = await GearPackage.find()
      .sort({ createdAt: -1 })
      .select('_id name description createdAt userId');
    
    console.log(`[ALL] Found ${packages.length} total packages`);
    
    // Return all packages with user ID info
    res.json({
      count: packages.length,
      packages: packages
    });
  } catch (err) {
    console.error('[ALL] Error:', err);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

// ========= END GEAR PACKAGES API =========

// Catch-all for SPA routing (should be last!)
app.get('/folder-logs.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'folder-logs.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, '../frontend', 'dashboard.html'));
});

// SERVER
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server started on port ${PORT}`));

// --- SHARE TABLE WITH USER (OWNER/LEAD/SHARED) ---
app.post('/api/tables/:id/share', authenticate, async (req, res) => {
  const { email, makeOwner, makeLead, unshare } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const table = await Table.findById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  // Handle unshare: remove from sharedWith and leads (and owners if present, but only if not last owner)
  if (unshare) {
    table.sharedWith = table.sharedWith.filter(id => !id.equals(user._id));
    table.leads = table.leads.filter(id => !id.equals(user._id));
    // Only remove from owners if more than one owner remains
    if (table.owners.includes(user._id) && table.owners.length > 1) {
      table.owners = table.owners.filter(id => !id.equals(user._id));
    }
    await table.save();
    notifyDataChange('tableUpdated', { tableId: table._id });
    return res.json({ message: 'User unshared from event.' });
  }

  // Add as owner if requested
  if (makeOwner && !table.owners.includes(user._id)) {
    table.owners.push(user._id);
    // Remove from leads/sharedWith if promoted
    table.leads = table.leads.filter(id => !id.equals(user._id));
    table.sharedWith = table.sharedWith.filter(id => !id.equals(user._id));
  } else if (makeLead && !table.leads.includes(user._id)) {
    table.leads.push(user._id);
  } else if (!table.sharedWith.includes(user._id)) {
    table.sharedWith.push(user._id);
  }

  await table.save();
  notifyDataChange('tableUpdated', { tableId: table._id });

  // Send notification email to the user
  try {
    let subject = 'You have been added to an event in LumDash';
    let html = `<p>Hello ${user.fullName || user.email},</p>`;
    if (makeOwner) {
      html += `<p>You have been made an <b>owner</b> of the event: <b>${table.title}</b>.</p>`;
    } else if (makeLead) {
      html += `<p>You have been given <b>lead access</b> to the event: <b>${table.title}</b>.<br>
        This gives you full schedule access for this event only.</p>`;
    } else {
      html += `<p>You have been added as a collaborator to the event: <b>${table.title}</b>.</p>`;
    }
    // Add a consistent View Event button for all roles
    const eventUrl = `${process.env.APP_URL}/dashboard.html?id=${table._id}`;
    html += `
      <div style="margin: 24px 0;">
        <a href="${eventUrl}" style="display:inline-block;padding:12px 28px;background:#CC0007;color:#fff;text-decoration:none;font-size:17px;font-weight:600;border-radius:8px;">View Event</a>
      </div>
    `;
    html += `<p>Log in to LumDash to view the event.</p>`;

    await sgMail.send({
      to: user.email,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject,
      html
    });
  } catch (err) {
    console.error('Failed to send share notification email:', err);
    // Don't fail the request if email fails
  }

  res.json({ message: 'User shared and role updated.' });
});

// --- Add/Update/Delete single crew row by _id ---
app.put('/api/tables/:id/rows/:rowId', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null" || !req.params.rowId) {
    return res.status(400).json({ error: "Invalid table ID or row ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || !table.owners.includes(req.user.id)) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  const rowIndex = table.rows.findIndex(r => r._id && r._id.toString() === req.params.rowId);
  if (rowIndex === -1) {
    return res.status(404).json({ error: 'Row not found' });
  }
  // Update fields
  table.rows[rowIndex] = { ...table.rows[rowIndex]._doc, ...req.body, _id: table.rows[rowIndex]._id };
  await table.save();
  notifyDataChange('crewChanged', null, req.params.id);
  notifyDataChange('tableUpdated', null, req.params.id);
  res.json({ message: 'Row updated' });
});

app.delete('/api/tables/:id/rows-by-id/:rowId', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null" || !req.params.rowId) {
    return res.status(400).json({ error: "Invalid table ID or row ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || !table.owners.includes(req.user.id)) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  const rowIndex = table.rows.findIndex(r => r._id && r._id.toString() === req.params.rowId);
  if (rowIndex === -1) {
    return res.status(404).json({ error: 'Row not found' });
  }
  table.rows.splice(rowIndex, 1);
  await table.save();
  notifyDataChange('crewChanged', null, req.params.id);
  notifyDataChange('tableUpdated', null, req.params.id);
  res.json({ message: 'Row deleted' });
});

// PATCH endpoint for partial updates (e.g., crewRates)
app.patch('/api/tables/:id', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  const table = await Table.findById(req.params.id);
  if (!table || !table.owners.includes(req.user.id)) {
    return res.status(403).json({ error: 'Not authorized or not found' });
  }
  // Only allow updating crewRates for now
  if (req.body.crewRates) {
    table.crewRates = { ...table.crewRates, ...req.body.crewRates };
    await table.save();
    return res.json({ crewRates: table.crewRates });
  }
  res.status(400).json({ error: 'No valid fields to update' });
});
