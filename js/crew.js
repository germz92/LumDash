(function() {
window.initPage = undefined;
window.token = window.token || localStorage.getItem('token');

const params = new URLSearchParams(window.location.search);
const tableId = params.get('id') || localStorage.getItem('eventId');

// Add guard for missing ID
if (!tableId) {
  console.warn('No table ID provided, redirecting to dashboard...');
  window.location.href = 'dashboard.html';
  return;
}

let tableData = null;
let cachedUsers = [];
let cachedRoles = [
  "Lead Photographer",
  "Additional Photographer",
  "Lead Videographer",
  "Additional Videographer",
  "Headshot Booth Photographer",
  "Assistant"
];
let isOwner = false;

// Socket.IO real-time updates
if (window.socket) {
  // Create a custom event for crew changes
  window.socket.on('crewChanged', () => {
    console.log('Crew data changed, reloading...');
    loadTable();
  });
  
  // Also listen for general table updates as they might affect crew
  window.socket.on('tableUpdated', () => {
    console.log('Table updated, reloading crew data...');
    loadTable();
  });
}

function goBack() {
  window.location.href = `event.html?id=${tableId}`;
}

function calculateHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startDate = new Date(0, 0, 0, sh, sm);
  const endDate = new Date(0, 0, 0, eh, em);
  const diff = (endDate - startDate) / (1000 * 60 * 60);
  return Math.max(diff.toFixed(2), 0);
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [hour, minute] = timeStr.split(':').map(Number);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const adjustedHour = hour % 12 || 12;
  return `${adjustedHour}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

function formatDateLocal(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function getUserIdFromToken() {
  if (!token) return null;
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.id;
}

async function loadTable() {
  const res = await fetch(`${API_BASE}/api/tables/${tableId}`, {
    headers: { Authorization: token }
  });

  if (!res.ok) {
    alert('Failed to load table. You might not have access.');
    return;
  }

  tableData = await res.json();
  const userId = getUserIdFromToken();
  isOwner = Array.isArray(tableData.owners) && tableData.owners.includes(userId);

  if (!isOwner) {
    const addDateBtn = document.getElementById('addDateBtn');
    if (addDateBtn) addDateBtn.style.display = 'none';

    const newDateInput = document.getElementById('newDate');
    if (newDateInput) newDateInput.style.display = 'none';
  }

  if (!cachedUsers.length) await preloadUsers();
  const tableTitleEl = document.getElementById('tableTitle');
  if (tableTitleEl) tableTitleEl.textContent = tableData.title;
  renderTableSection();
  updateCrewCount();
}


async function preloadUsers() {
  const res = await fetch(`${API_BASE}/api/users`, {
    headers: { Authorization: token }
  });
  const users = await res.json();
  users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  cachedUsers = users.map(u => u.name || u.email);
}

function renderTableSection() {
  const container = document.getElementById('dateSections');
  container.innerHTML = '';

  const filterDropdown = document.getElementById('filterDate');
  const sortDirection = document.getElementById('sortDirection')?.value || 'asc';
  const searchQuery = document.getElementById('searchInput')?.value.toLowerCase() || '';

  let dates = [...new Set(tableData.rows.map(row => row.date))];
  dates.sort((a, b) => new Date(a) - new Date(b));

  if (filterDropdown) {
    const currentValue = filterDropdown.value;
    filterDropdown.innerHTML = `<option value="">Show All</option>` +
      dates.map(d => `<option value="${d}" ${d === currentValue ? 'selected' : ''}>${formatDateLocal(d)}</option>`).join('');
  }

  const selectedDate = filterDropdown?.value;
  if (selectedDate) {
    dates = dates.filter(d => d === selectedDate);
  }

  if (sortDirection === 'desc') {
    dates.reverse();
  }

  const visibleNames = new Set();

  
  dates.forEach(date => {
    const sectionBox = document.createElement('div');
    sectionBox.className = 'date-section';

    const headerWrapper = document.createElement('div');
    headerWrapper.style.display = 'flex';
    headerWrapper.style.alignItems = 'center';
    headerWrapper.style.justifyContent = 'space-between';
    headerWrapper.style.marginBottom = '8px';

    const header = document.createElement('h2');
    header.textContent = formatDateLocal(date);
    headerWrapper.appendChild(header);

    if (isOwner) {
      const deleteDateBtn = document.createElement('button');
      deleteDateBtn.textContent = '🗑️';
      deleteDateBtn.style.background = 'transparent';
      deleteDateBtn.style.border = 'none';
      deleteDateBtn.style.cursor = 'pointer';
      deleteDateBtn.style.fontSize = '18px';
      deleteDateBtn.title = 'Delete Date';
      deleteDateBtn.onclick = () => deleteDate(date);
      headerWrapper.appendChild(deleteDateBtn);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';

    const table = document.createElement('table');
    table.style.tableLayout = 'fixed';
    table.style.width = '100%';
    table.innerHTML = `
      <colgroup>
        <col style="width: 16%;">
        <col style="width: 12%;">
        <col style="width: 12%;">
        <col style="width: 8%;">
        <col style="width: 19%;">
        <col style="width: 19%;">
        <col style="width: 14%;">
      </colgroup>
    `;

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Name</th>
        <th>Start</th>
        <th>End</th>
        <th>Total</th>
        <th>Role</th>
        <th>Notes</th>
        <th>Action</th>
      </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    const visibleRows = tableData.rows.filter(row => {
      if (row.date !== date || row.role === '__placeholder__') return false;
      const text = [row.name, row.role, row.notes].join(' ').toLowerCase();
      return text.includes(searchQuery);
    });

    visibleRows.forEach(row => {
      const rowId = row._id;
      const prefix = `row-${rowId}`;
      const tr = document.createElement('tr');
      tr.id = prefix;
      tr.setAttribute('data-id', rowId);
    
      if (isOwner) {
        tr.setAttribute('draggable', 'true');
    
        tr.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', rowId);
          tr.classList.add('dragging');
        });
    
        tr.addEventListener('dragend', () => {
          tr.classList.remove('dragging');
        });
    
        tr.addEventListener('dragover', (e) => e.preventDefault());
    
        tr.addEventListener('drop', (e) => {
          e.preventDefault();
          const draggedId = e.dataTransfer.getData('text/plain');
          handleDrop(rowId, draggedId);
        });
      }
    
      tr.innerHTML = `
        <td><span id="${prefix}-name">${row.name}</span></td>
        <td><span id="${prefix}-startTime">${formatTime(row.startTime)}</span></td>
        <td><span id="${prefix}-endTime">${formatTime(row.endTime)}</span></td>
        <td id="${prefix}-totalHours">${row.totalHours}</td>
        <td><span id="${prefix}-role">${row.role}</span></td>
        <td><span id="${prefix}-notes">${row.notes}</span></td>
        <td class="actions-cell" style="text-align: center;">
          ${isOwner ? `
            <div class="icon-buttons">
              <button class="edit-row-btn" onclick="toggleEditById('${rowId}')" title="Edit">✏️</button>
              <button class="edit-row-btn" onclick="saveEditById('${rowId}')" title="Save" style="display:none;">💾</button>
              <button class="delete-row-btn" onclick="deleteRowById('${rowId}')" title="Delete">🗑️</button>
            </div>
          ` : ''}
        </td>
      `;
    
      tbody.appendChild(tr);
    
      if (row.name && row.name.trim()) {
        visibleNames.add(row.name.trim());
      }
    });
    

    if (isOwner) {
      const actionRow = document.createElement('tr');
      const actionTd = document.createElement('td');
      actionTd.colSpan = 7;
      const btnContainer = document.createElement('div');
      btnContainer.className = 'add-row-btn-container';
      const addBtn = document.createElement('button');
      addBtn.className = 'add-row-btn';
      addBtn.textContent = 'Add Row';
      addBtn.onclick = () => showRowInputs(date, tbody);
      btnContainer.appendChild(addBtn);
      actionTd.appendChild(btnContainer);
      actionRow.appendChild(actionTd);
      tbody.appendChild(actionRow);
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);
    sectionBox.appendChild(headerWrapper);
    sectionBox.appendChild(wrapper);
    container.appendChild(sectionBox);
  });

  const crewCountEl = document.getElementById('crewCount');
  if (crewCountEl) {
    crewCountEl.innerHTML = `<strong>Crew Count: ${visibleNames.size}</strong>`;
  }
}



async function saveEditById(rowId) {
  if (!isOwner) return;

  const prefix = `row-${rowId}`;
  const row = tableData.rows.find(r => r._id === rowId);
  if (!row) return;

  const nameInput = document.getElementById(`${prefix}-name`);
  const startInput = document.getElementById(`${prefix}-startTime`);
  const endInput = document.getElementById(`${prefix}-endTime`);
  const roleInput = document.getElementById(`${prefix}-role`);
  const notesInput = document.getElementById(`${prefix}-notes`);

  if (!nameInput || !startInput || !endInput || !roleInput || !notesInput) {
    alert('Some editable fields are missing in the DOM.');
    console.error('Missing fields:', {
      nameInput,
      startInput,
      endInput,
      roleInput,
      notesInput
    });
    return;
  }

  const startTime = startInput.value;
  const endTime = endInput.value;

  const updatedRow = {
    _id: rowId,
    date: row.date,
    name: nameInput.value,
    startTime,
    endTime,
    totalHours: calculateHours(startTime, endTime),
    role: roleInput.value,
    notes: notesInput.value
  };

  const res = await fetch(`${API_BASE}/api/tables/${tableId}/rows/${rowId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token
    },
    body: JSON.stringify(updatedRow)
  });

  if (res.ok) {
    await loadTable();
  } else {
    const errorText = await res.text();
    alert('Failed to save row.');
    console.error('Save failed:', errorText);
  }
}



