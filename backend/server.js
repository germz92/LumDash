const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const sgMail = require('@sendgrid/mail');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
require('dotenv').config();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
console.log('SENDGRID_API_KEY loaded:', !!process.env.SENDGRID_API_KEY);
console.log('SENDGRID_FROM_EMAIL:', process.env.SENDGRID_FROM_EMAIL);
console.log('APP_URL:', process.env.APP_URL);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true // Ensure HTTPS URLs
});

// Debug Cloudinary configuration
console.log('Cloudinary Environment Variables:');
console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'NOT SET');
console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? 'SET' : 'NOT SET');
console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? 'SET' : 'NOT SET');
console.log('Cloudinary config:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY ? '***' + process.env.CLOUDINARY_API_KEY.slice(-4) : 'NOT SET',
  api_secret: process.env.CLOUDINARY_API_SECRET ? '***' + process.env.CLOUDINARY_API_SECRET.slice(-4) : 'NOT SET'
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and PDF files are allowed.'), false);
    }
  }
});

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
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  
  // Extract token from "Bearer <token>" format
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  
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

// Helper to ensure _id is a valid ObjectId
function ensureObjectId(id) {
  if (!id) return new mongoose.Types.ObjectId();
  if (mongoose.Types.ObjectId.isValid(id) && (typeof id !== 'string' || id.length === 24)) {
    return new mongoose.Types.ObjectId(id);
  }
  return new mongoose.Types.ObjectId();
}

function sanitizeCardLog(cardLog) {
  return (Array.isArray(cardLog) ? cardLog : []).map(day => ({
    _id: ensureObjectId(day._id),
    date: day.date,
    entries: Array.isArray(day.entries)
      ? day.entries.map(entry => ({
          _id: ensureObjectId(entry._id),
          camera: entry.camera || '',
          card1: entry.card1 || '',
          card2: entry.card2 || '',
          user: entry.user || ''
        }))
      : []
  }));
}

// ✅ Save card log data
app.put('/api/tables/:id/cardlog', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  
  try {
    console.log(`[CARDLOG] Received PUT request for card log, table ID: ${req.params.id}`);
    
    // Safely extract the card log data
    let newCardLog = [];
    try {
      newCardLog = Array.isArray(req.body.cardLog) ? req.body.cardLog : [];
      console.log(`[CARDLOG] Received ${newCardLog.length} entries`);
      
      // Basic validation - log date presence
      const entriesWithoutDates = newCardLog.filter(entry => !entry || !entry.date).length;
      if (entriesWithoutDates > 0) {
        console.warn(`[CARDLOG] Warning: ${entriesWithoutDates} entries are missing dates`);
      }
    } catch (err) {
      console.error('[CARDLOG] Error parsing card log data:', err);
      return res.status(400).json({ error: "Invalid card log data format" });
    }
    
    // Sanitize card log to ensure all _id fields are ObjectId
    const sanitizedCardLog = sanitizeCardLog(newCardLog);
    
    // Get the current card log for comparison
    const oldTable = await Table.findById(req.params.id);
    if (!oldTable) {
      console.error(`[CARDLOG] Table not found: ${req.params.id}`);
      return res.status(404).json({ error: "Table not found" });
    }
    
    // Check permissions
    if (!oldTable.owners.includes(req.user.id) && !oldTable.sharedWith.includes(req.user.id)) {
      console.error(`[CARDLOG] Unauthorized access: ${req.user.id}`);
      return res.status(403).json({ error: "Not authorized" });
    }
    
    // Safely extract old card log
    const oldCardLog = Array.isArray(oldTable.cardLog) ? oldTable.cardLog : [];
    console.log(`[CARDLOG] Current card log has ${oldCardLog.length} entries`);
    
    // Get dates from both logs for basic diffing
    const oldDates = new Set(oldCardLog.filter(entry => entry && entry.date).map(entry => entry.date));
    const newDates = new Set(sanitizedCardLog.filter(entry => entry && entry.date).map(entry => entry.date));
    
    console.log(`[CARDLOG] Old dates: ${Array.from(oldDates).join(', ')}`);
    console.log(`[CARDLOG] New dates: ${Array.from(newDates).join(', ')}`);
    
    // Simple diffing for notifications
    const addedDates = Array.from(newDates).filter(date => !oldDates.has(date));
    const deletedDates = Array.from(oldDates).filter(date => !newDates.has(date));
    
    console.log(`[CARDLOG] Added dates: ${addedDates.join(', ')}`);
    console.log(`[CARDLOG] Deleted dates: ${deletedDates.join(', ')}`);
    
    // Enhanced diffing: detect row-level changes within existing dates
    const updatedDates = [];
    for (const date of newDates) {
      if (oldDates.has(date)) {
        // Date exists in both - check if entries changed
        const oldEntry = oldCardLog.find(e => e && e.date === date);
        const newEntry = sanitizedCardLog.find(e => e && e.date === date);
        
        if (oldEntry && newEntry) {
          const oldEntriesCount = Array.isArray(oldEntry.entries) ? oldEntry.entries.length : 0;
          const newEntriesCount = Array.isArray(newEntry.entries) ? newEntry.entries.length : 0;
          
          console.log(`[CARDLOG] Comparing entries for date ${date}: old=${oldEntriesCount}, new=${newEntriesCount}`);
          
          // Simple check: if entry count changed or content changed
          const entriesChanged = oldEntriesCount !== newEntriesCount || 
            JSON.stringify(oldEntry.entries || []) !== JSON.stringify(newEntry.entries || []);
          
          if (entriesChanged) {
            updatedDates.push(date);
            console.log(`[CARDLOG] Date ${date} has row changes: ${oldEntriesCount} -> ${newEntriesCount} entries`);
            
            // Log the actual differences for debugging
            if (oldEntriesCount !== newEntriesCount) {
              console.log(`[CARDLOG] Entry count changed for ${date}`);
            } else {
              console.log(`[CARDLOG] Entry content changed for ${date}`);
            }
          } else {
            console.log(`[CARDLOG] No changes detected for date ${date}`);
          }
        }
      }
    }
    
    console.log(`[CARDLOG] Updated dates: ${updatedDates.join(', ')}`);
    
    // Update with retry logic
    let updateSuccessful = false;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (!updateSuccessful && retryCount < maxRetries) {
      try {
        // Use findOneAndUpdate to avoid race conditions
        const result = await Table.findOneAndUpdate(
          { 
            _id: req.params.id,
            $or: [
              { owners: req.user.id },
              { sharedWith: req.user.id }
            ]
          },
          { $set: { cardLog: sanitizedCardLog } },
          { new: true }
        );
        
        if (!result) {
          console.error(`[CARDLOG] Update failed: No document returned`);
          return res.status(404).json({ error: "Update failed - table not found or permissions changed" });
        }
        
        updateSuccessful = true;
        console.log(`[CARDLOG] Update successful on attempt ${retryCount + 1}`);
        
        // Emit basic events
        try {
          // Emit events for added dates
          for (const date of addedDates) {
            const entry = sanitizedCardLog.find(e => e && e.date === date);
            if (entry) {
              console.log(`[CARDLOG] Emitting cardLogAdded for date: ${date}`);
              notifyDataChange('cardLogAdded', { cardLog: entry }, req.params.id);
            }
          }
          
          // Emit events for updated dates (row-level changes)
          for (const date of updatedDates) {
            const entry = sanitizedCardLog.find(e => e && e.date === date);
            if (entry) {
              console.log(`[CARDLOG] Emitting cardLogUpdated for date: ${date}`);
              notifyDataChange('cardLogUpdated', { cardLog: entry }, req.params.id);
            }
          }
          
          // Emit events for deleted dates
          for (const date of deletedDates) {
            const entry = oldCardLog.find(e => e && e.date === date);
            if (entry) {
              console.log(`[CARDLOG] Emitting cardLogDeleted for date: ${date}`);
              notifyDataChange('cardLogDeleted', { cardLog: entry }, req.params.id);
            }
          }
        } catch (err) {
          console.error('[CARDLOG] Error emitting events:', err);
          // Continue - the save was successful even if notifications fail
        }
        
      } catch (err) {
        console.error(`[CARDLOG] Update attempt ${retryCount + 1} failed:`, err);
        retryCount++;
        
        if (retryCount >= maxRetries) {
          return res.status(500).json({ 
            error: "Failed to update card log after multiple attempts",
            details: err.message
          });
        }
        
        // Wait a bit before retry
        await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
      }
    }
    
    return res.json({ message: 'Card log saved successfully' });
  } catch (err) {
    console.error('[CARDLOG] Unhandled error in card log update:', err);
    return res.status(500).json({ error: 'Failed to update card log', details: err.message });
  }
});

