(function() {
const token = localStorage.getItem('token');
if (!token && !window.location.pathname.endsWith('index.html')) {
  alert('Not logged in');
  window.location.href = 'index.html';
}

let currentTableId = null;
let showArchived = false;
let searchEventsValue = '';

function getUserIdFromToken() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.id;
}

function showCreateModal() {
  const modal = document.getElementById('createModal');
  if (modal) modal.style.display = 'flex';
}

function hideCreateModal() {
  const modal = document.getElementById('createModal');
  if (modal) modal.style.display = 'none';
}

async function submitCreate() {
  const title = document.getElementById('newTitle')?.value;
  const client = document.getElementById('newClient')?.value;
  const startDate = document.getElementById('newStart')?.value;
  const endDate = document.getElementById('newEnd')?.value;

  if (!title || !startDate || !endDate) {
    alert("Please fill out all fields.");
    return;
  }

  // Ensure we're using ISO format without timezone issues
  const formatDateToISO = (dateStr) => {
    if (!dateStr) return '';
    // Parse the date and create an ISO string with time at noon UTC
    const date = new Date(dateStr);
    date.setUTCHours(12, 0, 0, 0);
    return date.toISOString();
  };

  const start = formatDateToISO(startDate);
  const end = formatDateToISO(endDate);

  const res = await fetch(`${API_BASE}/api/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token
    },
    body: JSON.stringify({
      title,
      general: { client, start, end }
    })
  });

  await res.json();
  hideCreateModal();
  loadTables();
}

async function loadTables() {
  const res = await fetch(`${API_BASE}/api/tables`, {
    headers: { Authorization: token }
  });

  const tables = await res.json();
  const userId = getUserIdFromToken();

  // Filter tables based on archived status
  let filteredTables = tables.filter(table => !!table.archived === showArchived);

  // Filter by search box
  if (searchEventsValue) {
    const q = searchEventsValue.toLowerCase();
    filteredTables = filteredTables.filter(table => {
      const title = (table.title || '').toLowerCase();
      const client = (table.general?.client || '').toLowerCase();
      return title.includes(q) || client.includes(q);
    });
  }

  const sortValue = document.getElementById('sortDropdown')?.value || 'newest';
  filteredTables.sort((a, b) => {
    // Create UTC dates for consistent sorting regardless of timezone
    const parseDateUTC = (dateStr) => {
      if (!dateStr) return new Date(0);
      const date = new Date(dateStr);
      // Create a UTC date to prevent timezone issues
      return date;
    };
    
    const dateA = parseDateUTC(a.general?.start || a.createdAt || 0);
    const dateB = parseDateUTC(b.general?.start || b.createdAt || 0);
    
    if (sortValue === 'newest') return dateB - dateA;
    if (sortValue === 'oldest') return dateA - dateB;
    if (sortValue === 'title') return (a.title || '').localeCompare(b.title || '');
    return 0;
  });

  const list = document.getElementById('tableList');
  if (list) list.innerHTML = '';

  filteredTables.forEach(table => {
    const general = table.general || {};
    const client = general.client || 'N/A';
    
    // Format dates consistently with UTC to prevent timezone shifts
    const formatDate = (dateStr) => {
      if (!dateStr) return 'N/A';
      const date = new Date(dateStr);
      // Use UTC date methods to prevent timezone issues
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        timeZone: 'UTC' // Prevent timezone shifts
      });
    };
    
    const start = formatDate(general.start);
    const end = formatDate(general.end);

    const card = document.createElement('div');
    card.className = 'table-card';

    const header = document.createElement('div');
    header.className = 'event-header';

    const title = document.createElement('h3');
    title.textContent = table.title;

    const details = document.createElement('div');
    details.className = 'event-details';
    details.innerHTML = `Client: ${client} <br> ${start} - ${end}`;

    header.appendChild(title);
    header.appendChild(details);

    const actions = document.createElement('div');
    actions.className = 'action-buttons';

    const openBtn = document.createElement('button');
    openBtn.className = 'btn-open';
    openBtn.textContent = 'Open';
    openBtn.onclick = () => {
      const page = 'general'; // Set this to the correct page identifier
      const tableId = table._id;
      window.navigate(page, tableId);
    };

    const isOwner = Array.isArray(table.owners) && table.owners.includes(userId);

    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn-share';
    shareBtn.textContent = 'Share';
    shareBtn.onclick = () => {
      openShareModal(table._id);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = async () => {
      if (confirm('Are you sure you want to delete this table?')) {
        await fetch(`${API_BASE}/api/tables/${table._id}`, {
          method: 'DELETE',
          headers: { Authorization: token }
        });
        loadTables();
      }
    };

    // Always add Open button
    actions.appendChild(openBtn);
    
    // Only add Share and Delete buttons for owners
    if (isOwner) {
      actions.appendChild(shareBtn);
      // Add Archive button before Delete for better grouping
      const archiveBtn = document.createElement('button');
      archiveBtn.className = 'btn-archive';
      archiveBtn.textContent = 'Archive';
      archiveBtn.onclick = async () => {
        if (confirm('Are you sure you want to archive this event?')) {
          await fetch(`${API_BASE}/api/tables/${table._id}/archive`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: token
            },
            body: JSON.stringify({ archived: true })
          });
          loadTables();
        }
      };
      actions.appendChild(archiveBtn);
      actions.appendChild(deleteBtn);
    }

    card.append(header, actions);
    if (list) list.appendChild(card);
  });

  renderCalendar(filteredTables);

  // Ensure only the correct view is visible
  const cal = document.getElementById('calendarViewContainer');
  if (list && cal) {
    if (cal.style.display === 'block') {
      list.style.display = 'none';
      cal.style.display = 'block';
    } else {
      list.style.display = 'flex';
      cal.style.display = 'none';
    }
  }
}

function renderCalendar(events) {
  const container = document.getElementById('calendarViewContainer');
  if (!container) return;
  container.innerHTML = '';

  // Get all event date ranges
  const eventObjs = events.map(table => {
    const general = table.general || {};
    return {
      id: table._id,
      title: table.title,
      start: general.start ? new Date(general.start) : null,
      end: general.end ? new Date(general.end) : null,
      color: '#CC0007', // main accent
    };
  }).filter(e => e.start && e.end);

  // Find min and max dates
  let minDate = null, maxDate = null;
  eventObjs.forEach(e => {
    if (!minDate || e.start < minDate) minDate = e.start;
    if (!maxDate || e.end > maxDate) maxDate = e.end;
  });
  if (!minDate || !maxDate) {
    container.innerHTML = '<div style="text-align:center; color:#888;">No events to display in calendar.</div>';
    return;
  }

  // Show current month by default
  let currentMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1);

  function renderMonth(monthDate) {
    container.innerHTML = '';
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekDay = firstDay.getDay();
    const gap = 8; // matches grid gap in CSS

    // Header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '18px';
    header.innerHTML = `
      <button id="prevMonthBtn" style="background:none;border:none;color:#CC0007;font-size:22px;cursor:pointer;">&#8592;</button>
      <span style="font-size:1.3em;font-weight:600;color:#CC0007;">${firstDay.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
      <button id="nextMonthBtn" style="background:none;border:none;color:#CC0007;font-size:22px;cursor:pointer;">&#8594;</button>
    `;
    container.appendChild(header);

    // Days of week
    const daysRow = document.createElement('div');
    daysRow.style.display = 'grid';
    daysRow.style.gridTemplateColumns = 'repeat(7, 1fr)';
    daysRow.style.gap = '4px';
    daysRow.style.marginBottom = '6px';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
      const el = document.createElement('div');
      el.textContent = d;
      el.style.textAlign = 'center';
      el.style.fontWeight = 'bold';
      el.style.color = '#a1a1a1';
      daysRow.appendChild(el);
    });
    container.appendChild(daysRow);

    // Calendar grid
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
    grid.style.gap = '8px';
    grid.style.background = 'linear-gradient(135deg, #fff 60%, #f8fafd 100%)';
    grid.style.borderRadius = '18px';
    grid.style.boxShadow = '0 8px 24px rgba(0,0,0,0.09)';
    grid.style.padding = '18px';
    grid.style.marginBottom = '18px';

    // Fill blanks for first week
    for (let i = 0; i < startWeekDay; i++) {
      const blank = document.createElement('div');
      grid.appendChild(blank);
    }
    // Fill days
    const dayCells = [];
    // For stacking: track max stack per week
    const weekStacks = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const cell = document.createElement('div');
      cell.style.minHeight = '60px';
      cell.style.borderRadius = '10px';
      cell.style.background = '#fff';
      cell.style.boxShadow = '0 2px 8px rgba(204,0,7,0.04)';
      cell.style.padding = '4px 4px 2px 4px';
      cell.style.position = 'relative';
      cell.style.display = 'flex';
      cell.style.flexDirection = 'column';
      cell.style.alignItems = 'flex-start';
      cell.style.justifyContent = 'flex-start';
      cell.style.cursor = 'pointer';
      cell.style.transition = 'background 0.15s, box-shadow 0.15s';
      cell.classList.add('calendar-day');
      // Day number
      const dayNum = document.createElement('div');
      dayNum.textContent = day;
      dayNum.className = 'calendar-day-num';
      cell.appendChild(dayNum);
      grid.appendChild(cell);
      dayCells.push(cell);
      // For stacking: initialize weekStacks
      const weekIdx = Math.floor((day + startWeekDay - 1) / 7);
      if (!weekStacks[weekIdx]) weekStacks[weekIdx] = [];
      weekStacks[weekIdx][(day + startWeekDay - 1) % 7] = [];
    }
    // Multi-day event rendering (after grid is built)
    eventObjs.forEach(ev => {
      // Find the first and last day in this month for the event
      const eventStart = new Date(Math.max(ev.start, firstDay));
      const eventEnd = new Date(Math.min(ev.end, lastDay));
      if (eventStart > lastDay || eventEnd < firstDay) return;
      // Calculate the start and end day index (0-based)
      let startIdx = eventStart.getDate() - 1;
      let endIdx = eventEnd.getDate() - 1;
      // For each week the event spans, render a pill in the first day of that week
      let idx = startIdx;
      while (idx <= endIdx) {
        // Find the week boundary
        const weekDay = (idx + startWeekDay) % 7;
        const weekIdx = Math.floor((idx + startWeekDay) / 7);
        const daysLeftInWeek = 7 - weekDay;
        const span = Math.min(endIdx - idx + 1, daysLeftInWeek);
        // Find the max stack index for this week segment
        let maxStack = 0;
        for (let d = 0; d < span; d++) {
          const cellStack = weekStacks[weekIdx][weekDay + d] || [];
          if (cellStack.length > maxStack) maxStack = cellStack.length;
        }
        // Assign this event to the next available stack index for all spanned days
        for (let d = 0; d < span; d++) {
          if (!weekStacks[weekIdx][weekDay + d]) weekStacks[weekIdx][weekDay + d] = [];
          weekStacks[weekIdx][weekDay + d][maxStack] = true;
        }
        // Render the pill at the correct stack index
        const pill = document.createElement('div');
        pill.textContent = ev.title;
        pill.className = 'calendar-event-pill';
        pill.style.background = ev.color;
        pill.style.color = '#fff';
        pill.style.position = 'absolute';
        pill.style.left = '0';
        pill.style.top = `${28 + maxStack * 28}px`;
        pill.style.height = '24px';
        pill.style.display = 'flex';
        pill.style.alignItems = 'center';
        pill.style.fontSize = '0.95em';
        pill.style.fontWeight = '600';
        pill.style.cursor = 'pointer';
        pill.style.boxShadow = '0 2px 8px rgba(204,0,7,0.08)';
        pill.style.zIndex = '2';
        pill.style.border = '2px solid #fff';
        pill.style.opacity = '0.96';
        pill.style.pointerEvents = 'auto';
        pill.onclick = (e) => {
          e.stopPropagation();
          window.navigate('general', ev.id);
        };
        // Calculate width: span * 100% + (span-1)*gap, but subtract 8px for the last pill in a week or for the event
        let pillWidth = `calc(${span * 100}% + ${(span - 1) * gap}px)`;
        if (idx + span - 1 === endIdx || ((idx + span + startWeekDay - 1) % 7 === 6)) {
          pillWidth = `calc(${span * 100}% + ${(span - 1) * gap}px - 8px)`;
        }
        pill.style.width = pillWidth;
        pill.style.maxWidth = pillWidth;
        pill.style.minWidth = pillWidth;
        // Append pill to the first cell of the span
        dayCells[idx].appendChild(pill);
        // Adjust minHeight of all spanned cells to fit stacked pills
        for (let d = 0; d < span; d++) {
          const cell = dayCells[idx + d];
          const minHeight = 60 + (maxStack * 28);
          if (cell) cell.style.minHeight = `${minHeight}px`;
        }
        idx += span;
      }
    });
    container.appendChild(grid);

    // Navigation
    document.getElementById('prevMonthBtn').onclick = () => {
      currentMonth = new Date(year, month - 1, 1);
      renderMonth(currentMonth);
    };
    document.getElementById('nextMonthBtn').onclick = () => {
      currentMonth = new Date(year, month + 1, 1);
      renderMonth(currentMonth);
    };
  }
  renderMonth(currentMonth);
}

async function openShareModal(tableId) {
  try {
    // First fetch the table to check ownership
    const res = await fetch(`${API_BASE}/api/tables/${tableId}`, {
      headers: { Authorization: token }
    });
    
    if (!res.ok) {
      throw new Error('Failed to fetch table details');
    }
    
    const table = await res.json();
    const userId = getUserIdFromToken();
    
    // Check if the current user is an owner
    const isOwner = Array.isArray(table.owners) && table.owners.includes(userId);
    
    // If not owner, show not authorized message and return early
    if (!isOwner) {
      alert('Not authorized. Only owners can share events.');
      return;
    }
    
    // If owner, proceed with opening the share modal
    currentTableId = tableId;
    const shareModal = document.getElementById('shareModal');
    if (shareModal) shareModal.style.display = 'flex';

    // Fetch users for the lists
    const userRes = await fetch(`${API_BASE}/api/users`, {
      headers: { Authorization: token }
    });
    const users = await userRes.json();

    const owners = users.filter(u => table.owners.includes(u._id));
    const shared = users.filter(u => table.sharedWith.includes(u._id));

    // Render into <ul> elements
    const ownerList = document.getElementById('ownerList')?.querySelector('ul');
    const sharedList = document.getElementById('sharedList')?.querySelector('ul');

    if (ownerList) ownerList.innerHTML = owners.map(u => `<li>${u.name || u.fullName || u.email} (${u.email})</li>`).join('');
    if (sharedList) sharedList.innerHTML = shared.map(u => `<li>${u.name || u.fullName || u.email} (${u.email})</li>`).join('');
  } catch (err) {
    console.error('Error in share modal:', err);
    alert('Error opening share options. Please try again.');
  }
}

function closeModal() {
  const shareModal = document.getElementById('shareModal');
  if (shareModal) shareModal.style.display = 'none';
  const shareEmail = document.getElementById('shareEmail');
  if (shareEmail) shareEmail.value = '';
  const makeOwnerCheckbox = document.getElementById('makeOwnerCheckbox');
  if (makeOwnerCheckbox) makeOwnerCheckbox.checked = false;

  const ownerList = document.getElementById('ownerList')?.querySelector('ul');
  const sharedList = document.getElementById('sharedList')?.querySelector('ul');
  if (ownerList) ownerList.innerHTML = '';
  if (sharedList) sharedList.innerHTML = '';
}

async function submitShare() {
  const email = document.getElementById('shareEmail')?.value;
  const makeOwner = document.getElementById('makeOwnerCheckbox')?.checked;

  if (!email || !currentTableId) return alert('Missing info');

  try {
    const res = await fetch(`${API_BASE}/api/tables/${currentTableId}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token
      },
      body: JSON.stringify({ email, makeOwner })
    });

    const result = await res.json();
    
    if (res.ok) {
      alert(`${result.message || 'Done'}. An email notification has been sent to ${email}.`);
    } else {
      alert(result.error || 'Error occurred while sharing');
    }
    
    closeModal();
  } catch (err) {
    console.error('Error sharing event:', err);
    alert('Failed to share event. Please try again.');
    closeModal();
  }
}

