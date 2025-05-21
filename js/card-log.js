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

// Add Socket.IO real-time updates early in the file, after any variable declarations but before function definitions
// Socket.IO real-time updates
if (window.socket) {
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
    if (processingSocketEvent) return;
    processingSocketEvent = true;
    
    try {
      const currentEventId = localStorage.getItem('eventId');
      if (!data || data.tableId !== currentEventId || !data.cardLog) return;
      console.log(`Received cardLogUpdated for date: ${data.cardLog.date}`);
      
      // Update the day section if it exists
      const dayDiv = document.getElementById(`day-${data.cardLog.date}`);
      if (dayDiv) {
        console.log("Updating day section in UI");
        dayDiv.remove();
        addDaySection(data.cardLog.date, data.cardLog.entries);
      } else {
        console.log("Day doesn't exist in UI, ignoring update");
      }
    } finally {
      setTimeout(() => {
        processingSocketEvent = false;
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
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveToMongoDB, 250);
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
        addRow(date);
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

    tableContainer.addEventListener('input', debounceSave);
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
  
  // Reset global variables
  users = [];
  isOwner = false;
  
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
    localStorage.setItem('eventId', tableId);

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

    // Load bottom nav HTML
  const navContainer = document.createElement('div');
  navContainer.id = 'bottomNavPlaceholder';
    const navRes = await fetch('bottom-nav.html');
    const navHTML = await navRes.text();
    navContainer.innerHTML = navHTML;
  document.body.appendChild(navContainer);

  // Add SPA navigation to nav links
  const navLinks = navContainer.querySelectorAll('a[data-page]');
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const page = link.getAttribute('data-page');
      window.navigate(page, getTableId && getTableId());
    });
  });

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
      ${isOwner ? `<button class="delete-day-btn" data-date="${date}" title="Delete Day" style="background: transparent; border: none; font-size: 20px; cursor: pointer;">🗑️</button>` : ''}
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
    <div style="text-align: center; margin-top: 10px;">
      <button class="add-row-btn" data-date="${date}">Add Row</button>
    </div>
  `;
  container.appendChild(dayDiv);
  
  // Make sure entries is an array
  const entriesArray = Array.isArray(entries) ? entries : [];
  entriesArray.forEach(entry => addRow(date, entry));
}

function addRow(date, entry = {}) {
  const tbody = document.getElementById(`tbody-${date}`);
  if (!tbody) {
    console.error(`Tbody not found for date: ${date}`);
    return;
  }
  
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
    ${isOwner ? '<button class="delete-row-btn" title="Delete Row" style="background: transparent; border: none; font-size: 18px; cursor: pointer; color: #d11a2a;">🗑️</button>' : ''}
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

// Add cleanup function to window for the app.js navigation system
window.cleanupCardLogPage = cleanupCardLogPage;

// Export the initPage function
window.initPage = window.initPage;
})();
