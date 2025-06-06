(function() {
// Add an initialization flag to prevent duplicate initialization
if (window.__cardLogJsLoaded) {
  console.log('Card-log.js already loaded, skipping initialization');
  return;
}
window.__cardLogJsLoaded = true;

// Bottom Nav Placeholder

// 🔥 Global variables
let users = [];
const cameras = ["A7IV-A", "A7IV-B", "A7IV-C", "A7IV-D", "A7IV-E", "A7RV-A", "FX3-A", "A7IV", "A7RV", "A7III"];
let isOwner = false;
let saveTimeout;
let eventListenersAttached = false;
let processingSocketEvent = false; // Flag to prevent multiple socket events processing at once
let lastEventTime = 0; // Track when the last event started processing
let isActivelyEditing = false; // Track if user is actively editing
let lastInputTime = 0; // Track when user last typed
let deferredUpdate = null; // Store deferred updates

// Add a fallback to reset the processing flag if it gets stuck
setInterval(() => {
  if (processingSocketEvent && Date.now() - lastEventTime > 5000) {
    console.warn('[CARD-LOG] Processing flag stuck for >5s, resetting');
    processingSocketEvent = false;
  }
}, 1000);

// Add Socket.IO real-time updates early in the file, after any variable declarations but before function definitions
// Socket.IO real-time updates
function setupSocketListeners() {
  if (!window.socket) {
    console.warn('[CARD-LOG] Socket.IO not available, skipping event listeners');
    return;
  }
  
  console.log('[CARD-LOG] Setting up Socket.IO event listeners...');
  console.log('[CARD-LOG] Socket connected:', window.socket.connected);
  
  // --- Granular card log events ---
  window.socket.on('cardLogAdded', (data) => {
    if (processingSocketEvent) {
      console.log("Ignoring cardLogAdded event - already processing another event");
      return;
    }
    
    processingSocketEvent = true;
    
    try {
      const currentEventId = localStorage.getItem('eventId');
      if (!data || data.tableId !== currentEventId || !data.cardLog) {
        console.log("Ignoring cardLogAdded - not for current event or missing data");
        return;
      }
      
      console.log(`Received cardLogAdded for date: ${data.cardLog.date}`);
      
      // Only add if not already present - don't clear container
      if (!document.getElementById(`day-${data.cardLog.date}`)) {
        console.log("Adding new day section to UI");
        addDaySection(data.cardLog.date, data.cardLog.entries);
      } else {
        console.log("Day already exists in UI, ignoring");
      }
    } finally {
      // Use a timeout to prevent rapid event processing
      setTimeout(() => {
        processingSocketEvent = false;
      }, 100);
    }
  });
  
  window.socket.on('cardLogUpdated', (data) => {
    if (processingSocketEvent) {
      console.log("Ignoring cardLogUpdated event - already processing another event");
      return;
    }
    
    // Don't update UI if user is actively editing
    if (isActivelyEditing && Date.now() - lastInputTime < 2000) {
      console.log("[CARD-LOG] User is actively editing, deferring update");
      deferredUpdate = data; // Store the update for later
      setTimeout(() => {
        if (!isActivelyEditing && deferredUpdate) {
          console.log("[CARD-LOG] User finished editing, applying deferred update");
          const storedData = deferredUpdate;
          deferredUpdate = null;
          // Process the stored update
          processingSocketEvent = true;
          lastEventTime = Date.now();
          
          try {
            applySmartDayUpdate(storedData.cardLog.date, storedData.cardLog.entries);
          } finally {
            setTimeout(() => {
              processingSocketEvent = false;
            }, 100);
          }
        }
      }, 2000);
      return;
    }
    
    processingSocketEvent = true;
    lastEventTime = Date.now();
    console.log('[CARD-LOG] Processing cardLogUpdated event, flag set to true');
    
    try {
      const currentEventId = localStorage.getItem('eventId');
      if (!data || data.tableId !== currentEventId || !data.cardLog) {
        console.log("Ignoring cardLogUpdated - not for current event or missing data", {
          hasData: !!data,
          tableIdMatch: data?.tableId === currentEventId,
          hasCardLog: !!data?.cardLog,
          currentEventId,
          dataTableId: data?.tableId
        });
        return;
      }
      
      console.log(`[CARD-LOG] Processing cardLogUpdated for date: ${data.cardLog.date}`, {
        entriesCount: data.cardLog.entries?.length || 0,
        entries: data.cardLog.entries
      });
      
      // Use smart update instead of removing/recreating the entire day
      applySmartDayUpdate(data.cardLog.date, data.cardLog.entries);
      
    } catch (error) {
      console.error('[CARD-LOG] Error processing cardLogUpdated:', error);
    } finally {
      setTimeout(() => {
        processingSocketEvent = false;
        console.log('[CARD-LOG] Processing flag reset to false');
      }, 100);
    }
  });
  
  window.socket.on('cardLogDeleted', (data) => {
    if (processingSocketEvent) return;
    processingSocketEvent = true;
    
    try {
      const currentEventId = localStorage.getItem('eventId');
      if (!data || data.tableId !== currentEventId || !data.cardLog) return;
      console.log(`Received cardLogDeleted for date: ${data.cardLog.date}`);
      
      // Remove the day section if it exists
      const dayDiv = document.getElementById(`day-${data.cardLog.date}`);
      if (dayDiv) {
        console.log("Removing day section from UI");
        dayDiv.remove();
      } else {
        console.log("Day doesn't exist in UI, ignoring delete");
      }
    } finally {
      setTimeout(() => {
        processingSocketEvent = false;
      }, 100);
    }
  });
  
  // Also listen for general table updates
  window.socket.on('tableUpdated', (data) => {
    if (processingSocketEvent) return;
    
    const currentEventId = localStorage.getItem('eventId');
    
    // Only reload if it's for the current table
    if (data && data.tableId && data.tableId !== currentEventId) {
      console.log('Update was for a different event, ignoring');
      return;
    }
    
    console.log('Table updated event received - NOT reloading entire card log to maintain state');
    // We no longer call loadCardLog() here to avoid resetting the UI
  });
}

// Utility and handler functions
async function saveToMongoDB() {
  try {
    const tables = document.querySelectorAll('.day-table');
    
    // If no day tables exist, send an empty array explicitly
    if (tables.length === 0) {
      console.log("No days found in the UI, sending empty card log");
      const response = await fetch(`${API_BASE}/api/tables/${localStorage.getItem('eventId')}/cardlog`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
        body: JSON.stringify({ cardLog: [] })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(`Error saving changes: ${errorData.error || response.statusText}`);
        return false;
      }
      console.log("Empty card log saved successfully");
      return true;
    }
    
    const cardLog = Array.from(tables).map(dayTable => {
      const date = dayTable.querySelector('h3').textContent;
      const entries = Array.from(dayTable.querySelectorAll('tbody tr')).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          camera: cells[0].querySelector('select')?.value || '',
          card1: cells[1].querySelector('input')?.value || '',
          card2: cells[2].querySelector('input')?.value || '',
          user: cells[3].querySelector('select')?.value || '',
          // Add a client-side ID if needed
          _id: row.getAttribute('data-id') || `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
      });
      
      // Get the day ID from the DOM if it exists
      const dayId = dayTable.getAttribute('data-id');
      
      return { 
        date, 
        entries,
        _id: dayId || `day-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };
    });

    console.log("Saving card log with entries:", cardLog.map(log => `${log.date} (${log.entries.length} entries)`));
    const response = await fetch(`${API_BASE}/api/tables/${localStorage.getItem('eventId')}/cardlog`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
      body: JSON.stringify({ cardLog })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Error saving card log: ${response.status} ${response.statusText}`, errorData);
      
      // Show error to user
      alert(`Error saving changes: ${errorData.error || response.statusText}`);
      return false;
    }
    
    console.log("Card log saved successfully");
    
    // Update the data-id attributes after saving
    cardLog.forEach(day => {
      const dayDiv = document.getElementById(`day-${day.date}`);
      if (dayDiv) {
        dayDiv.setAttribute('data-id', day._id);
        
        // Also update row IDs
        day.entries.forEach((entry, index) => {
          const rows = dayDiv.querySelectorAll('tbody tr');
          if (rows[index]) {
            rows[index].setAttribute('data-id', entry._id);
          }
        });
      }
    });
    
    return true;
  } catch (error) {
    console.error("Error saving card log:", error);
    alert(`Error saving changes: ${error.message || 'Unknown error'}`);
    return false;
  }
}

function debounceSave() {
  // Don't save if we're processing a Socket.IO event
  if (processingSocketEvent) {
    console.log('[CARD-LOG] Skipping save - processing Socket.IO event');
    return;
  }
  
  clearTimeout(saveTimeout);
  
  // Use shorter, more consistent delay since we have better conflict prevention now
  const delay = isActivelyEditing ? 1000 : 300;
  
  console.log(`[CARD-LOG] Debouncing save with ${delay}ms delay (actively editing: ${isActivelyEditing})`);
  
  saveTimeout = setTimeout(() => {
    // Double-check we're not processing an event and user isn't actively editing
    if (!processingSocketEvent && !isActivelyEditing) {
      console.log('[CARD-LOG] Executing debounced save');
      saveToMongoDB();
    } else {
      console.log('[CARD-LOG] Skipping save - conflict detected', {
        processingSocketEvent,
        isActivelyEditing
      });
      // Retry save in a bit if conditions are temporary
      if (processingSocketEvent && !isActivelyEditing) {
        setTimeout(() => debounceSave(), 200);
      }
    }
  }, delay);
}

function openDateModal() {
  document.getElementById('date-modal').style.display = 'flex';
}

function closeDateModal() {
  document.getElementById('date-modal').style.display = 'none';
}

function createNewDay() {
  const dateInput = document.getElementById('new-date-input');
  const date = dateInput.value;
  if (!date || document.getElementById(`day-${date}`)) return alert('Date missing or already exists');
  addDaySection(date);
  dateInput.value = '';
  closeDateModal();
  // Only save, do not reload the card log
  saveToMongoDB();
}

// Add event handlers to page elements
function setupEventListeners() {
  if (eventListenersAttached) {
    console.log('Event listeners already attached, skipping');
    return;
  }
  
  const addDayBtn = document.getElementById('add-day-btn');
  const cancelModalBtn = document.getElementById('cancel-modal');
  const submitDateBtn = document.getElementById('submit-date');
  const tableContainer = document.getElementById('table-container');
  
  if (addDayBtn) addDayBtn.addEventListener('click', openDateModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeDateModal);
  if (submitDateBtn) submitDateBtn.addEventListener('click', createNewDay);
  
  if (tableContainer) {
    tableContainer.addEventListener('click', async (e) => {
      if (e.target.classList.contains('add-row-btn')) {
        const date = e.target.getAttribute('data-date');
        console.log(`User clicked "Add Row" for date: ${date}`);
        addRow(date);
        console.log(`Calling saveToMongoDB after adding row to ${date}`);
        saveToMongoDB();
      }
      if (e.target.classList.contains('delete-row-btn') && isOwner) {
        e.target.closest('tr').remove();
        saveToMongoDB();
      }
      if (e.target.classList.contains('delete-day-btn') && isOwner) {
        const dayDiv = e.target.closest('.day-table');
        if (dayDiv && confirm('Delete this entire day?')) {
          // Store the day information before removing it
          const date = dayDiv.querySelector('h3').textContent;
          const dayId = dayDiv.getAttribute('data-id');
          
          // Remove from DOM
          dayDiv.remove();
          
          // Try to save
          const success = await saveToMongoDB();
          
          // If saving failed, recreate the day
          if (!success) {
            console.log(`Save failed, restoring deleted day: ${date}`);
            // Reload the entire card log to ensure consistency
            await loadCardLog();
            alert(`The day could not be deleted due to an error. The page has been refreshed.`);
          }
        }
      }
    });

    // Track input events with better timing
    tableContainer.addEventListener('input', (e) => {
      lastInputTime = Date.now();
      isActivelyEditing = true;
      console.log('[CARD-LOG] User input detected, updating lastInputTime');
      debounceSave();
    });
    
    // Track when user finishes editing (blur events)
    tableContainer.addEventListener('blur', (e) => {
      if (e.target.matches('input, select')) {
        console.log('[CARD-LOG] User finished editing field');
        
        // Small delay to allow for tab navigation between fields
        window.cardLogBlurTimeout = setTimeout(() => {
          const stillEditing = document.activeElement && 
                              tableContainer.contains(document.activeElement) && 
                              document.activeElement.matches('input, select');
          
          if (!stillEditing) {
            isActivelyEditing = false;
            console.log('[CARD-LOG] User completely finished editing, not just moving between fields');
            
            // Apply any deferred updates using smart update
            if (deferredUpdate) {
              console.log('[CARD-LOG] Applying deferred update after user finished editing');
              const storedData = deferredUpdate;
              deferredUpdate = null;
              
              if (!processingSocketEvent) {
                processingSocketEvent = true;
                try {
                  applySmartDayUpdate(storedData.cardLog.date, storedData.cardLog.entries);
                  console.log(`[CARD-LOG] Deferred update applied using smart update`);
                } finally {
                  setTimeout(() => {
                    processingSocketEvent = false;
                  }, 50);
                }
              }
            }
            
            // Trigger a save
            console.log('[CARD-LOG] User finished editing, triggering save');
            debounceSave();
          }
          window.cardLogBlurTimeout = null;
        }, 150);
      }
    }, true);
    
    // Track focus events to know when user starts editing
    tableContainer.addEventListener('focus', (e) => {
      if (e.target.matches('input, select')) {
        console.log('[CARD-LOG] User started editing field');
        isActivelyEditing = true;
        lastInputTime = Date.now();
        
        // Clear any timeout from blur event that might reset isActivelyEditing
        if (window.cardLogBlurTimeout) {
          clearTimeout(window.cardLogBlurTimeout);
        }
      }
    }, true);

    tableContainer.addEventListener('change', debounceSave);
  }
  
  eventListenersAttached = true;
}

// Cleanup function for page navigation
function cleanupCardLogPage() {
  // Reset the flag so we can initialize again if needed
  window.__cardLogJsLoaded = false;
  eventListenersAttached = false;
  
  // Clear any timeouts
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  
  if (window.cardLogBlurTimeout) {
    clearTimeout(window.cardLogBlurTimeout);
    window.cardLogBlurTimeout = null;
  }
  
  // Reset global variables
  users = [];
  isOwner = false;
  processingSocketEvent = false;
  isActivelyEditing = false;
  lastInputTime = 0;
  lastEventTime = 0;
  deferredUpdate = null;
  
  // Remove event listeners
  const addDayBtn = document.getElementById('add-day-btn');
  const cancelModalBtn = document.getElementById('cancel-modal');
  const submitDateBtn = document.getElementById('submit-date');
  const tableContainer = document.getElementById('table-container');
  
  if (addDayBtn) addDayBtn.removeEventListener('click', openDateModal);
  if (cancelModalBtn) cancelModalBtn.removeEventListener('click', closeDateModal);
  if (submitDateBtn) submitDateBtn.removeEventListener('click', createNewDay);
  
  console.log('Card log page cleaned up');
}

window.initPage = async function(id) {
  const tableId = id || localStorage.getItem('eventId');
    if (!tableId) {
      alert('Event ID missing.');
      return;
    }
    // Removed redundant localStorage.setItem('eventId', tableId) to prevent overwriting with potentially stale data
    // The navigation system should already have set this correctly

    // Test Socket.IO connection immediately
    console.log('[CARD-LOG INIT] Testing Socket.IO connection...');
    console.log('[CARD-LOG INIT] window.socket exists:', !!window.socket);
    console.log('[CARD-LOG INIT] Socket connected:', window.socket?.connected);
    console.log('[CARD-LOG INIT] Current event ID:', tableId);

    // Load event name
    try {
      const res = await fetch(`${API_BASE}/api/tables/${tableId}`, {
        headers: { Authorization: localStorage.getItem('token') }
      });
      const table = await res.json();
    const eventTitleEl = document.getElementById('eventTitle');
    if (eventTitleEl) eventTitleEl.textContent = table.title || 'Event';
    } catch (err) {
      console.error('Failed to load event name:', err);
    const eventTitleEl = document.getElementById('eventTitle');
    if (eventTitleEl) eventTitleEl.textContent = 'Error loading event';
    }

  await loadUsers();
  await loadCardLog();

  // Set up Socket.IO event listeners after everything is loaded
  setupSocketListeners();

    // Load bottom nav HTML
  let navContainer = document.getElementById('bottomNav');
  if (!navContainer) {
    navContainer = document.createElement('nav');
    navContainer.className = 'bottom-nav';
    navContainer.id = 'bottomNav';
    document.body.appendChild(navContainer);
  }
    const navRes = await fetch('../bottom-nav.html');
    const navHTML = await navRes.text();
  
  // Extract just the nav content (without the outer nav tag)
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = navHTML;
  const navContent = tempDiv.querySelector('nav').innerHTML;
  navContainer.innerHTML = navContent;

  // Set up navigation using the centralized function from app.js
  if (window.setupBottomNavigation) {
    window.setupBottomNavigation(navContainer, tableId, 'card-log');
  }

    // Inject hrefs with ?id=...
    const links = [
      { id: 'navGeneral', file: 'general.html' },
      { id: 'navCrew', file: 'crew.html' },
      { id: 'navTravel', file: 'travel-accommodation.html' },
      { id: 'navGear', file: 'gear.html' },
      { id: 'navCard', file: 'card-log.html' },
    { id: 'navSchedule', file: 'schedule.html' }
      ];
    links.forEach(({ id, file }) => {
      const el = document.getElementById(id);
      if (el) el.href = `${file}?id=${tableId}`;
    });

    if (window.lucide) lucide.createIcons();
  
  // Set up event listeners
  setupEventListeners();
};

async function loadUsers() {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/api/users`, { headers: { Authorization: token } });
  if (!res.ok) return console.error('Failed to fetch users');
  const data = await res.json();
  users = data.map(u => u.name?.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

async function loadCardLog() {
  const token = localStorage.getItem('token');
  const eventId = localStorage.getItem('eventId');
  const res = await fetch(`${API_BASE}/api/tables/${eventId}`, { headers: { Authorization: token } });
  if (!res.ok) return console.error('Failed to load table data');
  const table = await res.json();
  const userId = getUserIdFromToken();
  isOwner = Array.isArray(table.owners) && table.owners.includes(userId);
  if (!table.cardLog || table.cardLog.length === 0) return;
  
  const container = document.getElementById('table-container');
  
  // Get existing days
  const existingDays = new Set(Array.from(document.querySelectorAll('.day-table')).map(div => {
    const dateHeader = div.querySelector('h3');
    return dateHeader ? dateHeader.textContent : null;
  }).filter(Boolean));
  
  console.log("Existing days in UI:", Array.from(existingDays));
  console.log("Days in database:", table.cardLog.map(day => day.date));
  
  // Don't clear container if we already have days, only add missing ones
  const shouldAddAll = existingDays.size === 0;
  
  if (shouldAddAll) {
    // No existing days, start fresh
    container.innerHTML = '';
    table.cardLog.forEach(day => addDaySection(day.date, day.entries));
  } else {
    // Only add days that aren't already shown
    table.cardLog.forEach(day => {
      if (!existingDays.has(day.date)) {
        console.log(`Adding missing day: ${day.date}`);
        addDaySection(day.date, day.entries);
      }
    });
  }
}

function getUserIdFromToken() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.id;
}

function getCurrentUserName() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return '';
    
    // Get user data from token
    const payload = JSON.parse(atob(token.split('.')[1]));
    
    // Use the users array to find a match
    const userId = payload.id;
    const userJWT = payload.fullName;
    
    // If the current user is in the users array, return that name
    // This ensures we use the same format as in the dropdown
    if (users.length > 0) {
      // Find the first user in the array with a matching name
      for (const user of users) {
        // Simple fuzzy matching - if the JWT name is a substring of the user name
        if (user && userJWT && 
            (user.toLowerCase().includes(userJWT.toLowerCase()) || 
             userJWT.toLowerCase().includes(user.toLowerCase()))) {
          return user;
        }
      }
    }
    
    // Fall back to JWT token's fullName
    return userJWT || '';
  } catch (err) {
    console.error('Error getting current user name:', err);
    return '';
  }
}

function addDaySection(date, entries = []) {
  const container = document.getElementById('table-container');
  const dayDiv = document.createElement('div');
  
  // Generate a unique ID for this day if not already present
  const dayId = `day-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  dayDiv.className = 'day-table';
  dayDiv.id = `day-${date}`;
  dayDiv.setAttribute('data-id', dayId);
  
  dayDiv.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center;">
      <h3 style="margin: 0;">${date}</h3>
      ${isOwner ? `<button class="delete-day-btn" data-date="${date}" title="Delete Day"><span class="material-symbols-outlined">delete</span></button>` : ''}
    </div>
    <table>
      <colgroup>
        <col style="width: 25%;">
        <col style="width: 15%;">
        <col style="width: 15%;">
        <col style="width: 35%;">
        <col style="width: 10%;">
      </colgroup>
      <thead>
        <tr>
          <th>Camera</th>
          <th>Card 1</th>
          <th>Card 2</th>
          <th>User</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="tbody-${date}"></tbody>
    </table>
    <button class="add-row-btn" data-date="${date}">Add Row</button>
  `;
  
  // Insert in the correct position to maintain date order
  const existingDays = Array.from(container.querySelectorAll('.day-table'));
  let insertPosition = null;
  
  for (let i = 0; i < existingDays.length; i++) {
    const existingDate = existingDays[i].querySelector('h3').textContent;
    if (date < existingDate) {
      insertPosition = existingDays[i];
      break;
    }
  }
  
  if (insertPosition) {
    container.insertBefore(dayDiv, insertPosition);
    console.log(`Inserted day ${date} before ${insertPosition.querySelector('h3').textContent}`);
  } else {
    container.appendChild(dayDiv);
    console.log(`Appended day ${date} at the end`);
  }
  
  // Make sure entries is an array
  const entriesArray = Array.isArray(entries) ? entries : [];
  entriesArray.forEach(entry => addRow(date, entry));
  
  console.log(`Added day section for ${date} with ${entriesArray.length} entries`);
}

function addRow(date, entry = {}) {
  const tbody = document.getElementById(`tbody-${date}`);
  if (!tbody) {
    console.error(`Tbody not found for date: ${date}`);
    return;
  }
  
  console.log(`Adding row to date ${date}:`, entry);
  
  const row = document.createElement('tr');
  
  // Generate or use existing ID for this row
  const rowId = entry._id || `row-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  row.setAttribute('data-id', rowId);

  const currentUser = getCurrentUserName();
  const isCreator = !entry.user || entry.user === currentUser;
  const readOnlyForNonOwner = !isOwner && !isCreator;

  const userValue = entry.user || currentUser;
  const userOptions = users.map(user =>
    `<option value="${user}" ${user === userValue ? 'selected' : ''}>${user}</option>`
  ).join('');

  row.setAttribute('data-user', userValue);

  row.innerHTML = `
    <td><select class="camera-select" ${readOnlyForNonOwner ? 'disabled' : ''}>
      <option value="" disabled ${entry.camera ? '' : 'selected hidden'}>Select Camera</option>
      ${cameras.map(cam => `<option value="${cam}" ${entry.camera === cam ? 'selected' : ''}>${cam}</option>`).join('')}
      <option value="add-new-camera">➕ Add New Camera</option>
    </select></td>
    <td><input type="text" value="${entry.card1 || ''}" placeholder="Card 1" ${readOnlyForNonOwner ? 'readonly' : ''} /></td>
    <td><input type="text" value="${entry.card2 || ''}" placeholder="Card 2" ${readOnlyForNonOwner ? 'readonly' : ''} /></td>
    <td>
      <select class="user-select" ${!isOwner ? 'disabled' : ''}>
        ${userOptions}
        <option value="add-new-user">➕ Add New User</option>
      </select>
    </td>
    <td style="text-align:center;">
    ${isOwner ? '<button class="delete-row-btn" title="Delete Row"><span class="material-symbols-outlined">delete</span></button>' : ''}
    </td>
  `;

  tbody.appendChild(row);

  const cameraSelect = row.querySelector('.camera-select');
  const userSelect = row.querySelector('.user-select');

  cameraSelect.addEventListener('change', function () {
    if (this.value === 'add-new-camera') {
      const newCamera = prompt('Enter new camera name:');
      if (newCamera) {
        cameras.push(newCamera);
        const option = new Option(newCamera, newCamera, true, true);
        this.insertBefore(option, this.querySelector('[value="add-new-camera"]'));
      } else this.value = '';
    }
  });

  userSelect.addEventListener('change', function () {
    if (this.value === 'add-new-user') {
      const newUser = prompt('Enter new user name:');
      if (newUser) {
        users.push(newUser);
        const option = new Option(newUser, newUser, true, true);
        this.insertBefore(option, this.querySelector('[value="add-new-user"]'));
      } else this.value = '';
    }
  });
}

window.saveToMongoDB = saveToMongoDB;
window.debounceSave = debounceSave;
window.openDateModal = openDateModal;
window.closeDateModal = closeDateModal;
window.createNewDay = createNewDay;
window.addDaySection = addDaySection;
window.addRow = addRow;
window.loadUsers = loadUsers;
window.loadCardLog = loadCardLog;
window.getUserIdFromToken = getUserIdFromToken;
window.getCurrentUserName = getCurrentUserName;
window.applySmartDayUpdate = applySmartDayUpdate;

// Add test function for debugging
window.testCardLogSave = function() {
  console.log('[TEST] Manually triggering card log save...');
  saveToMongoDB().then(result => {
    console.log('[TEST] Save result:', result);
  }).catch(error => {
    console.error('[TEST] Save error:', error);
  });
};

// Test smart update functionality
window.testSmartUpdate = function(date, testEntries) {
  console.log('[TEST] Testing smart update for date:', date);
  const mockEntries = testEntries || [
    { camera: 'A7IV-A', card1: 'Test1', card2: 'Test2', user: 'TestUser' },
    { camera: 'A7IV-B', card1: 'Test3', card2: 'Test4', user: 'TestUser2' }
  ];
  
  console.log('[TEST] Mock entries:', mockEntries);
  applySmartDayUpdate(date, mockEntries);
};

// Add Socket.IO connection test
window.testSocketConnection = function() {
  console.log('[TEST] Socket.IO connection test:');
  console.log('- window.socket exists:', !!window.socket);
  console.log('- Socket connected:', window.socket?.connected);
  console.log('- Current event ID:', localStorage.getItem('eventId'));
  
  if (window.socket && window.socket.connected) {
    console.log('[TEST] ✅ Socket.IO is connected and ready');
    
    // Test emitting a custom event
    window.socket.emit('test-event', { message: 'Frontend test', tableId: localStorage.getItem('eventId') });
    console.log('[TEST] Sent test event to server');
  } else {
    console.log('[TEST] ❌ Socket.IO is not connected');
  }
};

// Add test to verify event listeners are set up
window.testSocketListeners = function() {
  console.log('[TEST] Testing Socket.IO event listeners...');
  
  if (!window.socket) {
    console.log('[TEST] ❌ Socket.IO not available');
    return;
  }
  
  // Check if our event listeners are set up by looking at the socket's event names
  const eventNames = window.socket.eventNames ? window.socket.eventNames() : [];
  console.log('[TEST] Socket event listeners:', eventNames);
  
  const cardLogEvents = ['cardLogAdded', 'cardLogUpdated', 'cardLogDeleted'];
  const hasCardLogListeners = cardLogEvents.some(event => eventNames.includes(event));
  
  if (hasCardLogListeners) {
    console.log('[TEST] ✅ Card log event listeners are set up');
  } else {
    console.log('[TEST] ❌ Card log event listeners are missing');
    console.log('[TEST] Attempting to set up listeners now...');
    setupSocketListeners();
  }
};

// Add cleanup function to window for the app.js navigation system
window.cleanupCardLogPage = cleanupCardLogPage;

// Export the initPage function
window.initPage = window.initPage;

// Smart DOM update function that preserves input values and focus states
function applySmartDayUpdate(date, entries) {
  const dayDiv = document.getElementById(`day-${date}`);
  if (!dayDiv) {
    console.log(`[CARD-LOG] Day section doesn't exist for ${date}, creating new one`);
    addDaySection(date, entries);
    return;
  }
  
  console.log(`[CARD-LOG] Smart updating day section for ${date}`);
  
  // Preserve current input values and focus state
  const preservationData = preserveInputStates(dayDiv);
  
  // Get current rows
  const tbody = dayDiv.querySelector('tbody');
  const currentRows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
  const targetEntries = Array.isArray(entries) ? entries : [];
  
  console.log(`[CARD-LOG] Current rows: ${currentRows.length}, Target entries: ${targetEntries.length}`);
  
  // Handle row count differences
  if (targetEntries.length > currentRows.length) {
    // Add missing rows
    const rowsToAdd = targetEntries.length - currentRows.length;
    console.log(`[CARD-LOG] Adding ${rowsToAdd} new rows`);
    for (let i = 0; i < rowsToAdd; i++) {
      addRow(date, {});
    }
  } else if (targetEntries.length < currentRows.length) {
    // Remove extra rows (from the end)
    const rowsToRemove = currentRows.length - targetEntries.length;
    console.log(`[CARD-LOG] Removing ${rowsToRemove} extra rows`);
    for (let i = 0; i < rowsToRemove; i++) {
      const lastRow = tbody.querySelector('tr:last-child');
      if (lastRow) lastRow.remove();
    }
  }
  
  // Update existing rows with new data (but preserve user input if they're actively editing)
  const updatedRows = tbody.querySelectorAll('tr');
  targetEntries.forEach((entry, index) => {
    if (updatedRows[index]) {
      updateRowData(updatedRows[index], entry, preservationData);
    }
  });
  
  console.log(`[CARD-LOG] Smart update completed for ${date}`);
}

