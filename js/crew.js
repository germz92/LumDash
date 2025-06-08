// CREW PAGE v2.1 - DRAG_DROP_FIX - Fixed drag and drop persistence by using correct API endpoint
(function() {
window.initPage = undefined;
window.token = window.token || localStorage.getItem('token');

// Use a function to get the current table ID to ensure it's always current
function getCurrentTableId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id') || localStorage.getItem('eventId');
}

// Get initial tableId
let tableId = getCurrentTableId();

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
  window.socket.on('crewChanged', (data) => {
    // Always get the most current tableId
    const currentTableId = getCurrentTableId();
    
    // Only reload if it's for the current table
    console.log('Crew data changed, checking if relevant...');
    if (data && data.tableId && data.tableId !== currentTableId) {
      console.log('Update was for a different table, ignoring');
      return;
    }
    console.log('Reloading crew data for current table');
    tableId = currentTableId; // Update the tableId
    loadTable(); 
  });
  
  // Also listen for general table updates as they might affect crew
  window.socket.on('tableUpdated', (data) => {
    // Always get the most current tableId
    const currentTableId = getCurrentTableId();
    
    console.log('Table updated, checking if relevant...');
    if (data && data.tableId && data.tableId !== currentTableId) {
      console.log('Update was for a different table, ignoring');
      return;
    }
    console.log('Reloading crew data for current table');
    tableId = currentTableId; // Update the tableId
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
  // Always ensure we're using the current tableId
  const currentTableId = getCurrentTableId();
  if (currentTableId !== tableId) {
    console.log(`TableId changed from ${tableId} to ${currentTableId}`);
    tableId = currentTableId;
  }
  
  console.log(`Loading table data for tableId: ${tableId}`);
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
  cachedUsers = users;
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
      deleteDateBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
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
              <button class="edit-row-btn" onclick="toggleEditById('${rowId}')" title="Edit"><span class="material-symbols-outlined">edit</span></button>
              <button class="edit-row-btn save-row-btn" onclick="saveEditById('${rowId}')" title="Save" style="display:none;"><span class="material-symbols-outlined">save</span></button>
              <button class="delete-row-btn" onclick="deleteRowById('${rowId}')" title="Delete"><span class="material-symbols-outlined">delete</span></button>
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

  // After rendering all sections, add Crew List button for owners
  if (isOwner) {
    let crewListBtn = document.getElementById('crewListBtn');
    if (!crewListBtn) {
      crewListBtn = document.createElement('button');
      crewListBtn.id = 'crewListBtn';
      crewListBtn.textContent = 'Crew List';
      crewListBtn.style = 'margin: 0 0 0 8px; background: #e0e0e0; color: #333; border: 1px solid #bbb; border-radius: 6px; padding: 8px 18px; font-weight: 400; font-size: 15px; box-shadow: none; cursor: pointer; display: inline-block;';
      crewListBtn.onclick = showCrewListModal;
      // Insert into the crewListBtnContainer in the header
      const btnContainer = document.getElementById('crewListBtnContainer');
      if (btnContainer) {
        btnContainer.innerHTML = '';
        btnContainer.appendChild(crewListBtn);
      } else {
        document.body.insertBefore(crewListBtn, document.body.firstChild);
      }
    }
  }
}

function showCrewListModal() {
  // Gather all unique crew names from tableData.rows
  const uniqueCrewNames = Array.from(new Set((tableData.rows || []).map(row => row.name).filter(Boolean)));
  // Map names to emails using cachedUsers
  const crewArr = uniqueCrewNames.map(name => {
    const user = cachedUsers.find(u => u.name === name);
    return { name, email: user ? user.email : null };
  });
  if (crewArr.length === 0) {
    alert('No crew found.');
    return;
  }
  // Modal
  let modal = document.getElementById('crewListModal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'crewListModal';
  modal.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:18px;max-width:420px;width:92vw;box-shadow:0 12px 40px rgba(204,0,7,0.13),0 2px 8px rgba(0,0,0,0.08);padding:40px 28px;display:flex;flex-direction:column;gap:18px;align-items:center;">
      <h3 style='color:#CC0007;margin:0 0 8px 0;'>Crew List</h3>
      <ul style='list-style:none;padding:0;width:100%;'>
        ${crewArr.map(({name, email}) => `<li style='margin-bottom:8px;'><strong>${name}</strong>${email ? `<br><a href='mailto:${email}' style='color:#CC0007;text-decoration:underline;'>${email}</a>` : ''}</li>`).join('')}
      </ul>
      <button id='emailEveryoneBtn' style='background:#e0e0e0;color:#333;border:1px solid #bbb;border-radius:8px;padding:10px 22px;font-weight:400;font-size:16px;box-shadow:none;cursor:pointer;'>Email Everyone</button>
      <button id='closeCrewListModalBtn' style='background:#6c757d;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-weight:600;font-size:16px;box-shadow:0 2px 8px rgba(204,0,7,0.08);cursor:pointer;'>Close</button>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('closeCrewListModalBtn').onclick = () => modal.remove();
  document.getElementById('emailEveryoneBtn').onclick = () => {
    const allEmails = crewArr.filter(c => c.email).map(c => c.email).join(',');
    if (allEmails) {
      const mailto = `mailto:${allEmails}`;
      navigator.clipboard.writeText(mailto);
      window.location.href = mailto;
    } else {
      alert('No emails found for crew.');
    }
  };
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
      ${cachedUsers.map(u => `<option value="${u.name}" ${u.name === row.name ? 'selected' : ''}>${u.name}</option>`).join('')}
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
        if (newName && !cachedUsers.some(u => u.name === newName)) {
          cachedUsers.push({ name: newName });
          cachedUsers.sort((a, b) => a.name.localeCompare(b.name));
        }
        nameSelect.innerHTML = `
          <option value="">-- Select Name --</option>
          ${cachedUsers.map(u => `<option value="${u.name}" ${u.name === newName ? 'selected' : ''}>${u.name}</option>`).join('')}
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
        ${cachedUsers.map(u => `<option value="${u.name}">${u.name}</option>`).join('')}
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
    <td><button class="add-row-save-btn" onclick="addRowToDate('${date}')" title="Save"><span class="material-symbols-outlined">save</span></button></td>
  `;
  tbody.insertBefore(inputRow, tbody.lastElementChild);

  setTimeout(() => {
    const nameSelect = document.getElementById(nameId);
    nameSelect.addEventListener('change', () => {
      if (nameSelect.value === '__add_new__') {
        const newName = prompt('Enter new name:');
        if (newName && !cachedUsers.some(u => u.name === newName)) {
          cachedUsers.push({ name: newName });
          cachedUsers.sort((a, b) => a.name.localeCompare(b.name));
          nameSelect.innerHTML = `
            <option value="">-- Select Name --</option>
            ${cachedUsers.map(u => `<option value="${u.name}">${u.name}</option>`).join('')}
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

  // Ensure we're using the current tableId
  tableId = getCurrentTableId();
  console.log(`Adding date section for tableId: ${tableId}`);

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
  
  // Ensure we're using the current tableId
  tableId = getCurrentTableId();
  console.log(`Adding row to date for tableId: ${tableId}`);
  
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
  try {
    console.log('🔄 CREW: Saving row order...');
    const response = await fetch(`${API_BASE}/api/tables/${tableId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token
      },
      body: JSON.stringify({ rows: tableData.rows })
    });

    if (!response.ok) {
      throw new Error(`Failed to save row order: ${response.status}`);
    }

    console.log('✅ CREW: Row order saved successfully');
  } catch (error) {
    console.error('❌ CREW: Failed to save row order:', error);
    alert('Failed to save row order. Please try again.');
  }
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

function exportCrewCsv() {
  if (!tableData || !Array.isArray(tableData.rows)) return;
  // CSV header
  const header = ['Name', 'Start', 'End', 'Total', 'Role', 'Notes', 'Date'];
  // Only export non-placeholder rows
  const rows = tableData.rows.filter(row => row.role !== '__placeholder__');
  const csvRows = [header.join(',')];
  rows.forEach(row => {
    const values = [
      row.name || '',
      row.startTime || '',
      row.endTime || '',
      row.totalHours || '',
      row.role || '',
      row.notes ? '"' + String(row.notes).replace(/"/g, '""') + '"' : '',
      row.date || ''
    ];
    csvRows.push(values.map(v => {
      v = String(v);
      return v.includes(',') ? '"' + v + '"' : v;
    }).join(','));
  });
  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'crew.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function showCrewCostCalcModal() {
  // Gather all crew rows (excluding placeholders)
  const rows = (tableData.rows || []).filter(row => row.role !== '__placeholder__' && row.name && row.role);
  if (!rows.length) {
    alert('No crew data available.');
    return;
  }
  // Aggregate: { name, role } => total hours
  const crewMap = {};
  rows.forEach(row => {
    const key = row.name + '||' + row.role;
    if (!crewMap[key]) {
      crewMap[key] = { name: row.name, role: row.role, totalHours: 0 };
    }
    crewMap[key].totalHours += parseFloat(row.totalHours) || 0;
  });
  // Unique roles for rate inputs
  const uniqueRoles = Array.from(new Set(rows.map(r => r.role)));
  // Modal HTML
  let modal = document.getElementById('crewCostCalcModal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'crewCostCalcModal';
  modal.className = 'crew-cost-calc-modal';
  modal.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(34,41,47,0.18);display:flex;align-items:center;justify-content:center;z-index:10000;';
  // Modal content
  modal.innerHTML = `
    <div style="background:#fff;border-radius:18px;max-width:700px;width:96vw;max-height:96vh;height:96vh;box-shadow:0 12px 40px rgba(204,0,7,0.13),0 2px 8px rgba(0,0,0,0.08);padding:38px 32px 28px 32px;display:flex;flex-direction:column;gap:18px;align-items:center;">
      <h3 style='color:#CC0007;margin:0 0 8px 0;'>Crew Cost Calculator</h3>
      <div style='width:100%;flex:1 1 auto;overflow-x:auto;overflow-y:auto;min-height:0;'>
        <table style='width:100%;border-collapse:collapse;font-size:1rem;'>
          <thead>
            <tr style='background:#f5f5f5;'>
              <th style='padding:8px 10px;text-align:left;'>Name</th>
              <th style='padding:8px 10px;text-align:left;'>Role</th>
              <th style='padding:8px 10px;text-align:right;'>Total Hours</th>
              <th style='padding:8px 10px;text-align:right;'>Hourly Rate</th>
              <th style='padding:8px 10px;text-align:right;'>Cost</th>
            </tr>
          </thead>
          <tbody id='crewCostCalcTableBody'>
            <!-- Crew rows will be inserted here -->
          </tbody>
        </table>
      </div>
      <div style='width:100%;text-align:right;font-size:1.1rem;margin-top:10px;'>
        <strong>Total Project Cost: $<span id='crewCostCalcTotal'>0.00</span></strong>
      </div>
      <button id='closeCrewCostCalcModalBtn' style='background:#6c757d;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-weight:600;font-size:16px;box-shadow:0 2px 8px rgba(204,0,7,0.08);cursor:pointer;margin-top:10px;'>Close</button>
    </div>
  `;
  document.getElementById('crewCostCalcModalContainer').appendChild(modal);

  // State: (name||role) => rate
  const crewRates = {};
  Object.values(crewMap).forEach(crew => {
    const key = crew.name + '||' + crew.role;
    // Pre-fill from tableData.crewRates if available
    crewRates[key] = (tableData.crewRates && tableData.crewRates[key] !== undefined) ? String(tableData.crewRates[key]) : '';
  });

  // Render table body
  function renderTable(focusedKey, caretPos) {
    const tbody = document.getElementById('crewCostCalcTableBody');
    let total = 0;
    tbody.innerHTML = Object.values(crewMap).map(crew => {
      const key = crew.name + '||' + crew.role;
      const rate = parseFloat(crewRates[key]);
      const validRate = isNaN(rate) ? 0 : rate;
      const cost = validRate * crew.totalHours;
      total += cost;
      return `<tr>
        <td style='padding:7px 10px;'>${crew.name}</td>
        <td style='padding:7px 10px;'>${crew.role}</td>
        <td style='padding:7px 10px;text-align:right;'>${crew.totalHours.toFixed(2)}</td>
        <td style='padding:7px 10px;text-align:right;'>
          <input type='text' inputmode='decimal' data-key='${key}' value='${crewRates[key]}' style='width:90px;padding:3px 6px;font-size:1rem;border:1px solid #bbb;border-radius:5px;text-align:right;'>
        </td>
        <td style='padding:7px 10px;text-align:right;'>$${cost.toFixed(2)}</td>
      </tr>`;
    }).join('');
    document.getElementById('crewCostCalcTotal').textContent = total.toFixed(2);
    // Restore focus and caret position if needed
    if (focusedKey) {
      const input = tbody.querySelector(`input[data-key='${focusedKey}']`);
      if (input) {
        input.focus();
        if (typeof caretPos === 'number') {
          input.setSelectionRange(caretPos, caretPos);
        }
      }
    }
  }
  renderTable();

  // Listen for rate changes
  modal.addEventListener('input', function(e) {
    if (e.target && e.target.matches('input[data-key]')) {
      const key = e.target.getAttribute('data-key');
      crewRates[key] = e.target.value;
      // Save caret position before rerender
      const caretPos = e.target.selectionStart;
      renderTable(key, caretPos);
    }
  });

  // Add Save button for owners
  if (isOwner) {
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Rates';
    saveBtn.style = 'background:#CC0007;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-weight:600;font-size:16px;box-shadow:0 2px 8px rgba(204,0,7,0.08);cursor:pointer;margin-top:10px;';
    saveBtn.id = 'saveCrewRatesBtn';
    modal.querySelector('div').appendChild(saveBtn);
    saveBtn.onclick = async function() {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      try {
        const res = await fetch(`${API_BASE}/api/tables/${tableId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token
          },
          body: JSON.stringify({ crewRates })
        });
        if (res.ok) {
          saveBtn.textContent = 'Saved!';
          // Update local tableData with saved rates
          tableData.crewRates = JSON.parse(JSON.stringify(crewRates));
          setTimeout(() => { saveBtn.textContent = 'Save Rates'; saveBtn.disabled = false; }, 1200);
        } else {
          const err = await res.text();
          saveBtn.textContent = 'Error';
          alert('Failed to save rates: ' + err);
          saveBtn.disabled = false;
        }
      } catch (err) {
        saveBtn.textContent = 'Error';
        alert('Failed to save rates: ' + err.message);
        saveBtn.disabled = false;
      }
    };
  }

  document.getElementById('closeCrewCostCalcModalBtn').onclick = () => modal.remove();
}

function initPage(id) {
  loadTable().then(() => {
    attachEventListeners();
    document.body.classList.add('crew-page');
    // Attach export button event
    const exportBtn = document.getElementById('exportCsvBtn');
    if (exportBtn) exportBtn.onclick = exportCrewCsv;
    // Attach cost calculator button event
    const costCalcBtn = document.getElementById('crewCostCalcBtn');
    if (costCalcBtn) costCalcBtn.onclick = showCrewCostCalcModal;
  });
}

window.initPage = initPage;
window.addDateSection = addDateSection;
window.addRowToDate = addRowToDate;
window.saveEditById = saveEditById;
window.toggleEditById = toggleEditById;
window.deleteRowById = deleteRowById;
window.deleteDate = deleteDate;
window.renderTableSection = renderTableSection;
window.exportCrewCsv = exportCrewCsv;
})();