function toggleEditById(rowId) {
  if (!isOwner) return;

  const row = tableData.rows.find(r => r._id === rowId);
  if (!row) return alert('Row not found.');

  const prefix = `row-${rowId}`;
  const tr = document.getElementById(prefix);
  if (!tr) return;

  tr.querySelector(`#${prefix}-name`).outerHTML = `
    <select id="${prefix}-name">
      <option value="">-- Select Name --</option>
      ${cachedUsers.map(u => `<option value="${u}" ${u === row.name ? 'selected' : ''}>${u}</option>`).join('')}
      <option value="__add_new__">➕ Add new name</option>
    </select>
  `;

  tr.querySelector(`#${prefix}-role`).outerHTML = `
    <select id="${prefix}-role">
      <option value="">-- Select Role --</option>
      ${cachedRoles.map(r => `<option value="${r}" ${r === row.role ? 'selected' : ''}>${r}</option>`).join('')}
      <option value="__add_new__">➕ Add new role</option>
    </select>
  `;

  tr.querySelector(`#${prefix}-startTime`).outerHTML = `<input type="time" id="${prefix}-startTime" value="${row.startTime}">`;
  tr.querySelector(`#${prefix}-endTime`).outerHTML = `<input type="time" id="${prefix}-endTime" value="${row.endTime}">`;
  tr.querySelector(`#${prefix}-notes`).outerHTML = `<input type="text" id="${prefix}-notes" value="${row.notes}">`;

  const totalHoursEl = document.getElementById(`${prefix}-totalHours`);
  const updateHours = () => {
    const start = document.getElementById(`${prefix}-startTime`).value;
    const end = document.getElementById(`${prefix}-endTime`).value;
    totalHoursEl.textContent = calculateHours(start, end);
  };
  document.getElementById(`${prefix}-startTime`).addEventListener('input', updateHours);
  document.getElementById(`${prefix}-endTime`).addEventListener('input', updateHours);

  setTimeout(() => {
    const nameSelect = document.getElementById(`${prefix}-name`);
    nameSelect.addEventListener('change', () => {
      if (nameSelect.value === '__add_new__') {
        const newName = prompt('Enter new name:');
        if (newName && !cachedUsers.includes(newName)) {
          cachedUsers.push(newName);
          cachedUsers.sort();
        }
        nameSelect.innerHTML = `
          <option value="">-- Select Name --</option>
          ${cachedUsers.map(u => `<option value="${u}" ${u === newName ? 'selected' : ''}>${u}</option>`).join('')}
          <option value="__add_new__">➕ Add new name</option>
        `;
        nameSelect.value = newName;
      }
    });

    const roleSelect = document.getElementById(`${prefix}-role`);
    roleSelect.addEventListener('change', () => {
      if (roleSelect.value === '__add_new__') {
        const newRole = prompt('Enter new role:');
        if (newRole && !cachedRoles.includes(newRole)) {
          cachedRoles.push(newRole);
          cachedRoles.sort();
        }
        roleSelect.innerHTML = `
          <option value="">-- Select Role --</option>
          ${cachedRoles.map(r => `<option value="${r}" ${r === newRole ? 'selected' : ''}>${r}</option>`).join('')}
          <option value="__add_new__">➕ Add new role</option>
        `;
        roleSelect.value = newRole;
      }
    });
  }, 0);

  // Get the icon-buttons container
  const buttonsContainer = tr.querySelector('td:last-child .icon-buttons');
  if (buttonsContainer) {
    const editButton = buttonsContainer.querySelector('button:nth-child(1)');
    const saveButton = buttonsContainer.querySelector('button:nth-child(2)');
    
    if (editButton && saveButton) {
      editButton.style.display = 'none';
      saveButton.style.display = 'inline-flex';
    }
  }
}