// Preserve input states before DOM manipulation
function preserveInputStates(dayDiv) {
  const preservationData = {
    focusedElement: null,
    inputValues: new Map(),
    selectionStates: new Map()
  };
  
  // Get currently focused element
  const activeElement = document.activeElement;
  if (activeElement && dayDiv.contains(activeElement)) {
    preservationData.focusedElement = {
      tagName: activeElement.tagName,
      type: activeElement.type,
      rowIndex: Array.from(activeElement.closest('tbody').children).indexOf(activeElement.closest('tr')),
      cellIndex: Array.from(activeElement.closest('tr').children).indexOf(activeElement.closest('td')),
      selectionStart: activeElement.selectionStart,
      selectionEnd: activeElement.selectionEnd
    };
    console.log('[CARD-LOG] Preserving focus state:', preservationData.focusedElement);
  }
  
  // Preserve all input values and selection states
  const inputs = dayDiv.querySelectorAll('input, select');
  inputs.forEach((input, index) => {
    const row = input.closest('tr');
    const cell = input.closest('td');
    if (row && cell) {
      const rowIndex = Array.from(row.parentNode.children).indexOf(row);
      const cellIndex = Array.from(row.children).indexOf(cell);
      const key = `${rowIndex}-${cellIndex}`;
      
      preservationData.inputValues.set(key, {
        value: input.value,
        tagName: input.tagName,
        type: input.type
      });
      
      // Preserve selection state for inputs
      if (input.tagName === 'INPUT' && input.type === 'text') {
        preservationData.selectionStates.set(key, {
          selectionStart: input.selectionStart,
          selectionEnd: input.selectionEnd
        });
      }
    }
  });
  
  return preservationData;
}