// ✅ Save shotlist data
app.put('/api/tables/:id/shotlist', authenticate, async (req, res) => {
  if (!req.params.id || req.params.id === "null") {
    return res.status(400).json({ error: "Invalid table ID" });
  }
  
  try {
    console.log(`[SHOTLIST] Received PUT request for shotlist, table ID: ${req.params.id}`);
    
    // Safely extract the shotlist data
    let newShotlist = [];
    try {
      newShotlist = Array.isArray(req.body.shotlist) ? req.body.shotlist : [];
      console.log(`[SHOTLIST] Received ${newShotlist.length} shots`);
    } catch (err) {
      console.error('[SHOTLIST] Error parsing shotlist data:', err);
      return res.status(400).json({ error: "Invalid shotlist data format" });
    }
    
    // Get the current table
    const table = await Table.findById(req.params.id);
    if (!table) {
      console.error(`[SHOTLIST] Table not found: ${req.params.id}`);
      return res.status(404).json({ error: "Table not found" });
    }
    
    // Check permissions - only owners and leads can edit
    const canEdit = table.owners.includes(req.user.id) || 
                   (Array.isArray(table.leads) && table.leads.includes(req.user.id));
    
    if (!canEdit && !table.sharedWith.includes(req.user.id)) {
      console.error(`[SHOTLIST] Unauthorized access: ${req.user.id}`);
      return res.status(403).json({ error: "Not authorized" });
    }
    
    // If user is only a shared member (not owner/lead), they can only update completion status
    if (!canEdit && table.sharedWith.includes(req.user.id)) {
      const oldShotlist = Array.isArray(table.shotlist) ? table.shotlist : [];
      
      // Validate that only completion status changed
      if (newShotlist.length !== oldShotlist.length) {
        return res.status(403).json({ error: "Only owners and leads can add/remove shots" });
      }
      
      for (let i = 0; i < newShotlist.length; i++) {
        const newShot = newShotlist[i];
        const oldShot = oldShotlist[i];
        
        // Allow only completed and completedAt fields to change
        const allowedFields = ['completed', 'completedAt'];
        for (const key in newShot) {
          if (!allowedFields.includes(key) && newShot[key] !== oldShot[key]) {
            return res.status(403).json({ 
              error: "Only owners and leads can edit shot details. You can only check/uncheck completion." 
            });
          }
        }
      }
    }
    
    // Sanitize shotlist data
    const sanitizedShotlist = newShotlist.map(shot => ({
      ...shot,
      _id: shot._id || `shot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: shot.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    
    // Update with retry logic
    let updateSuccessful = false;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (!updateSuccessful && retryCount < maxRetries) {
      try {
        const result = await Table.findOneAndUpdate(
          { 
            _id: req.params.id,
            $or: [
              { owners: req.user.id },
              { leads: req.user.id },
              { sharedWith: req.user.id }
            ]
          },
          { $set: { shotlist: sanitizedShotlist } },
          { new: true }
        );
        
        if (!result) {
          console.error(`[SHOTLIST] Update failed: No document returned`);
          return res.status(404).json({ error: "Update failed - table not found or permissions changed" });
        }
        
        updateSuccessful = true;
        console.log(`[SHOTLIST] Update successful on attempt ${retryCount + 1}`);
        
        // Emit socket event for real-time updates
        try {
          console.log(`[SHOTLIST] Emitting shotlistUpdated event`);
          notifyDataChange('shotlistUpdated', { shotlist: sanitizedShotlist }, req.params.id);
        } catch (err) {
          console.error('[SHOTLIST] Error emitting events:', err);
          // Continue - the save was successful even if notifications fail
        }
        
      } catch (err) {
        console.error(`[SHOTLIST] Update attempt ${retryCount + 1} failed:`, err);
        retryCount++;
        
        if (retryCount >= maxRetries) {
          return res.status(500).json({ 
            error: "Failed to update shotlist after multiple attempts",
            details: err.message
          });
        }
        
        // Wait a bit before retry
        await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
      }
    }
    
    return res.json({ message: 'Shotlist saved successfully' });
  } catch (err) {
    console.error('[SHOTLIST] Unhandled error in shotlist update:', err);
    return res.status(500).json({ error: 'Failed to update shotlist', details: err.message });
  }
});

// ✅ Save shotlists data (multiple lists)
app.put('/api/tables/:id/shotlists', authenticate, async (req, res) => {
  const maxRetries = 3;
  let retryCount = 0;

  try {
    console.log(`[SHOTLISTS] Received PUT request for shotlists, table ID: ${req.params.id}`);
    
    // Safely extract the shotlists data
    let newShotlists = [];
    try {
      newShotlists = Array.isArray(req.body.shotlists) ? req.body.shotlists : [];
      console.log(`[SHOTLISTS] Received ${newShotlists.length} lists`);
    } catch (err) {
      console.error('[SHOTLISTS] Error parsing shotlists data:', err);
      return res.status(400).json({ error: "Invalid shotlists data format" });
    }

    const table = await Table.findById(req.params.id);
    if (!table) {
      console.error(`[SHOTLISTS] Table not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Table not found' });
    }

    // Check if user has permission to edit
    const userId = req.user.id;
    const isOwner = table.owners && table.owners.some(ownerId => ownerId.toString() === userId);
    const isLead = table.leads && table.leads.some(leadId => leadId.toString() === userId);

    if (!isOwner && !isLead) {
      console.error(`[SHOTLISTS] Unauthorized access: ${req.user.id}`);
      return res.status(403).json({ error: 'Unauthorized: Only owners and leads can edit shotlists' });
    }

    // Sanitize shotlists data - let mongoose handle ObjectId creation automatically
    const sanitizedShotlists = newShotlists.map(list => {
      const sanitizedList = {
        name: typeof list.name === 'string' ? list.name.trim() : '',
        items: Array.isArray(list.items) ? list.items.map(item => {
          const sanitizedItem = {
            title: typeof item.title === 'string' ? item.title.trim() : '',
            completed: Boolean(item.completed),
            completedAt: item.completed && item.completedAt ? new Date(item.completedAt) : null,
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
            createdBy: item.createdBy || req.user.id,
            updatedAt: new Date()
          };
          
          // Only preserve _id if it's a valid MongoDB ObjectId
          if (item._id && mongoose.Types.ObjectId.isValid(item._id)) {
            sanitizedItem._id = item._id;
          }
          
          return sanitizedItem;
        }) : [],
        createdAt: list.createdAt ? new Date(list.createdAt) : new Date(),
        createdBy: list.createdBy || req.user.id,
        updatedAt: new Date()
      };
      
      // Only preserve _id if it's a valid MongoDB ObjectId
      if (list._id && mongoose.Types.ObjectId.isValid(list._id)) {
        sanitizedList._id = list._id;
      }
      
      return sanitizedList;
    });

    while (retryCount < maxRetries) {
      try {
        const updatedTable = await Table.findByIdAndUpdate(
          req.params.id,
          { $set: { shotlists: sanitizedShotlists } },
          { new: true, runValidators: true }
        );

        if (!updatedTable) {
          console.error(`[SHOTLISTS] Update failed: No document returned`);
          return res.status(404).json({ error: 'Table not found' });
        }

        console.log(`[SHOTLISTS] Update successful on attempt ${retryCount + 1}`);

        // Emit Socket.IO event for real-time updates
        try {
          console.log(`[SHOTLISTS] Emitting shotlistsUpdated event`);
          // Send the actual saved data from MongoDB, not the sanitized input
          notifyDataChange('shotlistsUpdated', { shotlists: updatedTable.shotlists }, req.params.id);
        } catch (err) {
          console.error('[SHOTLISTS] Error emitting events:', err);
        }

        break;

      } catch (err) {
        console.error(`[SHOTLISTS] Update attempt ${retryCount + 1} failed:`, err);
        retryCount++;
        
        if (retryCount >= maxRetries) {
          console.error('[SHOTLISTS] Max retries reached');
          return res.status(500).json({ 
            error: "Failed to update shotlists after multiple attempts",
            details: err.message 
          });
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
      }
    }

    return res.json({ message: 'Shotlists saved successfully' });

  } catch (err) {
    console.error('[SHOTLISTS] Unhandled error in shotlists update:', err);
    return res.status(500).json({ error: 'Failed to update shotlists', details: err.message });
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
  
  try {
    // Before deleting the table, release all gear items reserved for this event
    console.log(`[DELETE EVENT] Releasing all gear items for event ${req.params.id}`);
    
    // Find all gear items that have ANY association with this event
    const gearItems = await GearInventory.find({
      $or: [
        { 'reservations.eventId': req.params.id },  // Multi-quantity items with reservations
        { 'checkedOutEvent': req.params.id },       // Single-quantity items checked out
        { 'history.event': req.params.id }          // Items with history entries for this event
      ]
    });
    
    console.log(`[DELETE EVENT] Found ${gearItems.length} gear items associated with this event`);
    
    // Release all reservations for this event from each gear item
    for (const gear of gearItems) {
      console.log(`[DELETE EVENT] Processing gear item: ${gear.label} (${gear._id})`);
      
      const originalReservationCount = gear.reservations?.length || 0;
      const originalHistoryCount = gear.history?.length || 0;
      
      // Remove all reservations for this event
      if (gear.reservations && gear.reservations.length > 0) {
        gear.reservations = gear.reservations.filter(reservation => 
          reservation.eventId.toString() !== req.params.id.toString()
        );
        console.log(`[DELETE EVENT] Removed ${originalReservationCount - gear.reservations.length} reservations from ${gear.label}`);
      }
      
      // Remove all history entries for this event
      if (gear.history && gear.history.length > 0) {
        gear.history = gear.history.filter(entry => 
          !entry.event || entry.event.toString() !== req.params.id.toString()
        );
        console.log(`[DELETE EVENT] Removed ${originalHistoryCount - gear.history.length} history entries from ${gear.label}`);
      }
      
      // Update status for single-quantity items if they were checked out for this event
      if (gear.quantity === 1 && gear.checkedOutEvent && gear.checkedOutEvent.toString() === req.params.id.toString()) {
        gear.status = 'available';
        gear.checkedOutBy = null;
        gear.checkedOutEvent = null;
        gear.checkOutDate = null;
        gear.checkInDate = null;
        console.log(`[DELETE EVENT] Reset status to available for ${gear.label}`);
      }
      
      await gear.save();
      console.log(`[DELETE EVENT] Successfully updated ${gear.label}`);
    }
    
    // Now delete the table
    await Table.findByIdAndDelete(req.params.id);
    
    // Notify clients about the table being deleted
    notifyDataChange('tableDeleted', { tableId: req.params.id });
    
    console.log(`[DELETE EVENT] Successfully deleted event ${req.params.id} and released all associated gear`);
    res.json({ success: true, message: `Event deleted and ${gearItems.length} gear items released` });
    
  } catch (error) {
    console.error('[DELETE EVENT] Error deleting event and releasing gear:', error);
    res.status(500).json({ error: 'Failed to delete event and release gear items' });
  }
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
  const { gearId, eventId, checkOutDate, checkInDate, quantity = 1 } = req.body;
  if (!gearId || !eventId || !checkOutDate || !checkInDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  console.log("Checkout request:", { gearId, eventId, checkOutDate, checkInDate, quantity });
  
  const gear = await GearInventory.findById(gearId);
  if (!gear) return res.status(404).json({ error: 'Gear not found' });

  // Log current gear state before processing
  console.log(`[DEBUG] Gear before checkout for ${gear.label} (${gear._id}):`, {
    quantity: gear.quantity,
    reservations: gear.reservations?.length || 0,
    status: gear.status
  });

  try {
    // NEW: Handle quantity-based items
    if (gear.quantity > 1) {
      // Check if this event already has a reservation for these dates
      const existingReservation = gear.reservations.find(res => 
        res.eventId.toString() === eventId &&
        res.checkOutDate.toISOString().split('T')[0] === checkOutDate &&
        res.checkInDate.toISOString().split('T')[0] === checkInDate
      );
      
      if (existingReservation) {
        // Update existing reservation quantity
        const newQuantity = existingReservation.quantity + quantity;
        
        existingReservation.quantity = newQuantity;
        
        // Update history entry
        const historyEntry = gear.history.find(entry => 
          entry.event.toString() === eventId &&
          entry.checkOutDate.toISOString().split('T')[0] === checkOutDate &&
          entry.checkInDate.toISOString().split('T')[0] === checkInDate
        );
        if (historyEntry) {
          historyEntry.quantity = newQuantity;
        }
        
        await gear.save();
        return res.json({ 
          message: `Reservation updated to ${newQuantity} units`, 
          gear,
          reservedQuantity: newQuantity,
          availableQuantity: gear.getAvailableQuantity(checkOutDate, checkInDate)
        });
      } else {
        // Create new reservation
        gear.reserveQuantity(eventId, req.user.id, quantity, checkOutDate, checkInDate);
        await gear.save();
        
        return res.json({ 
          message: `${quantity} units reserved`, 
          gear,
          reservedQuantity: quantity,
          availableQuantity: gear.getAvailableQuantity(checkOutDate, checkInDate)
        });
      }
    }

    // EXISTING: Handle single-quantity items (backward compatibility)
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
      console.log(`[DEBUG] Gear history after update for ${gear.label} (${gear._id}):`, JSON.stringify(gear.history, null, 2));
      return res.json({ message: 'Gear reservation updated', gear });
    }

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
    gear.checkOutDate = checkOutDate;
    gear.checkInDate = checkInDate;
    
    gear.history.push({
      user: req.user.id,
      event: eventId,
      checkOutDate: checkOutDate,
      checkInDate: checkInDate,
      quantity: 1
    });
    
    await gear.save();
    console.log("Single item reservation successful");
    res.json({ message: 'Gear checked out', gear });
    
  } catch (error) {
    console.error('Error during checkout:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check in gear
app.post('/api/gear-inventory/checkin', authenticate, async (req, res) => {
  const { gearId, eventId, checkOutDate, checkInDate, quantity } = req.body;
  if (!gearId) return res.status(400).json({ error: 'Missing gearId' });
  
  console.log(`[CHECKIN DEBUG] Request:`, { gearId, eventId, checkOutDate, checkInDate, quantity });
  console.log(`[CHECKIN DEBUG] Quantity type:`, typeof quantity, `Value:`, quantity);
  
  const gear = await GearInventory.findById(gearId);
  if (!gear) return res.status(404).json({ error: 'Gear not found' });

  console.log(`[CHECKIN DEBUG] Gear found:`, { 
    label: gear.label, 
    quantity: gear.quantity, 
    reservationsCount: gear.reservations?.length || 0 
  });

  try {
    // NEW: Handle quantity-based items
    if (gear.quantity > 1) {
      if (!eventId || !checkOutDate || !checkInDate) {
        return res.status(400).json({ error: 'Event ID and dates required for quantity items' });
      }
      
      // Release the quantity reservation
      gear.releaseQuantity(eventId, checkOutDate, checkInDate, quantity);
      
      // Remove from history - only the specific quantity
      const normalizeDate = (dateStr) => {
        const date = new Date(dateStr);
        date.setUTCHours(0, 0, 0, 0);
        return date;
      };
      
      const requestOutDate = normalizeDate(checkOutDate);
      const requestInDate = normalizeDate(checkInDate);
      
      // Remove specific quantity from history using overlap logic
      let remainingToRemove = quantity || 1; // Default to 1 if quantity is undefined
      const newHistory = [];
      const rangesOverlap = (startA, endA, startB, endB) => (startA <= endB && endA >= startB);
      for (const entry of gear.history) {
        if (!entry.event || !entry.checkOutDate || !entry.checkInDate || remainingToRemove <= 0) {
          newHistory.push(entry);
          continue;
        }
        const eventMatches = entry.event.toString() === eventId;
        if (!eventMatches) {
          newHistory.push(entry);
          continue;
        }
        const entryOutDate = normalizeDate(entry.checkOutDate);
        const entryInDate = normalizeDate(entry.checkInDate);
        // Use overlap logic
        if (rangesOverlap(entryOutDate, entryInDate, requestOutDate, requestInDate)) {
          const entryQuantity = entry.quantity || 1;
          if (entryQuantity <= remainingToRemove) {
            remainingToRemove -= entryQuantity;
          } else {
            const modifiedEntry = { ...entry.toObject() };
            modifiedEntry.quantity = entryQuantity - remainingToRemove;
            remainingToRemove = 0;
            newHistory.push(modifiedEntry);
          }
        } else {
          newHistory.push(entry);
        }
      }
      gear.history = newHistory;
      
      await gear.save();
      
      // Remove from event gear lists if eventId is provided
      if (eventId) {
        await removeGearFromEventLists(eventId, gearId, gear.label, quantity);
      }
      
      const availableQty = gear.getAvailableQuantity(checkOutDate, checkInDate);
      return res.json({ 
        message: 'Quantity reservation released', 
        gear,
        availableQuantity: availableQty
      });
    }

    // EXISTING: Handle single-quantity items (backward compatibility)
    gear.status = 'available';
    gear.checkedOutBy = null;
    gear.checkedOutEvent = null;
    gear.checkOutDate = null;
    gear.checkInDate = null;

    // Remove reservation from history if eventId and dates are provided
    if (eventId && checkOutDate && checkInDate) {
      const normalizeDate = (dateStr) => {
        const date = new Date(dateStr);
        date.setUTCHours(0, 0, 0, 0);
        return date;
      };
      
      const requestOutDate = normalizeDate(checkOutDate);
      const requestInDate = normalizeDate(checkInDate);
      
      gear.history = gear.history.filter(entry => {
        if (!entry.event || !entry.checkOutDate || !entry.checkInDate) return true;
        const eventMatches = entry.event.toString() === eventId;
        if (!eventMatches) return true;
        const entryOutDate = normalizeDate(entry.checkOutDate);
        const entryInDate = normalizeDate(entry.checkInDate);
        // Use overlap logic
        const rangesOverlap = (startA, endA, startB, endB) => (startA <= endB && endA >= startB);
        return !rangesOverlap(entryOutDate, entryInDate, requestOutDate, requestInDate);
      });
      
      // Remove from event gear lists
      await removeGearFromEventLists(eventId, gearId, gear.label, 1);
    }

    await gear.save();
    res.json({ message: 'Gear checked in', gear });
    
  } catch (error) {
    console.error('Error during checkin:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to remove gear from event gear lists
async function removeGearFromEventLists(eventId, gearId, gearLabel, quantityToRemove = 1) {
  try {
    console.log(`[REMOVE FROM LISTS] Removing ${gearLabel} (${gearId}) from event ${eventId} gear lists`);
    
    // Find the event/table
    const table = await Table.findById(eventId);
    if (!table) {
      console.log(`[REMOVE FROM LISTS] Event ${eventId} not found`);
      return;
    }
    
    console.log(`[REMOVE FROM LISTS] Found event: ${table.title}`);
    
    let tableModified = false;
    const lists = table.gear?.lists || new Map();
    
    // Convert Map to Object if needed for consistent iteration
    let listsObj;
    if (lists instanceof Map) {
      listsObj = Object.fromEntries(lists);
    } else if (lists && lists._doc) {
      // Handle Mongoose Map - the actual data is in _doc
      listsObj = lists._doc;
    } else {
      listsObj = lists;
    }
    
    console.log(`[REMOVE FROM LISTS] Processing ${Object.keys(listsObj).length} gear lists`);
    
    // Iterate through each list in the table
    for (const [listName, listData] of Object.entries(listsObj)) {
      if (!listData || typeof listData !== 'object') {
        console.log(`[REMOVE FROM LISTS] Skipping invalid list data for ${listName}`);
        continue;
      }
      
      console.log(`[REMOVE FROM LISTS] Checking list: ${listName}`);
      
      // Handle the case where listData might also be a Mongoose document
      let actualListData = listData;
      if (listData._doc) {
        actualListData = listData._doc;
      }
      
      // Iterate through each category in the list
      let categoriesToCheck = actualListData;
      
      // Check if the list has a 'categories' property (new structure)
      if (actualListData.categories && typeof actualListData.categories === 'object') {
        console.log(`[REMOVE FROM LISTS] Found categories structure in ${listName}`);
        categoriesToCheck = actualListData.categories;
        
        // Handle case where categories might also be a Mongoose document
        if (categoriesToCheck._doc) {
          categoriesToCheck = categoriesToCheck._doc;
        }
      }
      
      console.log(`[REMOVE FROM LISTS] Categories to check:`, Object.keys(categoriesToCheck));
      
      for (const [categoryName, items] of Object.entries(categoriesToCheck)) {
        if (!Array.isArray(items)) {
          console.log(`[REMOVE FROM LISTS] Skipping non-array category: ${categoryName}`);
          continue;
        }
        
        console.log(`[REMOVE FROM LISTS] Checking category: ${categoryName} with ${items.length} items`);
        
        // Find and remove/reduce items that match this gear
        const originalLength = items.length;
        let removedCount = 0;
        
        const filteredItems = [];
        let remainingToRemove = quantityToRemove;
        
        for (const item of items) {
          // Match by inventoryId (primary) or label (fallback)
          const matchesId = item.inventoryId && item.inventoryId.toString() === gearId.toString();
          const matchesLabel = item.label && (
            item.label === gearLabel || 
            item.label.startsWith(gearLabel + ' (') // Handle quantity labels like "Sony NP-FZ100 (5 units)"
          );
          
          if ((matchesId || matchesLabel) && remainingToRemove > 0) {
            console.log(`[REMOVE FROM LISTS] Found matching item: ${item.label || item.inventoryId}`);
            
            // For quantity-based items, check if we need to reduce quantity or remove entirely
            if (item.quantity && item.quantity > 1) {
              const itemQuantity = parseInt(item.quantity) || 1;
              
              if (itemQuantity <= remainingToRemove) {
                // Remove the entire item
                console.log(`[REMOVE FROM LISTS] Removing entire item (quantity: ${itemQuantity})`);
                remainingToRemove -= itemQuantity;
                removedCount += itemQuantity;
                // Don't add to filteredItems (effectively removing it)
              } else {
                // Reduce the quantity
                const newQuantity = itemQuantity - remainingToRemove;
                console.log(`[REMOVE FROM LISTS] Reducing item quantity from ${itemQuantity} to ${newQuantity}`);
                
                const updatedItem = { ...item };
                updatedItem.quantity = newQuantity;
                
                // Update the label if it includes quantity info
                if (updatedItem.label && updatedItem.label.includes('(') && updatedItem.label.includes('units)')) {
                  const baseName = updatedItem.label.split(' (')[0];
                  updatedItem.label = newQuantity === 1 ? baseName : `${baseName} (${newQuantity} units)`;
                }
                
                filteredItems.push(updatedItem);
                removedCount += remainingToRemove;
                remainingToRemove = 0;
              }
            } else {
              // Single quantity item - remove it entirely
              console.log(`[REMOVE FROM LISTS] Removing single quantity item`);
              remainingToRemove -= 1;
              removedCount += 1;
              // Don't add to filteredItems (effectively removing it)
            }
          } else {
            // Keep this item
            filteredItems.push(item);
          }
        }
        
        if (removedCount > 0) {
          categoriesToCheck[categoryName] = filteredItems;
          tableModified = true;
          console.log(`[REMOVE FROM LISTS] Removed/reduced ${removedCount} units from ${categoryName} in ${listName}`);
        }
      }
    }
    
    // Save the table if it was modified
    if (tableModified) {
      // Convert back to Map if the original was a Map
      if (lists instanceof Map) {
        table.gear.lists = new Map(Object.entries(listsObj));
      } else {
        table.gear.lists = listsObj;
      }
      
      await table.save();
      console.log(`[REMOVE FROM LISTS] Updated gear lists for event: ${table.title}`);
      
      // Notify clients about the gear list change
      notifyDataChange('gearListUpdated', { 
        message: `${gearLabel} removed from gear lists due to reservation removal` 
      }, table._id.toString());
    } else {
      console.log(`[REMOVE FROM LISTS] No modifications needed for event: ${table.title}`);
    }
    
  } catch (error) {
    console.error('[REMOVE FROM LISTS] Error:', error);
    // Don't throw the error - we don't want to fail the check-in if gear list removal fails
  }
}

// Add new gear to inventory
app.post('/api/gear-inventory', authenticate, async (req, res) => {
  const { label, category, serial, quantity = 1 } = req.body;
  if (!label || !category) {
    return res.status(400).json({ error: 'Label and category are required' });
  }
  
  // Validate quantity
  if (quantity < 1 || !Number.isInteger(quantity)) {
    return res.status(400).json({ error: 'Quantity must be a positive integer' });
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
      serial: serialValue,
      quantity
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
    const { label, category, serial, quantity = 1 } = req.body;
    
    if (!gearId) return res.status(400).json({ error: 'Missing gear ID' });
    if (!label || !category) return res.status(400).json({ error: 'Label and category are required' });
    
    // Validate quantity
    if (quantity < 1 || !Number.isInteger(quantity)) {
      return res.status(400).json({ error: 'Quantity must be a positive integer' });
    }
    
    const gear = await GearInventory.findById(gearId);
    if (!gear) return res.status(404).json({ error: 'Gear not found' });
    
    // Don't allow editing of checked out gear (for single-quantity items)
    if (gear.quantity === 1 && gear.status === 'checked_out') {
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
    gear.quantity = quantity;
    
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

// Release all reservations for a gear item
app.post('/api/gear-inventory/:id/release-all', authenticate, async (req, res) => {
  try {
    const gearId = req.params.id;
    if (!gearId) return res.status(400).json({ error: 'Missing gear ID' });
    
    const gear = await GearInventory.findById(gearId);
    if (!gear) return res.status(404).json({ error: 'Gear not found' });
    
    console.log(`[Release All] Starting release for gear: ${gear.label} (${gear._id})`);
    console.log(`[Release All] Current reservations: ${gear.reservations?.length || 0}`);
    console.log(`[Release All] Current history entries: ${gear.history?.length || 0}`);
    
    // Step 1: Clear all reservations and history from the gear item
    gear.reservations = [];
    gear.history = [];
    
    // Reset status for single-quantity items
    if (gear.quantity === 1) {
      gear.status = 'available';
      gear.checkedOutBy = null;
      gear.checkedOutEvent = null;
      gear.checkOutDate = null;
      gear.checkInDate = null;
    }
    
    await gear.save();
    
    // Step 2: Remove this gear item from all gear lists in all events
    console.log(`[Release All] Removing ${gear.label} from all gear lists...`);
    console.log(`[Release All] Looking for gear with ID: ${gearId} and label: "${gear.label}"`);
    
    // Find all tables that might have this gear item in their gear lists
    const allTables = await Table.find({
      'gear.lists': { $exists: true }
    });
    
    console.log(`[Release All] Found ${allTables.length} tables with gear lists to check`);
    
    let removedFromEvents = 0;
    let totalItemsRemoved = 0;
    const affectedEventTitles = [];
    
    for (const table of allTables) {
      let tableModified = false;
      const lists = table.gear?.lists || new Map();
      
      console.log(`[Release All] Checking table: ${table.title} (${table._id})`);
      console.log(`[Release All] Lists type: ${lists.constructor.name}, size: ${lists instanceof Map ? lists.size : Object.keys(lists).length}`);
      
      // Convert Map to Object if needed for consistent iteration
      let listsObj;
      if (lists instanceof Map) {
        listsObj = Object.fromEntries(lists);
      } else if (lists && lists._doc) {
        // Handle Mongoose Map - the actual data is in _doc
        listsObj = lists._doc;
      } else {
        listsObj = lists;
      }
      
      // Log the structure of the gear lists for debugging
      console.log(`[Release All] Gear lists structure for ${table.title}:`, Object.keys(listsObj));
      
      // Iterate through each list in the table
      for (const [listName, listData] of Object.entries(listsObj)) {
        if (!listData || typeof listData !== 'object') {
          console.log(`[Release All] Skipping invalid list data for ${listName}`);
          continue;
        }
        
        console.log(`[Release All] Checking list: ${listName}`);
        
        // Handle the case where listData might also be a Mongoose document
        let actualListData = listData;
        if (listData._doc) {
          actualListData = listData._doc;
        }
        
        console.log(`[Release All] List data structure:`, Object.keys(actualListData));
        
        // Iterate through each category in the list
        let categoriesToCheck = actualListData;
        
        // Check if the list has a 'categories' property (new structure)
        if (actualListData.categories && typeof actualListData.categories === 'object') {
          console.log(`[Release All] Found categories structure in ${listName}`);
          categoriesToCheck = actualListData.categories;
          
          // Handle case where categories might also be a Mongoose document
          if (categoriesToCheck._doc) {
            categoriesToCheck = categoriesToCheck._doc;
          }
        }
        
        console.log(`[Release All] Categories to check:`, Object.keys(categoriesToCheck));
        
        for (const [categoryName, items] of Object.entries(categoriesToCheck)) {
          if (!Array.isArray(items)) {
            console.log(`[Release All] Skipping non-array category: ${categoryName}`);
            continue;
          }
          
          console.log(`[Release All] Checking category: ${categoryName} with ${items.length} items`);
          
          // Log all items in this category for debugging
          items.forEach((item, index) => {
            console.log(`[Release All] Item ${index}: inventoryId="${item.inventoryId}", label="${item.label}"`);
          });
          
          // Filter out items that match this gear (by inventoryId or label)
          const originalLength = items.length;
          const filteredItems = items.filter(item => {
            // Match by inventoryId (primary) or label (fallback)
            const matchesId = item.inventoryId && item.inventoryId.toString() === gearId.toString();
            const matchesLabel = item.label && (
              item.label === gear.label || 
              item.label.startsWith(gear.label + ' (') // Handle quantity labels like "Sony NP-FZ100 (5 units)"
            );
            
            console.log(`[Release All] Comparing item: inventoryId="${item.inventoryId}" vs "${gearId}", label="${item.label}" vs "${gear.label}"`);
            console.log(`[Release All] Match results: matchesId=${matchesId}, matchesLabel=${matchesLabel}`);
            
            if (matchesId || matchesLabel) {
              console.log(`[Release All] MATCH FOUND! Removing item from ${table.title} -> ${listName} -> ${categoryName}: ${item.label || item.inventoryId}`);
              return false; // Remove this item
            }
            return true; // Keep this item
          });
          
          if (filteredItems.length !== originalLength) {
            categoriesToCheck[categoryName] = filteredItems;
            tableModified = true;
            totalItemsRemoved += (originalLength - filteredItems.length);
            console.log(`[Release All] Removed ${originalLength - filteredItems.length} items from ${categoryName}`);
          }
        }
      }
      
      // Save the table if it was modified
      if (tableModified) {
        // Convert back to Map if the original was a Map
        if (lists instanceof Map) {
          table.gear.lists = new Map(Object.entries(listsObj));
        } else {
          table.gear.lists = listsObj;
        }
        
        await table.save();
        removedFromEvents++;
        affectedEventTitles.push(table.title);
        console.log(`[Release All] Updated gear lists for event: ${table.title}`);
        
        // Notify clients about the gear list change
        notifyDataChange('gearListUpdated', { 
          message: `${gear.label} removed from all lists due to release all` 
        }, table._id.toString());
      } else {
        console.log(`[Release All] No modifications needed for table: ${table.title}`);
      }
    }
    
    console.log(`[Release All] Successfully released all reservations for ${gear.label}`);
    console.log(`[Release All] Removed from ${removedFromEvents} events, total ${totalItemsRemoved} items removed from gear lists`);
    
    res.json({ 
      message: `All reservations released for ${gear.label}. Removed from ${removedFromEvents} event(s).`,
      gear: gear,
      releasedReservations: true,
      removedFromLists: totalItemsRemoved,
      affectedEvents: removedFromEvents,
      affectedEventTitles: affectedEventTitles,
      reservationCount: gear.reservations?.length || 0
    });
    
  } catch (error) {
    console.error('[Release All] Error:', error);
    res.status(500).json({ error: 'Failed to release reservations: ' + error.message });
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

// Get all events/tables that contain a specific gear item
app.get('/api/events/by-gear/:gearId', authenticate, async (req, res) => {
  try {
    const gearId = req.params.gearId;
    if (!gearId) {
      return res.status(400).json({ error: 'Gear ID is required' });
    }

    // First, get the gear item with populated user references
    const gearItem = await GearInventory.findById(gearId)
      .populate('checkedOutBy', 'fullName email')
      .populate('reservations.userId', 'fullName email')
      .populate('history.user', 'fullName email');
      
    if (!gearItem) {
      return res.status(404).json({ error: 'Gear item not found' });
    }

    console.log(`[Events by Gear] Looking for events containing gear: ${gearItem.label} (${gearId})`);
    console.log(`[Events by Gear] User role: ${req.user.role}, User ID: ${req.user.id}`);

    // Find tables based on user role
    let tables;
    if (req.user.role === 'admin') {
      // Admin can see all tables
      tables = await Table.find({});
      console.log(`[Events by Gear] Admin user - found ${tables.length} total tables`);
    } else {
      // Regular users can only see tables they own or are shared with
      tables = await Table.find({
        $or: [
          { owners: req.user.id },
          { sharedWith: req.user.id }
        ]
      });
      console.log(`[Events by Gear] Regular user - found ${tables.length} accessible tables`);
    }

    console.log(`[Events by Gear] Found ${tables.length} accessible tables:`);
    tables.forEach(table => {
      console.log(`[Events by Gear] - Table ID: ${table._id.toString()}, Title: "${table.title}"`);
    });

    const eventsWithGear = [];
    const eventIds = new Set(); // To avoid duplicates

    // Method 1: Check gear lists in events
    for (const table of tables) {
      if (table.gear && table.gear.lists) {
        const lists = table.gear.lists instanceof Map ? 
          Object.fromEntries(table.gear.lists) : table.gear.lists;
        
        for (const [listName, listData] of Object.entries(lists)) {
          if (!listData || !listData.categories) continue;
          
          for (const [categoryName, items] of Object.entries(listData.categories)) {
            if (!Array.isArray(items)) continue;
            
            const hasMatchingItem = items.some(item => {
              if (item.label === gearItem.label) return true;
              if (item.gearId && item.gearId === gearId) return true;
              if (item.inventoryId && item.inventoryId === gearId) return true;
              return false;
            });
            
            if (hasMatchingItem && !eventIds.has(table._id.toString())) {
              eventIds.add(table._id.toString());
              console.log(`[Events by Gear] Found ${gearItem.label} in event gear list: ${table.title}`);
              
              eventsWithGear.push({
                _id: table._id,
                title: table.title,
                startDate: table.gear?.checkOutDate || table.general?.start,
                endDate: table.gear?.checkInDate || table.general?.end,
                location: table.general?.location,
                client: table.general?.client,
                isOwner: table.owners.includes(req.user.id),
                isShared: table.sharedWith.includes(req.user.id),
                isAdmin: req.user.role === 'admin',
                associationType: 'gear_list',
                gearListDetails: {
                  listName,
                  categoryName
                }
              });
              break;
            }
          }
        }
      }
    }

    // Method 2: Check gear item reservations for event associations
    if (gearItem.reservations && gearItem.reservations.length > 0) {
      for (const reservation of gearItem.reservations) {
        if (reservation.eventId) {
          console.log(`[Events by Gear] Checking reservation with event ID: ${reservation.eventId}`);
          
          const reservationEventId = reservation.eventId.toString();
          const table = tables.find(t => t._id.toString() === reservationEventId);
          
          if (table && !eventIds.has(table._id.toString())) {
            eventIds.add(table._id.toString());
            console.log(`[Events by Gear] Found ${gearItem.label} reserved for event: ${table.title}`);
            
            eventsWithGear.push({
              _id: table._id,
              title: table.title,
              startDate: reservation.checkOutDate || table.gear?.checkOutDate || table.general?.start,
              endDate: reservation.checkInDate || table.gear?.checkInDate || table.general?.end,
              location: table.general?.location,
              client: table.general?.client,
              isOwner: table.owners.includes(req.user.id),
              isShared: table.sharedWith.includes(req.user.id),
              isAdmin: req.user.role === 'admin',
              associationType: 'reservation',
              reservationDetails: {
                checkOutDate: reservation.checkOutDate,
                checkInDate: reservation.checkInDate,
                quantity: reservation.quantity,
                reservedBy: reservation.userId ? {
                  _id: reservation.userId._id,
                  name: reservation.userId.fullName,
                  email: reservation.userId.email
                } : null,
                createdAt: reservation.createdAt
              }
            });
          } else if (!table) {
            console.log(`[Events by Gear] No accessible table found for reservation event ID: ${reservationEventId}`);
          }
        }
      }
    }

    // Method 3: Check gear item history for event associations - THIS IS THE KEY FIX
    if (gearItem.history && gearItem.history.length > 0) {
      console.log(`[Events by Gear] Checking ${gearItem.history.length} history entries for ${gearItem.label}`);
      
      for (const historyEntry of gearItem.history) {
        if (historyEntry.event) {
          console.log(`[Events by Gear] Checking history entry with event ObjectId: ${historyEntry.event}`);
          console.log(`[Events by Gear] Event ObjectId type: ${typeof historyEntry.event}, value: "${historyEntry.event}"`);
          console.log(`[Events by Gear] Event ObjectId constructor: ${historyEntry.event.constructor.name}`);
          console.log(`[Events by Gear] Raw event object:`, historyEntry.event);
          
          // Convert the ObjectId to string for comparison
          const historyEventId = historyEntry.event.toString();
          console.log(`[Events by Gear] Converted to string: "${historyEventId}"`);
          console.log(`[Events by Gear] String length: ${historyEventId.length}`);
          
          // Log all available tables for comparison
          console.log(`[Events by Gear] Available tables for comparison:`);
          tables.forEach((table, index) => {
            const tableId = table._id.toString();
            console.log(`[Events by Gear]   ${index + 1}. Table ID: "${tableId}" (length: ${tableId.length}), Title: "${table.title}"`);
            console.log(`[Events by Gear]      Exact match check: "${historyEventId}" === "${tableId}" = ${historyEventId === tableId}`);
            console.log(`[Events by Gear]      Case-insensitive match: ${historyEventId.toLowerCase() === tableId.toLowerCase()}`);
            console.log(`[Events by Gear]      Includes check: "${tableId}".includes("${historyEventId}") = ${tableId.includes(historyEventId)}`);
          });
          
          // Find the matching table by comparing _id
          const table = tables.find(t => {
            const tableId = t._id.toString();
            console.log(`[Events by Gear] Comparing history event ID "${historyEventId}" with table ID "${tableId}" for table "${t.title}"`);
            const isMatch = tableId === historyEventId;
            console.log(`[Events by Gear] Match result: ${isMatch}`);
            return isMatch;
          });
          
          if (table && !eventIds.has(table._id.toString())) {
            eventIds.add(table._id.toString());
            console.log(`[Events by Gear] ✅ MATCH FOUND! ${gearItem.label} in history for event: ${table.title}`);
            
            eventsWithGear.push({
              _id: table._id,
              title: table.title,
              startDate: historyEntry.checkOutDate || table.gear?.checkOutDate || table.general?.start,
              endDate: historyEntry.checkInDate || table.gear?.checkInDate || table.general?.end,
              location: table.general?.location,
              client: table.general?.client,
              isOwner: table.owners.includes(req.user.id),
              isShared: table.sharedWith.includes(req.user.id),
              isAdmin: req.user.role === 'admin',
              associationType: 'history',
              historyDetails: {
                checkOutDate: historyEntry.checkOutDate,
                checkInDate: historyEntry.checkInDate,
                quantity: historyEntry.quantity,
                reservedBy: historyEntry.user ? {
                  _id: historyEntry.user._id,
                  name: historyEntry.user.fullName,
                  email: historyEntry.user.email
                } : null
              }
            });
          } else if (!table) {
            console.log(`[Events by Gear] ❌ No accessible table found for history event ID: ${historyEventId}`);
            console.log(`[Events by Gear] Available table IDs: [${tables.map(t => `"${t._id.toString()}"`).join(', ')}]`);
            
            // Additional debugging: Check if the event exists in ALL tables (not just accessible ones)
            console.log(`[Events by Gear] Checking if event exists in ALL tables (including non-accessible)...`);
            const allTables = await Table.find({});
            console.log(`[Events by Gear] Total tables in database: ${allTables.length}`);
            
            const matchingTableInAll = allTables.find(t => t._id.toString() === historyEventId);
            if (matchingTableInAll) {
              console.log(`[Events by Gear] ⚠️ Event found in database but user doesn't have access: "${matchingTableInAll.title}"`);
              console.log(`[Events by Gear] Table owners: [${matchingTableInAll.owners.map(o => o.toString()).join(', ')}]`);
              console.log(`[Events by Gear] Table sharedWith: [${matchingTableInAll.sharedWith.map(s => s.toString()).join(', ')}]`);
              console.log(`[Events by Gear] Current user ID: ${req.user.id}`);
              
              // For non-admin users, add the event with limited access info
              if (req.user.role !== 'admin' && !eventIds.has(matchingTableInAll._id.toString())) {
                eventIds.add(matchingTableInAll._id.toString());
                console.log(`[Events by Gear] Adding limited access event for regular user: ${matchingTableInAll.title}`);
                
                eventsWithGear.push({
                  _id: matchingTableInAll._id,
                  title: matchingTableInAll.title,
                  startDate: historyEntry.checkOutDate || matchingTableInAll.gear?.checkOutDate || matchingTableInAll.general?.start,
                  endDate: historyEntry.checkInDate || matchingTableInAll.gear?.checkInDate || matchingTableInAll.general?.end,
                  location: matchingTableInAll.general?.location,
                  client: matchingTableInAll.general?.client,
                  isOwner: false,
                  isShared: false,
                  isAdmin: false,
                  hasLimitedAccess: true,
                  associationType: 'history',
                  historyDetails: {
                    checkOutDate: historyEntry.checkOutDate,
                    checkInDate: historyEntry.checkInDate,
                    quantity: historyEntry.quantity,
                    reservedBy: historyEntry.user ? {
                      _id: historyEntry.user._id,
                      name: historyEntry.user.fullName,
                      email: historyEntry.user.email
                    } : null
                  }
                });
              }
            } else {
              console.log(`[Events by Gear] ❌ Event not found in database at all - may have been deleted`);
            }
          } else {
            console.log(`[Events by Gear] Table ${table.title} already added to results`);
          }
        } else {
          console.log(`[Events by Gear] History entry has no event field`);
        }
      }
    }

    // Method 4: Check if gear is currently checked out to an event
    if (gearItem.status === 'checked_out' && gearItem.checkedOutEvent) {
      console.log(`[Events by Gear] Checking current checkout with event ID: ${gearItem.checkedOutEvent}`);
      
      const checkedOutEventId = gearItem.checkedOutEvent.toString();
      const table = tables.find(t => t._id.toString() === checkedOutEventId);
      
      if (table && !eventIds.has(table._id.toString())) {
        eventIds.add(table._id.toString());
        console.log(`[Events by Gear] Found ${gearItem.label} currently checked out to event: ${table.title}`);
        
        eventsWithGear.push({
          _id: table._id,
          title: table.title,
          startDate: gearItem.checkOutDate || table.gear?.checkOutDate || table.general?.start,
          endDate: gearItem.checkInDate || table.gear?.checkInDate || table.general?.end,
          location: table.general?.location,
          client: table.general?.client,
          isOwner: table.owners.includes(req.user.id),
          isShared: table.sharedWith.includes(req.user.id),
          isAdmin: req.user.role === 'admin',
          associationType: 'checked_out',
          checkoutDetails: {
            checkOutDate: gearItem.checkOutDate,
            checkInDate: gearItem.checkInDate,
            checkedOutBy: gearItem.checkedOutBy ? {
              _id: gearItem.checkedOutBy._id,
              name: gearItem.checkedOutBy.fullName,
              email: gearItem.checkedOutBy.email
            } : null
          }
        });
      } else if (!table) {
        console.log(`[Events by Gear] No accessible table found for checked out event ID: ${checkedOutEventId}`);
      }
    }

    // Sort events by start date (most recent first)
    eventsWithGear.sort((a, b) => {
      const dateA = new Date(a.startDate || '1970-01-01');
      const dateB = new Date(b.startDate || '1970-01-01');
      return dateB - dateA;
    });

    console.log(`[Events by Gear] Final result: Found ${eventsWithGear.length} events containing ${gearItem.label}`);
    eventsWithGear.forEach(event => {
      console.log(`[Events by Gear] - Event: "${event.title}" (${event.associationType}${event.hasLimitedAccess ? ' - Limited Access' : ''})`);
    });

    res.json(eventsWithGear);

  } catch (error) {
    console.error('[Events by Gear] Error:', error);
    res.status(500).json({ error: 'Failed to fetch events for gear item: ' + error.message });
  }
});

// Test endpoint to debug gear item associations
app.get('/api/debug/gear/:gearId', authenticate, async (req, res) => {
  try {
    const gearId = req.params.gearId;
    const gearItem = await GearInventory.findById(gearId);
    
    if (!gearItem) {
      return res.status(404).json({ error: 'Gear item not found' });
    }
    
    console.log(`[DEBUG] Gear item ${gearItem.label} debug info:`);
    console.log(`[DEBUG] - Reservations:`, gearItem.reservations);
    console.log(`[DEBUG] - History:`, gearItem.history);
    console.log(`[DEBUG] - Status:`, gearItem.status);
    console.log(`[DEBUG] - Checked out event:`, gearItem.checkedOutEvent);
    
    // Find all tables
    const allTables = await Table.find();
    console.log(`[DEBUG] - Total tables in database:`, allTables.length);
    
    // Find accessible tables
    const accessibleTables = await Table.find({
      $or: [
        { owners: req.user.id },
        { sharedWith: req.user.id }
      ]
    });
    console.log(`[DEBUG] - Accessible tables:`, accessibleTables.length);
    
    res.json({
      gearItem: {
        _id: gearItem._id,
        label: gearItem.label,
        reservations: gearItem.reservations,
        history: gearItem.history,
        status: gearItem.status,
        checkedOutEvent: gearItem.checkedOutEvent
      },
      totalTables: allTables.length,
      accessibleTables: accessibleTables.length,
      tableIds: accessibleTables.map(t => ({ id: t._id.toString(), title: t.title }))
    });
  } catch (error) {
    console.error('[DEBUG] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DOCUMENT MANAGEMENT ENDPOINTS

// Get all documents for an event
app.get('/api/tables/:id/documents', authenticate, async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
      return res.status(403).json({ error: 'Not authorized or not found' });
    }
    
    res.json(table.documents || []);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Get a specific document
app.get('/api/tables/:id/documents/:documentId', authenticate, async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table || (!table.owners.includes(req.user.id) && !table.sharedWith.includes(req.user.id))) {
      return res.status(403).json({ error: 'Not authorized or not found' });
    }
    
    const document = table.documents.id(req.params.documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(document);
  } catch (err) {
    console.error('Error fetching document:', err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// Upload a new document
app.post('/api/tables/:id/documents', authenticate, upload.single('file'), async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table || !table.owners.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized or not found' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      // Clean the filename - remove extension for public_id since Cloudinary adds it automatically
      const cleanFilename = req.file.originalname.replace(/\.[^/.]+$/, ""); // Remove extension
      const sanitizedFilename = cleanFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
      
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image', // Use 'image' for all files including PDFs
          folder: `lumdash/events/${req.params.id}/documents`,
          public_id: `${Date.now()}_${sanitizedFilename}`, // Don't include extension here
          use_filename: false, // Don't use original filename to avoid conflicts
          unique_filename: true,
          // Ensure files are publicly accessible for viewing (not downloading)
          type: 'upload',
          access_mode: 'public',
          // For PDFs, add flags to prevent download and enable inline viewing
          ...(req.file.mimetype === 'application/pdf' && {
            flags: 'attachment:false'
          })
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(error);
          } else {
            // For PDFs, modify the URL to force inline viewing
            let finalUrl = result.secure_url;
            if (req.file.mimetype === 'application/pdf') {
              // For raw PDFs, we need to use a different approach
              // Replace the /raw/upload/ with /image/upload/ and add fl_attachment:false
              finalUrl = result.secure_url.replace('/raw/upload/', '/image/upload/fl_attachment:false/');
            }
            
            console.log('Cloudinary upload success:', {
              public_id: result.public_id,
              secure_url: result.secure_url,
              final_url: finalUrl,
              resource_type: result.resource_type,
              format: result.format
            });
            
            // Return the modified result
            resolve({
              ...result,
              secure_url: finalUrl
            });
          }
        }
      );
      uploadStream.end(req.file.buffer);
    });
    
    // Add document to table
    const newDocument = {
      originalName: req.file.originalname,
      cloudinaryPublicId: uploadResult.public_id,
      url: uploadResult.secure_url,
      fileType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user.id,
      uploadedAt: new Date()
    };
    
    table.documents.push(newDocument);
    await table.save();
    
    // Notify clients about the new document
    notifyDataChange('documentsChanged', null, req.params.id);
    
    res.json({
      message: 'Document uploaded successfully',
      document: table.documents[table.documents.length - 1]
    });
    
  } catch (err) {
    console.error('Error uploading document:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Delete a document
app.delete('/api/tables/:id/documents/:documentId', authenticate, async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table || !table.owners.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized or not found' });
    }
    
    const document = table.documents.id(req.params.documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Delete from Cloudinary
    try {
      // Determine resource type based on file type
      const resourceType = document.fileType === 'application/pdf' ? 'raw' : 'image';
      await cloudinary.uploader.destroy(document.cloudinaryPublicId, { resource_type: resourceType });
      console.log(`Deleted from Cloudinary: ${document.cloudinaryPublicId} (${resourceType})`);
    } catch (cloudinaryError) {
      console.error('Error deleting from Cloudinary:', cloudinaryError);
      // Continue with database deletion even if Cloudinary deletion fails
    }
    
    // Remove from database
    table.documents.pull(req.params.documentId);
    await table.save();
    
    // Notify clients about the document deletion
    notifyDataChange('documentsChanged', null, req.params.id);
    
    res.json({ message: 'Document deleted successfully' });
    
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

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

// Convert PDF to image
app.post('/api/tables/:id/documents/:documentId/convert-to-image', authenticate, async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table || !table.owners.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized or not found' });
    }
    
    const document = table.documents.id(req.params.documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    if (document.fileType !== 'application/pdf') {
      return res.status(400).json({ error: 'Document is not a PDF' });
    }
    
    // Create image URL using Cloudinary transformation
    const imageUrl = cloudinary.url(document.cloudinaryPublicId, {
      resource_type: 'image',
      format: 'jpg',
      quality: 'auto',
      width: 1200,
      crop: 'limit'
    });
    
    console.log('Generated image URL for PDF:', imageUrl);
    
    res.json({
      message: 'PDF conversion URL generated',
      imageUrl: imageUrl,
      originalDocument: document
    });
    
  } catch (err) {
    console.error('Error converting PDF to image:', err);
    res.status(500).json({ error: 'Failed to convert PDF to image' });
  }
});

// Get specific document
app.get('/api/tables/:id/documents/:documentId', authenticate, async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const document = table.documents.id(req.params.documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

// Serve PDF for inline viewing (prevents download)
app.get('/api/tables/:id/documents/:documentId/view', authenticate, async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const document = table.documents.id(req.params.documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // For PDFs, redirect to Cloudinary URL with inline viewing parameters
    if (document.fileType === 'application/pdf') {
      const inlineUrl = document.url + (document.url.includes('?') ? '&' : '?') + 'inline=true';
      res.redirect(inlineUrl);
    } else {
      // For images, just redirect to the URL
      res.redirect(document.url);
    }
  } catch (error) {
    console.error('View document error:', error);
    res.status(500).json({ error: 'Failed to view document' });
  }
});