async function deleteRowById(rowId) {
  if (!isOwner) return;

  const res = await fetch(`${API_BASE}/api/tables/${tableId}/rows-by-id/${rowId}`, {
    method: 'DELETE',
    headers: { Authorization: token }
  });

  if (res.ok) {
    await loadTable();
  } else {
    alert('Failed to delete row.');
  }
}

async function deleteDate(date) {
  if (!isOwner) return;
  if (!confirm('Delete this entire day?')) return;

  tableData.rows = tableData.rows.filter(row => row.date !== date);

  await fetch(`${API_BASE}/api/tables/${tableId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token
    },
    body: JSON.stringify({ rows: tableData.rows })
  });

  await loadTable();
}

function showRowInputs(date, tbody) {
  const inputRow = document.createElement('tr');
  const nameId = `name-${date}`;
  const startId = `start-${date}`;
  const endId = `end-${date}`;
  const roleId = `role-${date}`;
  const notesId = `notes-${date}`;
  const hoursId = `hours-${date}`;

  inputRow.innerHTML = `
    <td>
      <select id='${nameId}'>
        <option value="">-- Select Name --</option>
        ${cachedUsers.map(u => `<option value="${u}">${u}</option>`).join('')}
        <option value="__add_new__">➕ Add new name</option>
      </select>
    </td>
    <td><input type='time' step='900' id='${startId}'></td>
    <td><input type='time' step='900' id='${endId}'></td>
    <td><input id='${hoursId}' disabled></td>
    <td>
      <select id='${roleId}'>
        <option value="">-- Select Role --</option>
        ${cachedRoles.map(r => `<option value="${r}">${r}</option>`).join('')}
        <option value="__add_new__">➕ Add new role</option>
      </select>
    </td>
    <td><input id='${notesId}'></td>
    <td><button onclick="addRowToDate('${date}')">Save</button></td>
  `;
  tbody.insertBefore(inputRow, tbody.lastElementChild);

  setTimeout(() => {
    const nameSelect = document.getElementById(nameId);
    nameSelect.addEventListener('change', () => {
      if (nameSelect.value === '__add_new__') {
        const newName = prompt('Enter new name:');
        if (newName && !cachedUsers.includes(newName)) {
          cachedUsers.push(newName);
          cachedUsers.sort();
          nameSelect.innerHTML = `
            <option value="">-- Select Name --</option>
            ${cachedUsers.map(u => `<option value="${u}">${u}</option>`).join('')}
            <option value="__add_new__">➕ Add new name</option>
          `;
          nameSelect.value = newName;
        } else {
          nameSelect.value = '';
        }
      }
    });

    const roleSelect = document.getElementById(roleId);
    roleSelect.addEventListener('change', () => {
      if (roleSelect.value === '__add_new__') {
        const newRole = prompt('Enter new role:');
        if (newRole && !cachedRoles.includes(newRole)) {
          cachedRoles.push(newRole);
          cachedRoles.sort();
          roleSelect.innerHTML = `
            <option value="">-- Select Role --</option>
            ${cachedRoles.map(r => `<option value="${r}">${r}</option>`).join('')}
            <option value="__add_new__">➕ Add new role</option>
          `;
          roleSelect.value = newRole;
        } else {
          roleSelect.value = '';
        }
      }
    });

    const startInput = document.getElementById(startId);
    const endInput = document.getElementById(endId);
    const hoursInput = document.getElementById(hoursId);

    function updateHours() {
      const start = startInput.value;
      const end = endInput.value;
      hoursInput.value = calculateHours(start, end);
    }

    startInput.addEventListener('input', updateHours);
    endInput.addEventListener('input', updateHours);
  }, 0);
}



async function addDateSection() {
  if (!isOwner) return;
  const date = document.getElementById('newDate').value;
  if (!date) return alert('Please select a date');

  const exists = tableData.rows.some(row => row.date === date);
  if (exists) {
    alert('This date already exists.');
    return;
  }

  const newRow = {
    date,
    role: '__placeholder__',
    name: '',
    startTime: '',
    endTime: '',
    totalHours: 0,
    notes: ''
  };

  await fetch(`${API_BASE}/api/tables/${tableId}/rows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token
    },
    body: JSON.stringify(newRow)
  });

  document.getElementById('newDate').value = '';
  await loadTable();

  const lastSection = document.querySelectorAll('.date-section');
  const section = lastSection[lastSection.length - 1];
  const tbody = section.querySelector('tbody');
  showRowInputs(date, tbody);
}

