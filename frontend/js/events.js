(function() {
const token = localStorage.getItem('token');
if (!token && !window.location.pathname.endsWith('index.html')) {
  alert('Not logged in');
  window.location.href = 'index.html';
}

let currentTableId = null;
let showArchived = false;

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
  const filteredTables = tables.filter(table => !!table.archived === showArchived);

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

    if (ownerList) ownerList.innerHTML = owners.map(u => `<li>${u.fullName} (${u.email})</li>`).join('');
    if (sharedList) sharedList.innerHTML = shared.map(u => `<li>${u.fullName} (${u.email})</li>`).join('');
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

  const res = await fetch(`${API_BASE}/api/tables/${currentTableId}/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token
    },
    body: JSON.stringify({ email, makeOwner })
  });

  const result = await res.json();
  alert(result.message || result.error || 'Done');
  closeModal();
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
            if (window.navigate) {
              window.navigate('users');
            } else {
              window.location.href = 'users.html';
            }
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

  // Load tables
  loadTables();
};

window.submitShare = submitShare;
window.closeModal = closeModal;
window.submitCreate = submitCreate;
window.hideCreateModal = hideCreateModal;

})();
