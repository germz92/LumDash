// Simple Real-Time Collaboration for Schedule
// Clean implementation focused on core functionality

(function() {
'use strict';

// Simple state management
const collabState = {
  currentUser: null,
  activeEditors: new Map(), // fieldId -> {userId, userName, color}
  isEnabled: false,
  eventId: null,
  activeUsers: new Map() // userId -> { userName, color, joinedAt }
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
  // Safety check: Only initialize on schedule page
  if (!document.querySelector('.schedule-page')) {
    console.log('🚫 Simple collaboration disabled - not on schedule page');
    return;
  }

  const sessionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  
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
      
      // Emit schedule-specific join event
      window.socket.emit('joinScheduleCollaboration', {
        eventId: eventId,
        userId: userId,
        userName: userName,
        userColor: collabState.currentUser.color
      });
      
      console.log(`📡 Joined event room for schedule collaboration: event-${eventId}`);
      
      // Add current user to active users
      collabState.activeUsers.set(userId, {
        userName: userName,
        color: collabState.currentUser.color,
        joinedAt: Date.now()
      });
      updateActiveUsersDisplay();
    }
  } else {
    console.warn('⚠️ Socket not available - collaboration disabled');
  }
}

// Store handler references for proper cleanup
const socketHandlers = {};

function setupSocketListeners() {
  // Listen for field changes from other users
  socketHandlers.fieldUpdated = (data) => {
    // Safety check: Only process if on schedule page
    if (!document.querySelector('.schedule-page')) {
      return;
    }
    
    console.log('🔍 [DEBUG] Received fieldUpdated event:', data);
    if (data.eventId === collabState.eventId && data.sessionId !== collabState.currentUser.sessionId) {
      console.log('✅ [DEBUG] Processing remote field update');
      handleRemoteFieldChange(data);
    } else {
      console.log('❌ [DEBUG] Ignoring field update - eventId or sessionId mismatch');
      console.log(`   My eventId: ${collabState.eventId}, received: ${data.eventId}`);
      console.log(`   My sessionId: ${collabState.currentUser.sessionId}, received: ${data.sessionId}`);
    }
  };
  window.socket.on('fieldUpdated', socketHandlers.fieldUpdated);
  
  // Listen for editing status
  socketHandlers.userStartedEditing = (data) => {
    // Safety check: Only process if on schedule page
    if (!document.querySelector('.schedule-page')) {
      return;
    }
    
    console.log('🔍 [DEBUG] Received userStartedEditing event:', data);
    if (data.eventId === collabState.eventId && data.sessionId !== collabState.currentUser.sessionId) {
      console.log('✅ [DEBUG] Processing editing indicator');
      showEditingIndicator(data);
    } else {
      console.log('❌ [DEBUG] Ignoring editing start - eventId or sessionId mismatch');
    }
  };
  window.socket.on('userStartedEditing', socketHandlers.userStartedEditing);
  
  socketHandlers.userStoppedEditing = (data) => {
    // Safety check: Only process if on schedule page
    if (!document.querySelector('.schedule-page')) {
      return;
    }
    
    console.log('🔍 [DEBUG] Received userStoppedEditing event:', data);
    if (data.eventId === collabState.eventId && data.sessionId !== collabState.currentUser.sessionId) {
      console.log('✅ [DEBUG] Processing editing stop');
      hideEditingIndicator(data);
    } else {
      console.log('❌ [DEBUG] Ignoring editing stop - eventId or sessionId mismatch');
    }
  };
  window.socket.on('userStoppedEditing', socketHandlers.userStoppedEditing);

  // Listen for structural changes
  socketHandlers.programAdded = (data) => {
    // Safety check: Only process if on schedule page
    if (!document.querySelector('.schedule-page')) {
      return;
    }
    
    console.log('🔍 [DEBUG] Received programAdded event:', data);
    console.log(`🔍 [DEBUG] Session comparison - My: ${collabState.currentUser.sessionId}, Received: ${data.sessionId}`);
    if (data.eventId === collabState.eventId && data.sessionId !== collabState.currentUser.sessionId) {
      console.log('✅ [DEBUG] Processing program addition from another user');
      handleRemoteProgramAdded(data);
    } else {
      console.log('❌ [DEBUG] Ignoring own program addition or eventId mismatch');
    }
  };
  window.socket.on('programAdded', socketHandlers.programAdded);

  socketHandlers.programDeleted = (data) => {
    // Safety check: Only process if on schedule page
    if (!document.querySelector('.schedule-page')) {
      return;
    }
    
    console.log('🔍 [DEBUG] Received programDeleted event:', data);
    console.log(`🔍 [DEBUG] Session comparison - My: ${collabState.currentUser.sessionId}, Received: ${data.sessionId}`);
    if (data.eventId === collabState.eventId && data.sessionId !== collabState.currentUser.sessionId) {
      console.log('✅ [DEBUG] Processing program deletion from another user');
      handleRemoteProgramDeleted(data);
    } else {
      console.log('❌ [DEBUG] Ignoring own program deletion or eventId mismatch');
    }
  };
  window.socket.on('programDeleted', socketHandlers.programDeleted);

  socketHandlers.scheduleReloaded = (data) => {
    // Safety check: Only process if on schedule page
    if (!document.querySelector('.schedule-page')) {
      return;
    }
    
    console.log('🔍 [DEBUG] Received scheduleReloaded event:', data);
    if (data.eventId === collabState.eventId && data.sessionId !== collabState.currentUser.sessionId) {
      console.log('✅ [DEBUG] Reloading schedule due to structural changes');
      handleRemoteScheduleReload();
    }
  };
  window.socket.on('scheduleReloaded', socketHandlers.scheduleReloaded);

  // =============================================================================
  // USER PRESENCE HANDLERS (NEW)
  // =============================================================================

  // Listen for users joining the schedule collaboration room
  socketHandlers.scheduleUserJoined = (data) => {
    // Safety check: Only process if collaboration is enabled and on schedule page
    if (!collabState.isEnabled || !document.querySelector('.schedule-page')) {
      return;
    }
    
    console.log('👥 [DEBUG] Received scheduleUserJoined event:', data);
    if (data.userId !== collabState.currentUser.id) {
      console.log('✅ [DEBUG] Processing user joined');
      handleUserJoined(data);
    } else {
      console.log('❌ [DEBUG] Ignoring own join event');
    }
  };
  window.socket.on('scheduleUserJoined', socketHandlers.scheduleUserJoined);

  // Listen for users leaving the schedule collaboration room
  socketHandlers.scheduleUserLeft = (data) => {
    // Safety check: Only process if collaboration is enabled and on schedule page
    if (!collabState.isEnabled || !document.querySelector('.schedule-page')) {
      return;
    }
    
    console.log('👋 [DEBUG] Received scheduleUserLeft event:', data);
    if (data.userId !== collabState.currentUser.id) {
      console.log('✅ [DEBUG] Processing user left');
      handleUserLeft(data);
    } else {
      console.log('❌ [DEBUG] Ignoring own leave event');
    }
  };
  window.socket.on('scheduleUserLeft', socketHandlers.scheduleUserLeft);
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
  const { programId, field, userName, color, userId } = data;
  const fieldKey = `${programId}-${field}`;
  
  // Store editor info
  collabState.activeEditors.set(fieldKey, { userName, color, userId });
  
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

function hideEditingIndicatorByFieldKey(fieldKey) {
  // Remove from active editors
  collabState.activeEditors.delete(fieldKey);
  
  // Parse field key to get programId and field
  const [programId, field] = fieldKey.split('-');
  
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
  // Safety check: Only work on schedule page
  if (!document.querySelector('.schedule-page')) {
    return false;
  }
  
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
  // Define colors for different notification types
  const colors = {
    'info': '#4ECDC4',
    'join': '#45B7D1',
    'leave': '#FFA726',
    'error': '#FF6B6B',
    'success': '#4CAF50'
  };
  
  // Simple notification system
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${colors[type] || colors.info};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-size: 14px;
    max-width: 300px;
    animation: slideIn 0.3s ease-out;
  `;
  
  // Add icon based on type
  const icons = {
    'join': '👥',
    'leave': '👋',
    'info': 'ℹ️',
    'error': '❌',
    'success': '✅'
  };
  
  const icon = icons[type] || '';
  notification.textContent = `${icon} ${message}`.trim();
  
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
  console.log('🧹 [CLEANUP] Starting simple collaboration cleanup...');
  
  // Remove event listeners
  document.removeEventListener('focusin', handleFieldFocus);
  document.removeEventListener('focusout', handleFieldBlur);
  document.removeEventListener('input', handleFieldInput);
  
  // Remove socket event listeners using specific handler references
  if (window.socket) {
    if (socketHandlers.fieldUpdated) {
      window.socket.off('fieldUpdated', socketHandlers.fieldUpdated);
    }
    if (socketHandlers.userStartedEditing) {
      window.socket.off('userStartedEditing', socketHandlers.userStartedEditing);
    }
    if (socketHandlers.userStoppedEditing) {
      window.socket.off('userStoppedEditing', socketHandlers.userStoppedEditing);
    }
    if (socketHandlers.programAdded) {
      window.socket.off('programAdded', socketHandlers.programAdded);
    }
    if (socketHandlers.programDeleted) {
      window.socket.off('programDeleted', socketHandlers.programDeleted);
    }
    if (socketHandlers.scheduleReloaded) {
      window.socket.off('scheduleReloaded', socketHandlers.scheduleReloaded);
    }
    if (socketHandlers.scheduleUserJoined) {
      window.socket.off('scheduleUserJoined', socketHandlers.scheduleUserJoined);
    }
    if (socketHandlers.scheduleUserLeft) {
      window.socket.off('scheduleUserLeft', socketHandlers.scheduleUserLeft);
    }
    
    // Clear handler references
    Object.keys(socketHandlers).forEach(key => delete socketHandlers[key]);
    
    console.log('🧹 Removed all simple collaboration socket listeners');
  }
  
  // Clear timeouts
  Object.values(updateTimeouts).forEach(clearTimeout);
  updateTimeouts = {};
  
  // Clear state
  collabState.activeEditors.clear();
  collabState.activeUsers.clear();
  collabState.isEnabled = false;
  collabState.eventId = null;
  collabState.currentUser = null;
  
  // Remove active users display
  const usersContainer = document.getElementById('active-collab-users');
  if (usersContainer) {
    usersContainer.remove();
  }
  
  // Remove all collaboration-related DOM elements
  const collabElements = document.querySelectorAll('.editing-badge, .collaboration-notification');
  collabElements.forEach(el => el.remove());
  
  // Remove collaboration styles
  const collabStyles = document.querySelectorAll('#collab-users-styles, #collab-notification-styles');
  collabStyles.forEach(style => style.remove());
  
  // Leave the event room
  if (window.socket && collabState.eventId) {
    window.socket.emit('leaveEventRoom', {
      eventId: collabState.eventId,
      userId: collabState.currentUser?.id
    });
    
    // Emit schedule-specific leave event
    window.socket.emit('leaveScheduleCollaboration', {
      eventId: collabState.eventId,
      userId: collabState.currentUser?.id
    });
  }
  
  // Reset initialization flags
  window.__simpleCollabInitialized = false;
  window.__simpleCollabLoaded = false;
  
  console.log('🧹 Simple collaboration cleaned up - all listeners removed and state cleared');
}

// =============================================================================
// USER PRESENCE HANDLERS
// =============================================================================

function handleUserJoined(data) {
  const { userId, userName, userColor } = data;
  
  // Add user to active users list
  collabState.activeUsers.set(userId, {
    userName: userName || `User ${userId}`,
    color: userColor || '#888888',
    joinedAt: Date.now()
  });
  
  console.log(`👥 User joined collaboration: ${userName || userId}`);
  updateActiveUsersDisplay();
  showNotification(`${userName || 'A user'} joined the collaboration`, 'join');
}

function handleUserLeft(data) {
  const { userId } = data;
  const userInfo = collabState.activeUsers.get(userId);
  
  if (userInfo) {
    // Remove user from active users
    collabState.activeUsers.delete(userId);
    
    // Clean up any editing indicators for this user
    const editorsToRemove = [];
    collabState.activeEditors.forEach((editor, fieldKey) => {
      if (editor.userId === userId) {
        editorsToRemove.push(fieldKey);
      }
    });
    
    editorsToRemove.forEach(fieldKey => {
      collabState.activeEditors.delete(fieldKey);
      hideEditingIndicatorByFieldKey(fieldKey);
    });
    
    console.log(`👋 User left collaboration: ${userInfo.userName}`);
    updateActiveUsersDisplay();
    showNotification(`${userInfo.userName} left the collaboration`, 'leave');
  }
}

// =============================================================================
// ACTIVE USERS DISPLAY
// =============================================================================

function updateActiveUsersDisplay() {
  // Safety check: Only show collaboration UI on schedule page
  if (!document.querySelector('.schedule-page')) {
    console.log('🚫 Skipping collaboration UI update - not on schedule page');
    return;
  }

  // Find or create the active users container
  let usersContainer = document.getElementById('active-collab-users');
  if (!usersContainer) {
    usersContainer = document.createElement('div');
    usersContainer.id = 'active-collab-users';
    usersContainer.className = 'active-users-indicator';
    
    // Insert at the top of the schedule page
    const scheduleContainer = document.querySelector('.schedule-page');
    if (scheduleContainer) {
      scheduleContainer.insertBefore(usersContainer, scheduleContainer.firstChild);
    } else {
      // This shouldn't happen due to the safety check above, but just in case
      console.warn('⚠️ No schedule container found for collaboration UI');
      return;
    }
  }
  
  // DISABLED: Don't show top-level collaboration count to prevent mobile header blocking
  // Individual field indicators provide sufficient collaboration awareness
  usersContainer.style.display = 'none';
  
  // CSS styles disabled since collaboration indicator is hidden
  if (false && !document.getElementById('collab-users-styles')) {
    const styles = document.createElement('style');
    styles.id = 'collab-users-styles';
    styles.textContent = `
      .active-users-indicator {
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 16px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      
      .collab-header {
        margin-bottom: 8px;
      }
      
      .collab-title {
        font-weight: 600;
        color: #495057;
        font-size: 14px;
      }
      
      .active-users-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      
      .active-user {
        display: flex;
        align-items: center;
        gap: 6px;
        background: white;
        padding: 4px 8px;
        border-radius: 16px;
        border: 1px solid #dee2e6;
        font-size: 12px;
      }
      
      .active-user.current-user {
        background: #e3f2fd;
        border-color: #1976d2;
      }
      
      .user-avatar {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 10px;
      }
      
      .user-name {
        color: #495057;
        font-weight: 500;
      }
      
      .active-user.current-user .user-name {
        color: #1976d2;
      }
    `;
    document.head.appendChild(styles);
  }
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