// Update a single row's data while preserving user input
function updateRowData(row, targetEntry, preservationData) {
  const cells = row.querySelectorAll('td');
  if (!cells || cells.length < 4) return;
  
  const rowIndex = Array.from(row.parentNode.children).indexOf(row);
  
  // Update camera select (cell 0)
  const cameraSelect = cells[0].querySelector('select');
  if (cameraSelect && !isUserCurrentlyEditing(cameraSelect, preservationData)) {
    if (targetEntry.camera && cameraSelect.value !== targetEntry.camera) {
      console.log(`[CARD-LOG] Updating camera for row ${rowIndex}: ${cameraSelect.value} -> ${targetEntry.camera}`);
      cameraSelect.value = targetEntry.camera;
    }
  }
  
  // Update card1 input (cell 1)
  const card1Input = cells[1].querySelector('input');
  if (card1Input && !isUserCurrentlyEditing(card1Input, preservationData)) {
    const targetCard1 = targetEntry.card1 || '';
    if (card1Input.value !== targetCard1) {
      console.log(`[CARD-LOG] Updating card1 for row ${rowIndex}: '${card1Input.value}' -> '${targetCard1}'`);
      card1Input.value = targetCard1;
    }
  }
  
  // Update card2 input (cell 2)  
  const card2Input = cells[2].querySelector('input');
  if (card2Input && !isUserCurrentlyEditing(card2Input, preservationData)) {
    const targetCard2 = targetEntry.card2 || '';
    if (card2Input.value !== targetCard2) {
      console.log(`[CARD-LOG] Updating card2 for row ${rowIndex}: '${card2Input.value}' -> '${targetCard2}'`);
      card2Input.value = targetCard2;
    }
  }
  
  // Update user select (cell 3)
  const userSelect = cells[3].querySelector('select');
  if (userSelect && !isUserCurrentlyEditing(userSelect, preservationData)) {
    if (targetEntry.user && userSelect.value !== targetEntry.user) {
      console.log(`[CARD-LOG] Updating user for row ${rowIndex}: ${userSelect.value} -> ${targetEntry.user}`);
      userSelect.value = targetEntry.user;
    }
  }
  
  // Update row ID
  if (targetEntry._id) {
    row.setAttribute('data-id', targetEntry._id);
  }
}

// Check if a specific element is currently being edited by the user
function isUserCurrentlyEditing(element, preservationData) {
  if (!preservationData.focusedElement) return false;
  
  const row = element.closest('tr');
  const cell = element.closest('td');
  if (!row || !cell) return false;
  
  const rowIndex = Array.from(row.parentNode.children).indexOf(row);
  const cellIndex = Array.from(row.children).indexOf(cell);
  
  return (preservationData.focusedElement.rowIndex === rowIndex && 
          preservationData.focusedElement.cellIndex === cellIndex);
}
})();