function logout() {
  localStorage.removeItem('fullName');
  localStorage.removeItem('token');
  window.location.replace('index.html');
}

window.initPage = function(id) {
  console.log('initPage called for events');
  // Set username display
  const fullName = localStorage.getItem('fullName') || 'User';
  const usernameDisplayEl = document.getElementById('usernameDisplay');
  if (usernameDisplayEl) usernameDisplayEl.textContent = `Welcome, ${fullName}`;

  // Add Admin Console button if user is admin
  try {
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      
      // Add a utility to check admin role from console
      window.checkAdminStatus = function() {
        const token = localStorage.getItem('token');
        if (!token) return { error: 'No token found' };
        
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          return { 
            isAdmin: payload.role === 'admin',
            role: payload.role,
            fullName: payload.fullName,
            id: payload.id,
            tokenExpiry: new Date(payload.exp * 1000).toLocaleString()
          };
        } catch (err) {
          return { error: 'Invalid token', details: err.message };
        }
      };
      
      if (payload.role === 'admin') {
        let adminBtn = document.getElementById('adminConsoleBtn');
        if (!adminBtn) {
          adminBtn = document.createElement('button');
          adminBtn.id = 'adminConsoleBtn';
          adminBtn.className = 'btn-admin';
          adminBtn.textContent = 'Admin Console';
          adminBtn.onclick = () => {
            window.location.href = '/pages/users.html';
          };
          // Insert before logout button
          const logoutBtn = document.getElementById('logoutBtn');
          if (logoutBtn && logoutBtn.parentNode) {
            logoutBtn.parentNode.insertBefore(adminBtn, logoutBtn);
          }
        }
      }
    }
  } catch (e) { console.error('Error adding admin button:', e); }

  // Set up event listeners
  const sortDropdown = document.getElementById('sortDropdown');
  if (sortDropdown) sortDropdown.addEventListener('change', loadTables);

  // Set up logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = logout;

  // Set up Create Event button
  const createBtn = document.querySelector('.btn-create');
  if (createBtn) createBtn.onclick = showCreateModal;

  // Set up Archived Events toggle button
  const toggleBtn = document.getElementById('toggleArchivedBtn');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      showArchived = !showArchived;
      toggleBtn.textContent = showArchived ? 'Show Active Events' : 'Archived Events';
      loadTables();
    };
    toggleBtn.textContent = showArchived ? 'Show Active Events' : 'Archived Events';
  }

  // Set up Calendar View button
  const calendarBtn = document.getElementById('calendarViewBtn');
  if (calendarBtn) {
    calendarBtn.onclick = () => {
      const list = document.getElementById('tableList');
      const cal = document.getElementById('calendarViewContainer');
      if (!list || !cal) return;
      if (cal.style.display === 'none' || cal.style.display === '') {
        list.style.display = 'none';
        cal.style.display = 'block';
        // Use the same filtered tables as in loadTables
        fetch(`${API_BASE}/api/tables`, { headers: { Authorization: token } })
          .then(r => r.json())
          .then(tables => {
            const showArchived = !!document.getElementById('toggleArchivedBtn')?.classList.contains('active');
            const filteredTables = tables.filter(table => !!table.archived === showArchived);
            renderCalendar(filteredTables);
          });
      } else {
        cal.style.display = 'none';
        list.style.display = 'flex';
      }
    };
  }

  // Attach search box event listener (SPA-safe)
  const searchInput = document.getElementById('searchEventsInput');
  if (searchInput && !searchInput._listenerAttached) {
    searchInput.addEventListener('input', e => {
      searchEventsValue = e.target.value;
      loadTables();
    });
    searchInput._listenerAttached = true;
  }

  // Load tables
  loadTables();
};

window.submitShare = submitShare;
window.closeModal = closeModal;
window.submitCreate = submitCreate;
window.hideCreateModal = hideCreateModal;

// Exposing the loadTables function to the global scope for Socket.IO updates
window.loadTables = loadTables;

// Setup Socket.IO event listeners for real-time updates
function setupSocketListeners() {
  if (!window.socket) {
    console.warn('Socket.IO not available, real-time updates disabled');
    return;
  }
  
  console.log('Setting up Socket.IO listeners for events page');
  
  // Define the events that should trigger a table reload
  const eventsToMonitor = [
    'tableCreated',
    'tableUpdated',
    'tableDeleted',
    'tableArchived',
    'generalChanged' // When event details are updated
  ];
  
  // Setup listeners for each event
  eventsToMonitor.forEach(eventName => {
    window.socket.on(eventName, (data) => {
      console.log(`${eventName} event received, reloading tables`);
      loadTables();
    });
  });
}

// Run the setup when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupSocketListeners);
} else {
  // Small delay to ensure Socket.IO is loaded
  setTimeout(setupSocketListeners, 100);
}

})();
