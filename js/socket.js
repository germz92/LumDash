/**
 * socket.js - Global Socket.IO setup for real-time updates across the SPA
 */

(function() {
  // Check if Socket.IO is available
  if (typeof io === 'undefined') {
    console.warn('Socket.IO not loaded! Real-time updates will not work.');
    // Create a dummy socket object with no-op functions to prevent errors
    window.socket = {
      on: function() {},
      emit: function() {},
      disconnect: function() {},
      connected: false
    };
    return;
  }

  // Use the global API_BASE from config.js
  // The Socket.IO client should connect to the same URL as the API
  
  // Initialize the global socket connection
  const socket = io(API_BASE);
  
  // Store connection status
  let connected = false;
  
  // Connection events
  socket.on('connect', () => {
    console.log('🔌 Socket.IO connected');
    connected = true;
    
    // Notify the UI if needed
    if (window.updateConnectionStatus) {
      window.updateConnectionStatus(true);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Socket.IO disconnected');
    connected = false;
    
    // Notify the UI if needed
    if (window.updateConnectionStatus) {
      window.updateConnectionStatus(false);
    }
  });
  
  socket.on('connect_error', (error) => {
    console.error('Socket.IO connection error:', error);
    connected = false;
  });
  
  // Export socket to window for global access
  window.socket = socket;
  
  // Helper function to check if socket is connected
  window.isSocketConnected = function() {
    return connected;
  };
  
  // Debug: log all received events when in development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const originalOn = socket.on;
    socket.on = function(eventName, callback) {
      return originalOn.call(this, eventName, function() {
        if (!['connect', 'disconnect', 'connect_error'].includes(eventName)) {
          console.log(`🔔 Socket event received: ${eventName}`);
        }
        return callback.apply(this, arguments);
      });
    };
  }
  
  // List of known event types for documentation
  window.SOCKET_EVENTS = {
    // User events
    USERS_CHANGED: 'usersChanged',
    
    // Schedule events
    SCHEDULE_CHANGED: 'scheduleChanged',
    
    // Gear events
    GEAR_CHANGED: 'gearChanged',
    
    // Crew events
    CREW_CHANGED: 'crewChanged',
    
    // General info events
    GENERAL_CHANGED: 'generalChanged',
    
    // Travel & accommodation events
    TRAVEL_CHANGED: 'travelChanged',
    
    // Card log events
    CARDS_CHANGED: 'cardsChanged',
    
    // Notes events
    NOTES_CHANGED: 'notesChanged',
    
    // Table/Event events
    TABLE_CREATED: 'tableCreated',
    TABLE_UPDATED: 'tableUpdated',
    TABLE_DELETED: 'tableDeleted',
    TABLE_ARCHIVED: 'tableArchived'
  };
  
  // Attach common Socket.IO event listeners that can be used by many pages
  socket.on(window.SOCKET_EVENTS.SCHEDULE_CHANGED, (data) => {
    console.log('Schedule changed! Checking if relevant...');
    
    // Use getCurrentTableId if available, otherwise fallback to localStorage
    let currentEventId;
    if (window.getCurrentTableId) {
      currentEventId = window.getCurrentTableId();
    } else {
      currentEventId = localStorage.getItem('eventId');
    }
    
    console.log(`Current event ID: ${currentEventId}, update for: ${data?.tableId}`);
    
    // Only reload if it's for the current table
    if (data && data.tableId && data.tableId !== currentEventId) {
      console.log('Update was for a different event, ignoring');
      return;
    }
    
    // Each page script should implement its own handler for this event
    // if this page is displaying the schedule
    if (window.loadPrograms && currentEventId) {
      console.log('Reloading schedule for current event');
      window.loadPrograms(currentEventId);
    }
  });
  
  socket.on(window.SOCKET_EVENTS.GEAR_CHANGED, (data) => {
    console.log('Gear changed! Checking if relevant...');
    
    // Use getCurrentTableId if available, otherwise fallback to localStorage
    let currentEventId;
    if (window.getCurrentTableId) {
      currentEventId = window.getCurrentTableId();
    } else {
      currentEventId = localStorage.getItem('eventId');
    }
    
    console.log(`Current event ID: ${currentEventId}, update for: ${data?.tableId}`);
    
    // Only reload if it's for the current table
    if (data && data.tableId && data.tableId !== currentEventId) {
      console.log('Update was for a different event, ignoring');
      return;
    }
    
    // Check if user is actively editing to prevent disruptions
    if (window.isActiveEditing) {
      console.log('User is currently editing, setting pending reload flag');
      window.pendingReload = true;
      window.pendingReloadTableId = data?.tableId || currentEventId;
      return;
    }
    
    // Each page script should implement its own handler for this event
    // if this page is displaying gear
    if (window.loadGear && currentEventId) {
      console.log('Reloading gear for current event');
      window.loadGear();
    }
  });
  
  socket.on(window.SOCKET_EVENTS.USERS_CHANGED, (data) => {
    console.log('Users changed! Reloading data...');
    // No tableId check needed for users since it's a global admin function
    // Only reload if the current page displays users
    if (window.loadUsers) {
      window.loadUsers();
    }
  });
  
  socket.on(window.SOCKET_EVENTS.NOTES_CHANGED, (data) => {
    console.log('Notes changed! Checking if relevant...');
    
    // Use getCurrentTableId if available, otherwise fallback to localStorage
    let currentEventId;
    if (window.getCurrentTableId) {
      currentEventId = window.getCurrentTableId();
    } else {
      currentEventId = localStorage.getItem('eventId');
    }
    
    console.log(`Current event ID: ${currentEventId}, update for: ${data?.tableId}`);
    
    // Only reload if it's for the current table
    if (data && data.tableId && data.tableId !== currentEventId) {
      console.log('Update was for a different event, ignoring');
      return;
    }
    
    // Handle notes updates if the page has the right function
    if (window.fetchNotes) {
      console.log('Reloading notes for current event');
      window.fetchNotes().then(data => {
        if (window.renderNotes) {
          window.renderNotes(data.adminNotes || []);
        }
      }).catch(e => {
        console.error('Error refreshing notes:', e);
      });
    }
  });
  
  // The other event handlers can be implemented similarly in the respective page scripts
  
  console.log('Socket.IO initialized globally');
})(); 