async function addRowToDate(date) {
  if (!isOwner) return;
  const start = document.getElementById(`start-${date}`).value;
  const end = document.getElementById(`end-${date}`).value;
  const row = {
    date,
    role: document.getElementById(`role-${date}`).value,
    name: document.getElementById(`name-${date}`).value,
    startTime: start,
    endTime: end,
    totalHours: calculateHours(start, end),
    notes: document.getElementById(`notes-${date}`).value
  };

  await fetch(`${API_BASE}/api/tables/${tableId}/rows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token
    },
    body: JSON.stringify(row)
  });

  await loadTable();
}

function updateCrewCount() {
  const names = tableData.rows
    .map(row => (row.name || '').trim())
    .filter(name => name.length > 0);

  const uniqueNames = [...new Set(names)];
  const crewCountEl = document.getElementById('crewCount');
  if (crewCountEl) {
    crewCountEl.innerHTML = `<strong>Crew Count: ${uniqueNames.length}</strong>`;
  }
}

function clearDateFilter() {
  document.getElementById('filterDate').value = '';
  renderTableSection();
}

async function saveRowOrder() {
  await fetch(`${API_BASE}/api/tables/${tableId}/reorder-rows`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token
    },
    body: JSON.stringify({ rows: tableData.rows })
  });
}

function handleDrop(targetId, draggedId) {
  if (targetId === draggedId) return;

  const rows = tableData.rows;
  const draggedIndex = rows.findIndex(r => r._id === draggedId);
  const targetIndex = rows.findIndex(r => r._id === targetId);

  if (draggedIndex === -1 || targetIndex === -1) return;

  if (rows[draggedIndex].date !== rows[targetIndex].date) {
    alert("You can only reorder within the same day.");
    return;
  }

  const [movedRow] = rows.splice(draggedIndex, 1);
  rows.splice(targetIndex, 0, movedRow);

  saveRowOrder();
  renderTableSection();
}

function attachEventListeners() {
  const addDateBtn = document.getElementById('addDateBtn');
  if (addDateBtn) addDateBtn.onclick = addDateSection;
  const filterDate = document.getElementById('filterDate');
  if (filterDate) filterDate.onchange = renderTableSection;
  const sortDirection = document.getElementById('sortDirection');
  if (sortDirection) sortDirection.onchange = renderTableSection;
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.oninput = renderTableSection;
}

function initPage(id) {
  loadTable();
  attachEventListeners();
  document.body.classList.add('crew-page');
}

window.initPage = initPage;
window.addDateSection = addDateSection;
window.addRowToDate = addRowToDate;
window.saveEditById = saveEditById;
window.toggleEditById = toggleEditById;
window.deleteRowById = deleteRowById;
window.deleteDate = deleteDate;
window.renderTableSection = renderTableSection;
})();
