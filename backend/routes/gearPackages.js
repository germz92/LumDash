const express = require('express');
const router = express.Router();
const GearPackage = require('../models/GearPackage');

// Helper function to normalize user ID format
function normalizeUserId(id) {
  if (!id) return null;
  // First ensure it's a string
  const idStr = String(id);
  // Then clean up any MongoDB ObjectId artifacts if present
  return idStr.replace(/^new ObjectId\(['"](.+)['"]\)$/, '$1');
}

// Create a new gear package
router.post('/', async (req, res) => {
  try {
    console.log('[GearPackage] Received POST request to create package');
    
    // Log request details
    console.log('[GearPackage] Request body:', JSON.stringify(req.body, null, 2));
    console.log('[GearPackage] Raw User ID from token:', req.user?.id);
    console.log('[GearPackage] User ID type:', typeof req.user?.id);
    
    const { name, description, categories, inventoryIds } = req.body;
    
    // Validate required fields
    if (!name || !categories) {
      console.error('[GearPackage] Missing required fields:', { name: !!name, categories: !!categories });
      return res.status(400).json({ error: 'Name and categories are required' });
    }
    
    const userId = normalizeUserId(req.user.id);
    console.log('[GearPackage] Normalized user ID for save:', userId);
    
    // Create package document with user ID - req.user is set by authenticate middleware
    const gearPackage = new GearPackage({
      name,
      description,
      userId: userId, // Use normalized ID
      categories,
      inventoryIds: inventoryIds || []
    });
    
    console.log('[GearPackage] Package created, about to save:', gearPackage._id);
    
    // Save to database
    await gearPackage.save();
    
    console.log('[GearPackage] Package saved successfully with ID:', gearPackage._id);
    console.log('[GearPackage] Saved with user ID:', gearPackage.userId);
    
    // Create a log file entry
    const fs = require('fs');
    const logEntry = `${new Date().toISOString()} - Package saved: ${gearPackage._id} - User: ${userId} - Name: ${name}\n`;
    fs.appendFile('./logs/gear-packages.log', logEntry, err => {
      if (err) console.error('[GearPackage] Error writing to log file:', err);
    });
    
    res.status(201).json(gearPackage);
  } catch (err) {
    console.error('[GearPackage] Error creating gear package:', err);
    
    // Log detailed error information
    if (err.name === 'ValidationError') {
      console.error('[GearPackage] Validation error details:', err.errors);
      return res.status(400).json({ 
        error: 'Validation error', 
        details: Object.keys(err.errors).map(key => ({ 
          field: key, 
          message: err.errors[key].message 
        }))
      });
    }
    
    if (err.code === 11000) {
      console.error('[GearPackage] Duplicate key error:', err.keyValue);
      return res.status(409).json({ 
        error: 'Duplicate key error', 
        field: Object.keys(err.keyValue)[0] 
      });
    }
    
    res.status(500).json({ 
      error: 'Server error',
      message: err.message
    });
  }
});

// Get all gear packages for the current user
router.get('/', async (req, res) => {
  try {
    console.log('[GearPackage] Received GET request to list packages');
    console.log('[GearPackage] Raw User ID from token:', req.user?.id);
    console.log('[GearPackage] User ID type:', typeof req.user?.id);
    
    const userId = normalizeUserId(req.user.id);
    console.log('[GearPackage] Normalized User ID for query:', userId);
    
    // Test directly filtering by the normalized ID as a string
    const packages = await GearPackage.find({ userId: userId })
      .sort({ createdAt: -1 }) // Newest first
      .select('_id name description createdAt'); // Only return necessary fields
    
    console.log(`[GearPackage] Found ${packages.length} packages for user`);
    
    // Log the package IDs for debugging
    if (packages.length > 0) {
      console.log('[GearPackage] Package IDs found:', packages.map(p => p._id));
    } else {
      console.log('[GearPackage] No packages found - checking with alternative query approach');
      
      // Try a more flexible query approach - just log for now
      const allPackages = await GearPackage.find().limit(10);
      console.log(`[GearPackage] Total packages in database: ${allPackages.length}`);
      
      if (allPackages.length > 0) {
        // Map each package with diagnostic info
        const packageDetails = allPackages.map(p => ({ 
          id: p._id, 
          name: p.name,
          userId: p.userId,
          normalizedPackageUserId: normalizeUserId(p.userId),
          currentUserId: userId,
          matchesCurrent: normalizeUserId(p.userId) === userId
        }));
        
        console.log('[GearPackage] Package details:', JSON.stringify(packageDetails, null, 2));
        
        // Check if we can find ANY packages for this user with a flexible approach
        const userPackages = allPackages.filter(p => normalizeUserId(p.userId) === userId);
        if (userPackages.length > 0) {
          console.log('[GearPackage] Found packages with flexible query!', userPackages.length);
          
          // Since we found packages, return those instead
          return res.json(userPackages.map(p => ({
            _id: p._id,
            name: p.name,
            description: p.description,
            createdAt: p.createdAt
          })));
        }
      }
    }
    
    res.json(packages);
  } catch (err) {
    console.error('[GearPackage] Error fetching gear packages:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a specific gear package by ID
router.get('/:id', async (req, res) => {
  try {
    const gearPackage = await GearPackage.findOne({
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!gearPackage) {
      return res.status(404).json({ error: 'Package not found' });
    }
    
    res.json(gearPackage);
  } catch (err) {
    console.error('Error fetching gear package:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a gear package
router.put('/:id', async (req, res) => {
  try {
    const { name, description, categories, inventoryIds } = req.body;
    
    // Find and update
    const gearPackage = await GearPackage.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { 
        name, 
        description, 
        categories, 
        inventoryIds: inventoryIds || [],
        updatedAt: Date.now()
      },
      { new: true }
    );
    
    if (!gearPackage) {
      return res.status(404).json({ error: 'Package not found' });
    }
    
    res.json(gearPackage);
  } catch (err) {
    console.error('Error updating gear package:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a gear package
router.delete('/:id', async (req, res) => {
  try {
    const result = await GearPackage.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!result) {
      return res.status(404).json({ error: 'Package not found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting gear package:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 