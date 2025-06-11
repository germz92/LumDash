// Simple Real-Time Collaboration for Schedule
// Clean implementation focused on core functionality

(function() {
'use strict';

// Simple state management
const collabState = {
  currentUser: null,
  activeEditors: new Map(), // fieldId -> {userId, userName, color}
  isEnabled: false,
  eventId: null
};

// User colors for editing indicators
const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
];

let colorIndex = 0;

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

function init(eventId, userId, userName) {
  // Generate unique session ID for this browser window/tab
  const sessionId = 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  
  collabState.eventId = eventId;
  collabState.currentUser = {
    id: userId,
    sessionId: sessionId, // Unique per browser window
    name: userName,
    color: USER_COLORS[colorIndex++ % USER_COLORS.length]
  };
  
  console.log('🔧 [DEBUG] Collaboration state initialized:');
  console.log('   Event ID:', eventId);
  console.log('   User ID:', userId);
  console.log('   Session ID:', sessionId);
  console.log('   User Name:', userName);
  console.log('   User Color:', collabState.currentUser.color);
  
  if (window.socket) {
    setupSocketListeners();
    attachFieldListeners();
    collabState.isEnabled = true;
    console.log('✅ Simple collaboration enabled for:', userName);
    console.log('🔌 Socket status:', window.socket.connected ? 'Connected' : 'Mock/Disconnected');
    
    // Join the event room for real-time collaboration
    if (window.socket.connected) {
      window.socket.emit('joinEventRoom', {
        eventId: eventId,
        userId: userId,
        userName: userName,
        userColor: collabState.currentUser.color
      });
      console.log(`📡 Joined event room for collaboration: event-${eventId}`);
    }
  } else {
    console.warn('⚠️ Socket not available - collaboration disabled');
  }
}

function setupSocketListeners() {
  // Listen for field changes from other users
  window.socket.on('fieldUpdated', (data) => {
    console.log('🔍 [DEBUG] Received fieldUpdated event:', data);
    if (data.eventId === collabState.eventId && data.sessionId !== collabState.currentUser.sessionId) {
      console.log('✅ [DEBUG] Processing remote field update');
      handleRemoteFieldChange(data);
    } else {
      console.log('❌ [DEBUG] Ignoring field update - eventId or sessionId mismatch');
      console.log(`   My eventId: ${collabState.eventId}, received: ${data.eventId}`);
      console.log(`   My sessionId: ${collabState.currentUser.sessionId}, received: ${data.sessionId}`);
    }
  });
  
  // Listen for editing status
  window.socket.on('userStartedEditing', (data) => {
    console.log('🔍 [DEBUG] Received userStartedEditing event:', data);
    if (data.eventId === collabState.eventId && data.sessionId !== collabState.currentUser.sessionId) {
      console.log('✅ [DEBUG] Processing editing indicator');
      showEditingIndicator(data);
    } else {
      console.log('❌ [DEBUG] Ignoring editing start - eventId or sessionId mismatch');
    }
  });
  
  window.socket.on('userStoppedEditing', (data) => {
    console.log('🔍 [DEBUG] Received userStoppedEditing event:', data);
    if (data.eventId === collabState.eventId && data.sessionId !== collabState.currentUser.sessionId) {
      console.log('✅ [DEBUG] Processing editing stop');
      hideEditingIndicator(data);
    } else {
      console.log('❌ [DEBUG] Ignoring editing stop - eventId or sessionId mismatch');
    }
  });

  // Listen for structural changes
  window.socket.on('programAdded', (data) => {
    console.log('🔍 [DEBUG] Received programAdded event:', data);
    console.log(`🔍 [DEBUG] Session comparison - My: ${collabState.currentUser.sessionId}, Received: ${data.sessionId}`);
    if (data.eventId === collabState.eventId && data.sessionId !== collabState.currentUser.sessionId) {
      console.log('✅ [DEBUG] Processing program addition from another user');
      handleRemoteProgramAdded(data);
    } else {
      console.log('❌ [DEBUG] Ignoring own program addition or eventId mismatch');
    }
  });

  window.socket.on('programDeleted', (data) => {
    console.log('🔍 [DEBUG] Received programDeleted event:', data);
    console.log(`🔍 [DEBUG] Session comparison - My: ${collabState.currentUser.sessionId}, Received: ${data.sessionId}`);
    if (data.eventId === collabState.eventId && data.sessionId !== collabState.currentUser.sessionId) {
      console.log('✅ [DEBUG] Processing program deletion from another user');
      handleRemoteProgramDeleted(data);
    } else {
      console.log('❌ [DEBUG] Ignoring own program deletion or eventId mismatch');
    }
  });

  window.socket.on('scheduleReloaded', (data) => {
    console.log('🔍 [DEBUG] Received scheduleReloaded event:', data);
    if (data.eventId === collabState.eventId && data.sessionId !== collabState.currentUser.sessionId) {
      console.log('✅ [DEBUG] Reloading schedule due to structural changes');
      handleRemoteScheduleReload();
    }
  });
}

function attachFieldListeners() {
  // Use event delegation for better performance
  document.addEventListener('focusin', handleFieldFocus);
  document.addEventListener('focusout', handleFieldBlur);
  document.addEventListener('input', handleFieldInput);
}

// =============================================================================
// FIELD EVENT HANDLERS
// =============================================================================

function handleFieldFocus(e) {
  if (!isScheduleField(e.target)) return;
  
  const fieldInfo = getFieldInfo(e.target);
  if (!fieldInfo) return;
  
  // Show local editing indicator
  e.target.style.borderLeft = `3px solid ${collabState.currentUser.color}`;
  
  // Broadcast editing status
  if (window.socket) {
    window.socket.emit('startEditing', {
      eventId: collabState.eventId,
      programId: fieldInfo.programId,
      field: fieldInfo.field,
      userId: collabState.currentUser.id,
      sessionId: collabState.currentUser.sessionId,
      userName: collabState.currentUser.name,
      color: collabState.currentUser.color
    });
  }
  
  console.log(`📝 Started editing: ${fieldInfo.field}`);
}

function handleFieldBlur(e) {
  if (!isScheduleField(e.target)) return;
  
  const fieldInfo = getFieldInfo(e.target);
  if (!fieldInfo) return;
  
  // Clear local editing indicator
  e.target.style.borderLeft = '';
  
  // Broadcast stop editing
  if (window.socket) {
    window.socket.emit('stopEditing', {
      eventId: collabState.eventId,
      programId: fieldInfo.programId,
      field: fieldInfo.field,
      userId: collabState.currentUser.id,
      sessionId: collabState.currentUser.sessionId
    });
  }
  
  console.log(`✅ Stopped editing: ${fieldInfo.field}`);
}

function handleFieldInput(e) {
  if (!isScheduleField(e.target)) return;
  
  const fieldInfo = getFieldInfo(e.target);
  if (!fieldInfo) return;
  
  const newValue = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  
  // Update local data immediately
  updateLocalData(fieldInfo.programId, fieldInfo.field, newValue);
  
  // Send update to others (debounced)
  debouncedSendUpdate(fieldInfo.programId, fieldInfo.field, newValue);
  
  console.log(`⚡ Field changed: ${fieldInfo.field} = ${newValue}`);
}

// =============================================================================
// UPDATE HANDLING
// =============================================================================

let updateTimeouts = {};

function debouncedSendUpdate(programId, field, value) {
  const key = `${programId}-${field}`;
  
  // Clear existing timeout
  if (updateTimeouts[key]) {
    clearTimeout(updateTimeouts[key]);
  }
  
  // Set new timeout
  updateTimeouts[key] = setTimeout(() => {
    sendFieldUpdate(programId, field, value);
    delete updateTimeouts[key];
  }, 300); // 300ms debounce
}

function sendFieldUpdate(programId, field, value) {
  if (!window.socket) return;
  
  window.socket.emit('updateField', {
    eventId: collabState.eventId,
    programId: programId,
    field: field,
    value: value,
    userId: collabState.currentUser.id,
    sessionId: collabState.currentUser.sessionId,
    userName: collabState.currentUser.name
  });
  
  console.log(`📡 Sent update: ${field} = ${value}`);
}

function handleRemoteFieldChange(data) {
  const { programId, field, value, userName } = data;
  
  // Find the field element
  const fieldElement = document.querySelector(
    `[data-program-id="${programId}"] [data-field="${field}"]`
  );
  
  if (!fieldElement) {
    console.warn(`Field not found: ${programId}-${field}`);
    return;
  }
  
  // Don't update if user is currently editing this field
  if (document.activeElement === fieldElement) {
    console.log(`⏸️ Skipping update - user is editing`);
    return;
  }
  
  // Update the field
  if (fieldElement.type === 'checkbox') {
    fieldElement.checked = value;
    // Update data attribute for checkbox consistency
    fieldElement.setAttribute('data-original-value', value ? 'true' : 'false');
  } else {
    fieldElement.value = value || '';
  }
  
  // Update local data
  updateLocalData(programId, field, value);
  
  // Visual feedback
  showUpdateFeedback(fieldElement, userName);
  
  console.log(`📥 Applied remote update: ${field} = ${value} from ${userName}`);
}

function updateLocalData(programId, field, value) {
  if (!window.tableData || !window.tableData.programs) return;
  
  const program = window.tableData.programs.find(p => p._id === programId);
  if (program) {
    program[field] = value;
  }
}

function showUpdateFeedback(element, userName) {
  // Yellow background flash
  element.style.background = '#fff3cd';
  element.style.transition = 'background 0.3s ease';
  
  setTimeout(() => {
    element.style.background = '';
  }, 1000);
  
  // Optional: Show who made the change
  const indicator = document.createElement('div');
  indicator.textContent = `Updated by ${userName}`;
  indicator.style.cssText = `
    position: absolute;
    top: -25px;
    right: 0;
    background: #28a745;
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    z-index: 1000;
    pointer-events: none;
  `;
  
  element.parentNode.style.position = 'relative';
  element.parentNode.appendChild(indicator);
  
  setTimeout(() => {
    indicator.remove();
  }, 2000);
}

// =============================================================================
// EDITING INDICATORS
// =============================================================================

function showEditingIndicator(data) {
  const { programId, field, userName, color } = data;
  const fieldKey = `${programId}-${field}`;
  
  // Store editor info
  collabState.activeEditors.set(fieldKey, { userName, color });
  
  // Find field element
  const fieldElement = document.querySelector(
    `[data-program-id="${programId}"] [data-field="${field}"]`
  );
  
  if (!fieldElement) return;
  
  // Add visual indicator
  fieldElement.style.borderLeft = `3px solid ${color}`;
  fieldElement.style.boxShadow = `0 0 0 1px ${color}40`;
  
  // Add editing badge
  let badge = fieldElement.parentNode.querySelector('.editing-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'editing-badge';
    badge.style.cssText = `
      position: absolute;
      top: -20px;
      left: 0;
      background: ${color};
      color: white;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: bold;
      z-index: 1000;
      white-space: nowrap;
    `;
    fieldElement.parentNode.style.position = 'relative';
    fieldElement.parentNode.appendChild(badge);
  }
  
  badge.textContent = `${userName} editing`;
  badge.style.background = color;
  
  console.log(`👤 ${userName} is editing ${field}`);
}

function hideEditingIndicator(data) {
  const { programId, field } = data;
  const fieldKey = `${programId}-${field}`;
  
  // Remove from active editors
  collabState.activeEditors.delete(fieldKey);
  
  // Find field element
  const fieldElement = document.querySelector(
    `[data-program-id="${programId}"] [data-field="${field}"]`
  );
  
  if (!fieldElement) return;
  
  // Clear visual indicators
  fieldElement.style.borderLeft = '';
  fieldElement.style.boxShadow = '';
  
  // Remove badge
  const badge = fieldElement.parentNode.querySelector('.editing-badge');
  if (badge) {
    badge.remove();
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function isScheduleField(element) {
  return element.closest('.program-entry') && 
         element.matches('input, textarea') && 
         element.hasAttribute('data-field');
}

function getFieldInfo(element) {
  const entry = element.closest('.program-entry');
  if (!entry) return null;
  
  return {
    programId: entry.getAttribute('data-program-id'),
    field: element.getAttribute('data-field')
  };
}

// =============================================================================
// STRUCTURAL CHANGE HANDLERS
// =============================================================================

function handleRemoteProgramAdded(data) {
  console.log(`📋 [COLLAB] ${data.userName} added a new program on ${data.date}`);
  
  // Reload the schedule to show the new program
  if (window.loadPrograms) {
    window.loadPrograms().then(() => {
      showNotification(`${data.userName} added a new program`, 'info');
    });
  }
}

function handleRemoteProgramDeleted(data) {
  console.log(`🗑️ [COLLAB] ${data.userName} deleted a program`);
  
  // Reload the schedule to reflect the deletion
  if (window.loadPrograms) {
    window.loadPrograms().then(() => {
      showNotification(`${data.userName} deleted a program`, 'info');
    });
  }
}

function handleRemoteScheduleReload() {
  console.log('🔄 [COLLAB] Schedule structure changed, reloading...');
  
  // Reload the entire schedule
  if (window.loadPrograms) {
    window.loadPrograms().then(() => {
      showNotification('Schedule updated by another user', 'info');
    });
  }
}

function showNotification(message, type = 'info') {
  // Simple notification system
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'info' ? '#4ECDC4' : '#FF6B6B'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-size: 14px;
    max-width: 300px;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  
  // Add animation CSS if not exists
  if (!document.getElementById('collab-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'collab-notification-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// =============================================================================
// STRUCTURAL CHANGE BROADCASTING
// =============================================================================

function broadcastProgramAdded(date, programData) {
  if (!window.socket) return;
  
  window.socket.emit('programAdded', {
    eventId: collabState.eventId,
    userId: collabState.currentUser.id,
    sessionId: collabState.currentUser.sessionId,
    userName: collabState.currentUser.name,
    date: date,
    program: programData
  });
  
  console.log(`📡 [BROADCAST] Program added on ${date}`);
}

function broadcastProgramDeleted(programData) {
  if (!window.socket) return;
  
  window.socket.emit('programDeleted', {
    eventId: collabState.eventId,
    userId: collabState.currentUser.id,
    sessionId: collabState.currentUser.sessionId,
    userName: collabState.currentUser.name,
    program: programData
  });
  
  console.log(`📡 [BROADCAST] Program deleted`);
}

function broadcastScheduleReload() {
  if (!window.socket) return;
  
  window.socket.emit('scheduleReloaded', {
    eventId: collabState.eventId,
    userId: collabState.currentUser.id,
    sessionId: collabState.currentUser.sessionId,
    userName: collabState.currentUser.name
  });
  
  console.log(`📡 [BROADCAST] Schedule structure changed`);
}

function cleanup() {
  // Remove event listeners
  document.removeEventListener('focusin', handleFieldFocus);
  document.removeEventListener('focusout', handleFieldBlur);
  document.removeEventListener('input', handleFieldInput);
  
  // Clear timeouts
  Object.values(updateTimeouts).forEach(clearTimeout);
  updateTimeouts = {};
  
  // Clear state
  collabState.activeEditors.clear();
  collabState.isEnabled = false;
  
  console.log('🧹 Simple collaboration cleaned up');
}

// =============================================================================
// EXPORT
// =============================================================================

window.SimpleCollab = {
  init,
  cleanup,
  isEnabled: () => collabState.isEnabled,
  getCurrentUser: () => collabState.currentUser,
  getActiveEditors: () => collabState.activeEditors,
  
  // Structural change broadcasting
  broadcastProgramAdded,
  broadcastProgramDeleted,
  broadcastScheduleReload,
  
  // Testing functions
  test: {
    simulateRemoteUpdate: (programId, field, value) => {
      handleRemoteFieldChange({
        programId, field, value, 
        userName: 'Test User',
        userId: 'test-user'
      });
    },
    
    showTestIndicator: (programId, field) => {
      showEditingIndicator({
        programId, field,
        userName: 'Test User',
        color: '#FF6B6B'
      });
    }
  }
};

})(); 