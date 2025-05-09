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

// Add Socket.IO real-time updates early in the file, after any variable declarations but before function definitions
// Socket.IO real-time updates
if (window.socket) {
  // Listen for card log updates
  window.socket.on('cardsChanged', () => {
    console.log('Card log changed, reloading...');
    loadCardLog(localStorage.getItem('eventId'));
  });
  
  // Also listen for general table updates
  window.socket.on('tableUpdated', () => {
    console.log('Table updated, reloading card log...');
    loadCardLog(localStorage.getItem('eventId'));
  });
}

// Utility and handler functions
async function saveToMongoDB() {
  const tables = document.querySelectorAll('.day-table');
  const cardLog = Array.from(tables).map(dayTable => {
    const date = dayTable.querySelector('h3').textContent;
    const entries = Array.from(dayTable.querySelectorAll('tbody tr')).map(row => {
      const cells = row.querySelectorAll('td');
      return {
        camera: cells[0].querySelector('select')?.value || '',
        card1: cells[1].querySelector('input')?.value || '',
        card2: cells[2].querySelector('input')?.value || '',
        user: cells[3].querySelector('select')?.value || ''
      };
    });
    return { date, entries };
  });

  await fetch(`${API_BASE}/api/tables/${localStorage.getItem('eventId')}/cardlog`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
    body: JSON.stringify({ cardLog })
  });
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
    tableContainer.addEventListener('click', (e) => {
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
          dayDiv.remove();
          saveToMongoDB();
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
  container.innerHTML = '';
  table.cardLog.forEach(day => addDaySection(day.date, day.entries));
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
  dayDiv.className = 'day-table';
  dayDiv.id = `day-${date}`;
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
  entries.forEach(entry => addRow(date, entry));
}

function addRow(date, entry = {}) {
  const tbody = document.getElementById(`tbody-${date}`);
  if (!tbody) {
    console.error(`Tbody not found for date: ${date}`);
    return;
  }
  
  const row = document.createElement('tr');

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
