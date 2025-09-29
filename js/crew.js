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
let globalEditMode = false;
let editedData = {}; // Store all edited row data during edit mode
let recentlyAddedRows = new Set(); // Track recently added rows to prevent loss
let reloadTimeout = null; // Debounce socket reloads

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
    
    // Debounce rapid reloads
    if (reloadTimeout) {
      clearTimeout(reloadTimeout);
    }
    
    reloadTimeout = setTimeout(() => {
      // Preserve edit mode state during reload
      loadTable(globalEditMode);
    }, 500); // Longer delay to prevent rapid reloads and data loss
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
    
    // Debounce rapid reloads
    if (reloadTimeout) {
      clearTimeout(reloadTimeout);
    }
    
    reloadTimeout = setTimeout(() => {
      // Preserve edit mode state during reload
      loadTable(globalEditMode);
    }, 500); // Longer delay to prevent rapid reloads and data loss
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

async function loadTable(preserveEditMode = false) {
  // Always ensure we're using the current tableId
  const currentTableId = getCurrentTableId();
  if (currentTableId !== tableId) {
    console.log(`TableId changed from ${tableId} to ${currentTableId}`);
    tableId = currentTableId;
  }
  
  console.log(`Loading table data for tableId: ${tableId}`);
  console.log('🔍 DEBUG: loadTable called with preserveEditMode:', preserveEditMode);
  console.log('🔍 DEBUG: Current recentlyAddedRows before load:', Array.from(recentlyAddedRows));
  
  const res = await fetch(`${API_BASE}/api/tables/${tableId}`, {
    headers: { Authorization: token }
  });

  if (!res.ok) {
    alert('Failed to load table. You might not have access.');
    return;
  }

  // Store current edit mode state before reloading
  const wasInEditMode = globalEditMode || preserveEditMode;
  const currentEditedData = { ...editedData };
  const currentTableData = tableData; // Store current table state

  tableData = await res.json();
  const userId = getUserIdFromToken();
  isOwner = Array.isArray(tableData.owners) && tableData.owners.includes(userId);

  if (!isOwner) {
    const addDateBtn = document.getElementById('addDateBtn');
    if (addDateBtn) addDateBtn.style.display = 'none';

    const newDateInput = document.getElementById('newDate');
    if (newDateInput) newDateInput.style.display = 'none';
    
    // Hide global edit controls for non-owners
    const globalEditControls = document.querySelector('.global-edit-controls');
    if (globalEditControls) globalEditControls.style.display = 'none';
  } else {
    // Show global edit controls for owners
    const globalEditControls = document.querySelector('.global-edit-controls');
    if (globalEditControls) globalEditControls.style.display = 'flex';
    
    const globalEditBtn = document.getElementById('globalEditBtn');
    if (globalEditBtn) globalEditBtn.style.display = 'inline-block';
    
    // Update date controls visibility based on edit mode
    updateDateControlsVisibility();
  }

  if (!cachedUsers.length) await preloadUsers();
  const tableTitleEl = document.getElementById('tableTitle');
  if (tableTitleEl) tableTitleEl.textContent = tableData.title;
  
  // Restore filter state before rendering
  restoreFilterState();
  
  // Load any edited data from session storage and merge with current edits
  loadEditedDataFromSession();
  
  // Restore any edits that were in progress
  if (Object.keys(currentEditedData).length > 0) {
    Object.assign(editedData, currentEditedData);
    saveEditedDataToSession();
  }
  
  // Add new rows from session storage to tableData
  Object.keys(editedData).forEach(rowId => {
    const rowData = editedData[rowId];
    if (rowData.isNew) {
      // Check if this new row is already in tableData (avoid duplicates)
      const exists = tableData.rows.some(row => row._id === rowId);
      if (!exists) {
        console.log('🔄 CREW: Adding new row from session to tableData:', rowId);
        tableData.rows.push(rowData);
      }
    }
  });
  
  // If we had local data and are in edit mode, merge any recently added rows
  // that might not be in the fresh server data yet (due to timing issues)
  if (currentTableData && wasInEditMode && currentTableData.rows && tableData.rows) {
    const serverRowIds = new Set(tableData.rows.map(row => row._id));
    
    // Preserve rows that are either in our recently added tracking OR missing from server
    const localRowsToPreserve = currentTableData.rows.filter(row => 
      row._id && 
      !serverRowIds.has(row._id) && 
      row.role !== '__placeholder__' &&
      (recentlyAddedRows.has(row._id) || wasInEditMode) // Extra protection for recently added rows
    );
    
    if (localRowsToPreserve.length > 0) {
      console.log('🔄 CREW: Preserving locally added rows:', localRowsToPreserve.length, localRowsToPreserve.map(r => r._id));
      tableData.rows.push(...localRowsToPreserve);
    }
  }
  
  // Restore edit mode if it was active
  if (wasInEditMode && !globalEditMode) {
    console.log('🔄 CREW: Auto-restoring edit mode after table reload');
    globalEditMode = true;
    const globalEditBtn = document.getElementById('globalEditBtn');
    const globalSaveBtn = document.getElementById('globalSaveBtn');
    const globalCancelBtn = document.getElementById('globalCancelBtn');
    
    if (globalEditBtn && globalSaveBtn && globalCancelBtn) {
      globalEditBtn.style.display = 'none';
      globalSaveBtn.style.display = 'inline-block';
      globalCancelBtn.style.display = 'inline-block';
      globalSaveBtn.disabled = false;
      globalCancelBtn.disabled = false;
      document.body.classList.add('global-edit-mode');
      updateDateControlsVisibility();
    }
  }
  
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
    // Get the saved filter value to use when rebuilding the dropdown
    const savedFilterDate = localStorage.getItem(`crew_filter_date_${tableId}`) || '';
    const currentValue = filterDropdown.value;
    const valueToUse = savedFilterDate || currentValue;
    
    console.log('🔄 CREW: Rebuilding date dropdown...', { 
      savedFilterDate, 
      currentValue, 
      valueToUse, 
      availableDates: dates 
    });
    
    filterDropdown.innerHTML = `<option value="">Show All</option>` +
      dates.map(d => `<option value="${d}" ${d === valueToUse ? 'selected' : ''}>${formatDateLocal(d)}</option>`).join('');
    
    // Ensure the dropdown value is set correctly after rebuilding
    filterDropdown.value = valueToUse;
    
    console.log('✅ CREW: Date dropdown rebuilt, final value:', filterDropdown.value);
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

    if (globalEditMode) {
      // Create editable date input in edit mode
      const dateInput = document.createElement('input');
      dateInput.type = 'date';
      dateInput.value = date;
      dateInput.id = `date-header-${date}`;
      dateInput.style.cssText = `
        font-size: 1.15rem;
        font-weight: bold;
        border: 2px solid #CC0007;
        border-radius: 6px;
        padding: 8px 12px;
        background: #fff;
        margin-right: 10px;
      `;
      dateInput.onchange = () => changeDateForSection(date, dateInput.value);
      headerWrapper.appendChild(dateInput);
      
      // Add a label to show what this is
      const label = document.createElement('span');
      label.textContent = ' (Click to change date)';
      label.style.cssText = 'font-size: 0.9rem; color: #666; font-weight: normal;';
      headerWrapper.appendChild(label);
    } else {
      // Show read-only date header in view mode
      const header = document.createElement('h2');
      header.textContent = formatDateLocal(date);
      headerWrapper.appendChild(header);
    }

    if (isOwner && globalEditMode) {
      const deleteDateBtn = document.createElement('button');
      deleteDateBtn.className = 'delete-date-btn';
      deleteDateBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
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
    
      // Check if we have edited data for this row
      const editedRowData = editedData[rowId];
      const displayData = editedRowData || row;
      
      if (globalEditMode) {
        // Render editable fields
        tr.innerHTML = `
          <td>
            <select id="${prefix}-name" onchange="handleNameChange('${rowId}', this.value)">
              <option value="">-- Select Name --</option>
              ${cachedUsers.map(u => `<option value="${u.name}" ${u.name === displayData.name ? 'selected' : ''}>${u.name}</option>`).join('')}
              <option value="__add_new__">➕ Add new name</option>
            </select>
          </td>
          <td><input type="time" id="${prefix}-startTime" value="${displayData.startTime || ''}" onchange="updateEditedData('${rowId}', 'startTime', this.value); updateRowHours('${rowId}')"></td>
          <td><input type="time" id="${prefix}-endTime" value="${displayData.endTime || ''}" onchange="updateEditedData('${rowId}', 'endTime', this.value); updateRowHours('${rowId}')"></td>
          <td id="${prefix}-totalHours">${calculateHours(displayData.startTime, displayData.endTime)}</td>
          <td>
            <select id="${prefix}-role" onchange="handleRoleChange('${rowId}', this.value)">
              <option value="">-- Select Role --</option>
              ${cachedRoles.map(r => `<option value="${r}" ${r === displayData.role ? 'selected' : ''}>${r}</option>`).join('')}
              <option value="__add_new__">➕ Add new role</option>
            </select>
          </td>
          <td><input type="text" id="${prefix}-notes" value="${displayData.notes || ''}" onchange="updateEditedData('${rowId}', 'notes', this.value)"></td>
          <td class="actions-cell" style="text-align: center;">
            ${isOwner && globalEditMode ? `
              <div class="icon-buttons">
                <button class="delete-row-btn" onclick="deleteRowById('${rowId}')" title="Delete"><span class="material-symbols-outlined">delete</span></button>
              </div>
            ` : ''}
          </td>
        `;
      } else {
        // Render display-only fields
        tr.innerHTML = `
          <td><span id="${prefix}-name">${displayData.name}</span></td>
          <td><span id="${prefix}-startTime">${formatTime(displayData.startTime)}</span></td>
          <td><span id="${prefix}-endTime">${formatTime(displayData.endTime)}</span></td>
          <td id="${prefix}-totalHours">${displayData.totalHours}</td>
          <td><span id="${prefix}-role">${displayData.role}</span></td>
          <td><span id="${prefix}-notes">${displayData.notes}</span></td>
          <td class="actions-cell" style="text-align: center;">
            ${isOwner && globalEditMode ? `
              <div class="icon-buttons">
                <button class="delete-row-btn" onclick="deleteRowById('${rowId}')" title="Delete"><span class="material-symbols-outlined">delete</span></button>
              </div>
            ` : ''}
          </td>
        `;
      }
    
      tbody.appendChild(tr);
    
      if (row.name && row.name.trim()) {
        visibleNames.add(row.name.trim());
      }
    });
    

    if (isOwner && globalEditMode) {
      const actionRow = document.createElement('tr');
      const actionTd = document.createElement('td');
      actionTd.colSpan = 7;
      const btnContainer = document.createElement('div');
      btnContainer.className = 'add-row-btn-container';
      const addBtn = document.createElement('button');
      addBtn.className = 'add-row-btn';
      addBtn.textContent = 'Add Row';
      addBtn.onclick = () => addRowToDate(date);
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
  
  // Show help message when not in edit mode
  if (isOwner && !globalEditMode && container.children.length > 0) {
    const helpMessage = document.createElement('div');
    helpMessage.id = 'editModeHelp';
    helpMessage.style.cssText = `
      text-align: center;
      padding: 20px;
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      margin: 20px auto;
      max-width: 600px;
      color: #6c757d;
      font-size: 16px;
    `;
    helpMessage.innerHTML = `
      <p><strong>💡 Tip:</strong> Click <strong>"Edit Mode"</strong> to add dates, add rows, edit crew information, change dates, or delete items.</p>
    `;
    container.appendChild(helpMessage);
  } else {
    // Remove help message if in edit mode
    const existingHelp = document.getElementById('editModeHelp');
    if (existingHelp) existingHelp.remove();
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

// Legacy function - kept for compatibility but not used in global edit mode
async function saveEditById(rowId) {
  if (!isOwner || globalEditMode) return;
  
  console.log('⚠️ CREW: saveEditById called in global edit mode - this should not happen');
}

// Legacy function - kept for compatibility but not used in global edit mode
function toggleEditById(rowId) {
  if (!isOwner || globalEditMode) return;
  
  console.log('⚠️ CREW: toggleEditById called in global edit mode - this should not happen');
}

async function deleteRowById(rowId) {
  if (!isOwner) return;
  
  if (!globalEditMode) {
    alert('Please enter Edit Mode first to delete rows.');
    return;
  }

  if (!confirm('Are you sure you want to delete this row?')) {
    return;
  }

  console.log('🗑️ CREW: Deleting row:', rowId);

  // Check if this is a new row (temporary ID) or existing row
  if (rowId.startsWith('temp_')) {
    // New row - just remove from session storage and local data
    console.log('🗑️ CREW: Deleting new row from session storage');
    
    // Remove from editedData (session storage)
    delete editedData[rowId];
    saveEditedDataToSession();
    
    // Remove from local tableData
    tableData.rows = tableData.rows.filter(row => row._id !== rowId);
    
    // Re-render table
    renderTableSection();
    updateCrewCount();
    
    showTemporaryMessage('Row removed from session!', 'info');
    
  } else {
    // Existing row - delete from database
    console.log('🗑️ CREW: Deleting existing row from database');
    
    try {
      const res = await fetch(`${API_BASE}/api/tables/${tableId}/rows-by-id/${rowId}`, {
        method: 'DELETE',
        headers: { Authorization: token }
      });

      if (res.ok) {
        await loadTable();
        showTemporaryMessage('Row deleted successfully!', 'success');
      } else {
        throw new Error(`Delete failed: ${res.status}`);
      }
    } catch (error) {
      console.error('❌ CREW: Failed to delete row:', error);
      alert(`Failed to delete row: ${error.message}`);
    }
  }
}

async function deleteDate(date) {
  if (!isOwner) return;
  
  if (!globalEditMode) {
    alert('Please enter Edit Mode first to delete dates.');
    return;
  }
  
  if (!confirm('Delete this entire day? This action cannot be undone.')) return;

  console.log('🗑️ CREW: Deleting date:', date);

  try {
    // Remove rows for this date from session storage
    const sessionRowsToDelete = Object.keys(editedData).filter(rowId => {
      const rowData = editedData[rowId];
      return rowData.date === date;
    });
    
    if (sessionRowsToDelete.length > 0) {
      console.log('🗑️ CREW: Removing session rows for date:', sessionRowsToDelete);
      sessionRowsToDelete.forEach(rowId => {
        delete editedData[rowId];
      });
      saveEditedDataToSession();
    }

    // Remove rows from local tableData
    tableData.rows = tableData.rows.filter(row => row.date !== date);

    // Update database - only send existing (non-temp) rows
    const dbRows = tableData.rows.filter(row => !row._id || !row._id.startsWith('temp_'));
    
    await fetch(`${API_BASE}/api/tables/${tableId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token
      },
      body: JSON.stringify({ rows: dbRows })
    });

    await loadTable();
    showTemporaryMessage(`Date ${date} deleted successfully!`, 'success');
    
  } catch (error) {
    console.error('❌ CREW: Failed to delete date:', error);
    alert(`Failed to delete date: ${error.message}`);
  }
}

// showRowInputs function removed - rows are now created directly

async function addDateSection() {
  if (!isOwner) return;
  
  if (!globalEditMode) {
    alert('Please enter Edit Mode first to add new dates.');
    return;
  }
  
  const date = document.getElementById('newDate').value;
  if (!date) return alert('Please select a date');

  // Ensure we're using the current tableId
  tableId = getCurrentTableId();
  console.log(`Adding date section for tableId: ${tableId}`);
  
  // DEBUG: Log current state before checking for auto-save
  console.log('🔍 DEBUG: Current state before auto-save check:');
  console.log('- editedData keys:', Object.keys(editedData));
  console.log('- recentlyAddedRows:', Array.from(recentlyAddedRows));
  console.log('- globalEditMode:', globalEditMode);

  const exists = tableData.rows.some(row => row.date === date);
  if (exists) {
    alert('This date already exists.');
    return;
  }

  // No auto-save needed - session storage approach handles persistence
  const editedRowCount = Object.keys(editedData).length;
  
  if (editedRowCount > 0) {
    console.log(`ℹ️ CREW: ${editedRowCount} unsaved changes in session storage (will persist through date addition)`);
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
  
  // Preserve edit mode during reload
  await loadTable(true);

  // No need to show input form - user can click "Add Row" to create rows directly
}

async function addRowToDate(date) {
  try {
    console.log('🔍 DEBUG: addRowToDate called with date:', date);
    console.log('🔍 DEBUG: isOwner:', isOwner);
    console.log('🔍 DEBUG: globalEditMode:', globalEditMode);
    
    if (!isOwner) {
      console.log('❌ DEBUG: Not owner, returning');
      return;
    }
    
    if (!globalEditMode) {
      console.log('❌ DEBUG: Not in global edit mode');
      alert('Please enter Edit Mode first to add new rows.');
      return;
    }
  
  // Ensure we're using the current tableId
  tableId = getCurrentTableId();
  console.log(`Adding empty row to date for tableId: ${tableId}`);
  
  // Create empty row with default values
  const nameValue = '';
  const roleValue = '';
  const start = '';
  const end = '';
  
  // Generate a temporary ID for the new row
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const row = {
    _id: tempId,
    date,
    role: roleValue,
    name: nameValue,
    startTime: start,
    endTime: end,
    totalHours: calculateHours(start, end),
    notes: '', // Empty notes for new row
    isNew: true // Flag to identify new rows
  };

  console.log('💾 CREW: Adding new row to session storage:', row);
  
  // Add to editedData for session storage
  editedData[tempId] = row;
  saveEditedDataToSession();
  
  // Add to local tableData for immediate display
  if (tableData && tableData.rows) {
    tableData.rows.push(row);
  }
  
  showTemporaryMessage('Empty row added! Fill in details and "Save All" to persist.', 'info');
  
  // Re-render without full reload to preserve state
  renderTableSection();
  updateCrewCount();
  
  } catch (error) {
    console.error('❌ DEBUG: Error in addRowToDate:', error);
    alert(`Error adding row: ${error.message}`);
  }
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
  saveFilterState();
  renderTableSection();
}

// Save filter states to localStorage
function saveFilterState() {
  const filterDate = document.getElementById('filterDate')?.value || '';
  const searchInput = document.getElementById('searchInput')?.value || '';
  const sortDirection = document.getElementById('sortDirection')?.value || 'asc';
  
  console.log('🔄 CREW: Saving filter state...', { filterDate, searchInput, sortDirection, tableId });
  
  localStorage.setItem(`crew_filter_date_${tableId}`, filterDate);
  localStorage.setItem(`crew_search_${tableId}`, searchInput);
  localStorage.setItem(`crew_sort_${tableId}`, sortDirection);
  
  console.log('✅ CREW: Filter state saved to localStorage');
}

// Session storage functions for edit mode data
function saveEditedDataToSession() {
  if (Object.keys(editedData).length > 0) {
    sessionStorage.setItem(`crew_edited_data_${tableId}`, JSON.stringify(editedData));
    console.log('💾 CREW: Saved edited data to session storage:', editedData);
  }
}

function loadEditedDataFromSession() {
  const stored = sessionStorage.getItem(`crew_edited_data_${tableId}`);
  if (stored) {
    try {
      editedData = JSON.parse(stored);
      console.log('📂 CREW: Loaded edited data from session storage:', editedData);
    } catch (e) {
      console.error('❌ CREW: Failed to parse session storage data:', e);
      editedData = {};
    }
  }
}

function clearEditedDataFromSession() {
  sessionStorage.removeItem(`crew_edited_data_${tableId}`);
  editedData = {};
  console.log('🗑️ CREW: Cleared edited data from session storage');
}

// Update visibility of date controls based on edit mode
function updateDateControlsVisibility() {
  if (!isOwner) return;
  
  const addDateBtn = document.getElementById('addDateBtn');
  const newDateInput = document.getElementById('newDate');
  
  if (globalEditMode) {
    // Show date controls in edit mode
    if (addDateBtn) addDateBtn.style.display = 'inline-block';
    if (newDateInput) newDateInput.style.display = 'inline-block';
  } else {
    // Hide date controls when not in edit mode
    if (addDateBtn) addDateBtn.style.display = 'none';
    if (newDateInput) newDateInput.style.display = 'none';
  }
}

// Change date for an entire section (all rows with that date)
async function changeDateForSection(oldDate, newDate) {
  if (!isOwner || !globalEditMode) return;
  
  if (!newDate || newDate === oldDate) {
    return;
  }
  
  // Check if new date already exists
  const existingDates = [...new Set(tableData.rows.map(row => row.date))];
  if (existingDates.includes(newDate)) {
    if (!confirm(`Date ${formatDateLocal(newDate)} already exists. Do you want to merge the rows from ${formatDateLocal(oldDate)} into it?`)) {
      // Reset the input back to original date
      const dateInput = document.getElementById(`date-header-${oldDate}`);
      if (dateInput) dateInput.value = oldDate;
      return;
    }
  }
  
  console.log(`🔄 CREW: Changing date from ${oldDate} to ${newDate}`);
  
  try {
    // Find all rows with the old date
    const rowsToUpdate = tableData.rows.filter(row => row.date === oldDate);
    
    if (rowsToUpdate.length === 0) {
      alert('No rows found for this date.');
      return;
    }
    
    // Update each row individually via API
    const updatePromises = rowsToUpdate.map(async (row) => {
      const updatedRow = { ...row, date: newDate };
      
      const response = await fetch(`${API_BASE}/api/tables/${tableId}/rows/${row._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token
        },
        body: JSON.stringify(updatedRow)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update row ${row._id}: ${response.status}`);
      }
      
      return row._id;
    });
    
    await Promise.all(updatePromises);
    
    // Also update any edited data that might be in session storage
    Object.keys(editedData).forEach(rowId => {
      const originalRow = tableData.rows.find(r => r._id === rowId);
      if (originalRow && originalRow.date === oldDate) {
        editedData[rowId].date = newDate;
      }
    });
    saveEditedDataToSession();
    
    console.log(`✅ CREW: Successfully updated ${rowsToUpdate.length} rows from ${oldDate} to ${newDate}`);
    
    // Reload the table to reflect changes
    await loadTable();
    
    showTemporaryMessage(`Date changed successfully! ${rowsToUpdate.length} rows moved to ${formatDateLocal(newDate)}`, 'success');
    
  } catch (error) {
    console.error('❌ CREW: Failed to change date:', error);
    alert(`Failed to change date: ${error.message}`);
    
    // Reset the input back to original date
    const dateInput = document.getElementById(`date-header-${oldDate}`);
    if (dateInput) dateInput.value = oldDate;
  }
}

// Update edited data and save to session storage
function updateEditedData(rowId, field, value) {
  if (!editedData[rowId]) {
    // Initialize with current row data
    const row = tableData.rows.find(r => r._id === rowId);
    if (row) {
      editedData[rowId] = { ...row };
    }
  }
  
  editedData[rowId][field] = value;
  
  // Recalculate total hours if start or end time changed
  if (field === 'startTime' || field === 'endTime') {
    editedData[rowId].totalHours = calculateHours(
      editedData[rowId].startTime,
      editedData[rowId].endTime
    );
  }
  
  saveEditedDataToSession();
  console.log(`📝 CREW: Updated ${field} for row ${rowId}:`, value);
}

// Handle name change with add new functionality
function handleNameChange(rowId, value) {
  if (value === '__add_new__') {
    const newName = prompt('Enter new name:');
    if (newName && !cachedUsers.some(u => u.name === newName)) {
      cachedUsers.push({ name: newName });
      cachedUsers.sort((a, b) => a.name.localeCompare(b.name));
      
      // Update the select element
      const select = document.getElementById(`row-${rowId}-name`);
      if (select) {
        select.innerHTML = `
          <option value="">-- Select Name --</option>
          ${cachedUsers.map(u => `<option value="${u.name}" ${u.name === newName ? 'selected' : ''}>${u.name}</option>`).join('')}
          <option value="__add_new__">➕ Add new name</option>
        `;
        select.value = newName;
      }
      
      updateEditedData(rowId, 'name', newName);
    } else {
      // Reset selection if cancelled or duplicate
      const select = document.getElementById(`row-${rowId}-name`);
      if (select) {
        const currentData = editedData[rowId] || tableData.rows.find(r => r._id === rowId);
        select.value = currentData ? currentData.name : '';
      }
    }
  } else {
    updateEditedData(rowId, 'name', value);
  }
}

// Handle role change with add new functionality
function handleRoleChange(rowId, value) {
  if (value === '__add_new__') {
    const newRole = prompt('Enter new role:');
    if (newRole && !cachedRoles.includes(newRole)) {
      cachedRoles.push(newRole);
      cachedRoles.sort();
      
      // Update the select element
      const select = document.getElementById(`row-${rowId}-role`);
      if (select) {
        select.innerHTML = `
          <option value="">-- Select Role --</option>
          ${cachedRoles.map(r => `<option value="${r}" ${r === newRole ? 'selected' : ''}>${r}</option>`).join('')}
          <option value="__add_new__">➕ Add new role</option>
        `;
        select.value = newRole;
      }
      
      updateEditedData(rowId, 'role', newRole);
    } else {
      // Reset selection if cancelled or duplicate
      const select = document.getElementById(`row-${rowId}-role`);
      if (select) {
        const currentData = editedData[rowId] || tableData.rows.find(r => r._id === rowId);
        select.value = currentData ? currentData.role : '';
      }
    }
  } else {
    updateEditedData(rowId, 'role', value);
  }
}

// Update row hours display in edit mode
function updateRowHours(rowId) {
  const prefix = `row-${rowId}`;
  const startInput = document.getElementById(`${prefix}-startTime`);
  const endInput = document.getElementById(`${prefix}-endTime`);
  const hoursDisplay = document.getElementById(`${prefix}-totalHours`);
  
  if (startInput && endInput && hoursDisplay) {
    const hours = calculateHours(startInput.value, endInput.value);
    hoursDisplay.textContent = hours;
  }
}

// Enter global edit mode
function enterGlobalEditMode() {
  if (!isOwner || globalEditMode) return;
  
  try {
    console.log('🔄 CREW: Entering edit mode...');
    
    globalEditMode = true;
    
    const globalEditBtn = document.getElementById('globalEditBtn');
    const globalSaveBtn = document.getElementById('globalSaveBtn');
    const globalCancelBtn = document.getElementById('globalCancelBtn');
    
    if (!globalEditBtn || !globalSaveBtn || !globalCancelBtn) {
      console.error('❌ CREW: Could not find global edit control buttons');
      return;
    }
    
    // Update button visibility
    globalEditBtn.style.display = 'none';
    globalSaveBtn.style.display = 'inline-block';
    globalCancelBtn.style.display = 'inline-block';
    
    // Ensure buttons are enabled
    globalSaveBtn.disabled = false;
    globalCancelBtn.disabled = false;
    globalSaveBtn.textContent = 'Save All';
    
    // Add visual class to body
    document.body.classList.add('global-edit-mode');
    
    // Load any existing edited data
    loadEditedDataFromSession();
    
    // Update date controls visibility
    updateDateControlsVisibility();
    
    // Render the table section with edit controls
    renderTableSection();
    
    console.log('✅ CREW: Entered edit mode successfully');
    
  } catch (error) {
    console.error('❌ CREW: Error entering edit mode:', error);
    alert('Error entering edit mode. Please refresh the page if issues persist.');
  }
}

// Exit global edit mode
function exitGlobalEditMode() {
  if (!isOwner || !globalEditMode) return;
  
  try {
    console.log('🔄 CREW: Exiting edit mode...');
    
    globalEditMode = false;
    
    const globalEditBtn = document.getElementById('globalEditBtn');
    const globalSaveBtn = document.getElementById('globalSaveBtn');
    const globalCancelBtn = document.getElementById('globalCancelBtn');
    
    if (!globalEditBtn || !globalSaveBtn || !globalCancelBtn) {
      console.error('❌ CREW: Could not find global edit control buttons');
      return;
    }
    
    // Update button visibility
    globalEditBtn.style.display = 'inline-block';
    globalSaveBtn.style.display = 'none';
    globalCancelBtn.style.display = 'none';
    
    // Reset button states
    globalSaveBtn.disabled = false;
    globalCancelBtn.disabled = false;
    globalSaveBtn.textContent = 'Save All';
    globalEditBtn.textContent = 'Edit Mode';
    
    // Remove visual class from body
    document.body.classList.remove('global-edit-mode');
    
    // Clear any unsaved changes from session storage
    const unsavedChangesCount = Object.keys(editedData).length;
    if (unsavedChangesCount > 0) {
      console.log(`🗑️ CREW: Discarding ${unsavedChangesCount} unsaved changes from session storage`);
      clearEditedDataFromSession();
    }
    
    // Update date controls visibility
    updateDateControlsVisibility();
    
    // Reload fresh data from database to ensure UI matches database state
    loadTable();
    
    console.log('✅ CREW: Exited edit mode successfully');
    
  } catch (error) {
    console.error('❌ CREW: Error exiting edit mode:', error);
    alert('Error exiting edit mode. Please refresh the page if issues persist.');
  }
}

// Toggle global edit mode (for the Edit Mode button)
function toggleGlobalEditMode() {
  if (!isOwner) return;
  
  if (globalEditMode) {
    exitGlobalEditMode();
  } else {
    enterGlobalEditMode();
  }
}

// Cancel global edit mode
function cancelGlobalEditMode() {
  if (!isOwner) return;
  
  const globalCancelBtn = document.getElementById('globalCancelBtn');
  const globalSaveBtn = document.getElementById('globalSaveBtn');
  
  // Prevent multiple clicks
  if (globalCancelBtn && globalCancelBtn.disabled) {
    return;
  }
  
  // Check if there are unsaved changes
  if (Object.keys(editedData).length > 0) {
    if (!confirm('Are you sure you want to cancel? All unsaved changes will be lost.')) {
      return;
    }
  }
  
  try {
    // Disable buttons during cancel operation
    if (globalCancelBtn) globalCancelBtn.disabled = true;
    if (globalSaveBtn) globalSaveBtn.disabled = true;
    
    console.log('🔄 CREW: Cancelling edit mode...');
    
    // Clear edited data
    clearEditedDataFromSession();
    
    // Re-enable buttons
    if (globalCancelBtn) globalCancelBtn.disabled = false;
    if (globalSaveBtn) globalSaveBtn.disabled = false;
    
    // Exit edit mode and update UI
    exitGlobalEditMode();
    
    console.log('❌ CREW: Global edit mode cancelled');
    
    // Show feedback
    showTemporaryMessage('Changes cancelled', 'info');
    
  } catch (error) {
    console.error('❌ CREW: Error during cancel operation:', error);
    
    // Re-enable buttons on error
    if (globalCancelBtn) globalCancelBtn.disabled = false;
    if (globalSaveBtn) globalSaveBtn.disabled = false;
    
    alert('Error cancelling edit mode. Please refresh the page.');
  }
}

// Save all edited data
async function saveAllEditedData() {
  if (!isOwner) return;
  
  const editedRowCount = Object.keys(editedData).length;
  if (editedRowCount === 0) {
    alert('No changes to save.');
    return;
  }
  
  // Validate edited data
  const validationErrors = validateEditedData();
  if (validationErrors.length > 0) {
    alert('Please fix the following errors before saving:\n' + validationErrors.join('\n'));
    return;
  }
  
  // Confirm with user
  const confirmMessage = `Save changes to ${editedRowCount} row${editedRowCount === 1 ? '' : 's'}?`;
  if (!confirm(confirmMessage)) {
    return;
  }
  
  const globalSaveBtn = document.getElementById('globalSaveBtn');
  const globalCancelBtn = document.getElementById('globalCancelBtn');
  const originalText = globalSaveBtn.textContent;
  
  // Disable both buttons during save
  globalSaveBtn.textContent = 'Saving...';
  globalSaveBtn.disabled = true;
  globalCancelBtn.disabled = true;
  
  try {
    // Separate new rows from edited rows
    const newRows = [];
    const editedRows = [];
    
    Object.entries(editedData).forEach(([rowId, rowData]) => {
      if (rowData.isNew) {
        newRows.push(rowData);
      } else {
        editedRows.push([rowId, rowData]);
      }
    });
    
    console.log(`🔄 CREW: Starting save operation for ${newRows.length} new rows and ${editedRows.length} edited rows`);
    
    // Save new rows first (POST)
    for (const rowData of newRows) {
      console.log(`💾 CREW: Creating new row:`, rowData);
      
      // Remove temporary fields before saving
      const cleanRowData = { ...rowData };
      delete cleanRowData._id; // Remove temp ID
      delete cleanRowData.isNew; // Remove flag
      
      const response = await fetch(`${API_BASE}/api/tables/${tableId}/rows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token
        },
        body: JSON.stringify(cleanRowData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create new row: ${response.status} - ${errorText}`);
      }
      
      console.log(`✅ CREW: Successfully created new row`);
    }
    
    // Save edited rows (PUT)
    for (const [rowId, rowData] of editedRows) {
      console.log(`💾 CREW: Updating row ${rowId}:`, rowData);
      
      const response = await fetch(`${API_BASE}/api/tables/${tableId}/rows/${rowId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token
        },
        body: JSON.stringify(rowData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save row ${getRowDisplayName(rowId)}: ${response.status} - ${errorText}`);
      }
      
      console.log(`✅ CREW: Successfully saved row ${rowId}`);
    }
    
    console.log('✅ CREW: All rows saved successfully');
    
    // Show success message
    const totalSaved = newRows.length + editedRows.length;
    const message = newRows.length > 0 && editedRows.length > 0 
      ? `✅ Saved ${newRows.length} new rows and ${editedRows.length} changes!`
      : newRows.length > 0 
        ? `✅ Saved ${newRows.length} new rows!`
        : `✅ Saved ${editedRows.length} changes!`;
    showTemporaryMessage(message, 'success');
    
    // Clear edited data first
    clearEditedDataFromSession();
    
    // Reset button states
    globalSaveBtn.textContent = originalText;
    globalSaveBtn.disabled = false;
    globalCancelBtn.disabled = false;
    
    // Exit edit mode and update UI
    exitGlobalEditMode();
    
    // Reload table to show saved data with error handling
    try {
      await loadTable();
      console.log('✅ CREW: Table reloaded successfully');
    } catch (loadError) {
      console.warn('⚠️ CREW: Failed to reload table after save, but save was successful:', loadError);
      // Force a simple re-render instead of full reload
      renderTableSection();
    }
    
    // Show success feedback
    showTemporaryMessage('Changes saved successfully!', 'success');
    
  } catch (error) {
    console.error('❌ CREW: Failed to save changes:', error);
    
    // Reset button states on error
    globalSaveBtn.textContent = originalText;
    globalSaveBtn.disabled = false;
    globalCancelBtn.disabled = false;
    
    // Show user-friendly error message
    const errorMessage = error.message.includes('Failed to save row') 
      ? error.message 
      : 'Failed to save changes. Please try again.';
    
    alert(errorMessage);
    showTemporaryMessage('Save failed. Please try again.', 'error');
  }
}

// Validate edited data before saving
function validateEditedData() {
  const errors = [];
  
  Object.entries(editedData).forEach(([rowId, rowData]) => {
    if (!rowData.name || !rowData.name.trim()) {
      errors.push(`Row ${getRowDisplayName(rowId)}: Name is required`);
    }
    
    if (!rowData.role || !rowData.role.trim()) {
      errors.push(`Row ${getRowDisplayName(rowId)}: Role is required`);
    }
    
    if (rowData.startTime && rowData.endTime) {
      const startTime = new Date(`1970-01-01T${rowData.startTime}:00`);
      const endTime = new Date(`1970-01-01T${rowData.endTime}:00`);
      
      if (startTime >= endTime) {
        errors.push(`Row ${getRowDisplayName(rowId)}: End time must be after start time`);
      }
    }
  });
  
  return errors;
}

// Get a display name for a row (for error messages)
function getRowDisplayName(rowId) {
  const rowData = editedData[rowId] || tableData.rows.find(r => r._id === rowId);
  return rowData && rowData.name ? rowData.name : `ID: ${rowId.substring(0, 8)}`;
}

// Show temporary message to user
function showTemporaryMessage(message, type = 'info') {
  const messageEl = document.createElement('div');
  messageEl.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 6px;
    font-weight: 500;
    z-index: 10001;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: opacity 0.3s ease;
    ${type === 'success' ? 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb;' : 
      type === 'error' ? 'background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;' :
      'background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb;'}
  `;
  messageEl.textContent = message;
  
  document.body.appendChild(messageEl);
  
  setTimeout(() => {
    messageEl.style.opacity = '0';
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.parentNode.removeChild(messageEl);
      }
    }, 300);
  }, 3000);
}

// Restore filter states from localStorage
function restoreFilterState() {
  const savedFilterDate = localStorage.getItem(`crew_filter_date_${tableId}`) || '';
  const savedSearch = localStorage.getItem(`crew_search_${tableId}`) || '';
  const savedSort = localStorage.getItem(`crew_sort_${tableId}`) || 'asc';
  
  console.log('🔄 CREW: Restoring filter state...', { savedFilterDate, savedSearch, savedSort, tableId });
  
  const filterDateEl = document.getElementById('filterDate');
  const searchInputEl = document.getElementById('searchInput');
  const sortDirectionEl = document.getElementById('sortDirection');
  
  console.log('🔍 CREW: DOM elements found:', { 
    filterDateEl: !!filterDateEl, 
    searchInputEl: !!searchInputEl, 
    sortDirectionEl: !!sortDirectionEl 
  });
  
  if (filterDateEl) {
    console.log('📅 CREW: Setting filter date to:', savedFilterDate);
    filterDateEl.value = savedFilterDate;
  }
  if (searchInputEl) {
    console.log('🔍 CREW: Setting search to:', savedSearch);
    searchInputEl.value = savedSearch;
  }
  if (sortDirectionEl) {
    console.log('📊 CREW: Setting sort to:', savedSort);
    sortDirectionEl.value = savedSort;
  }
  
  console.log('✅ CREW: Filter state restoration complete');
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
  
  // Global edit controls
  const globalEditBtn = document.getElementById('globalEditBtn');
  if (globalEditBtn) globalEditBtn.onclick = toggleGlobalEditMode;
  
  const globalSaveBtn = document.getElementById('globalSaveBtn');
  if (globalSaveBtn) globalSaveBtn.onclick = saveAllEditedData;
  
  const globalCancelBtn = document.getElementById('globalCancelBtn');
  if (globalCancelBtn) globalCancelBtn.onclick = cancelGlobalEditMode;
  
  const filterDate = document.getElementById('filterDate');
  if (filterDate) {
    filterDate.onchange = () => {
      saveFilterState();
      renderTableSection();
    };
  }
  
  const sortDirection = document.getElementById('sortDirection');
  if (sortDirection) {
    sortDirection.onchange = () => {
      saveFilterState();
      renderTableSection();
    };
  }
  
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.oninput = () => {
      saveFilterState();
      renderTableSection();
    };
  }
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
  // Only allow owners to access the cost calculator
  if (!isOwner) {
    alert('Access denied. Only event owners can view the crew cost calculator.');
    return;
  }
  
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
window.toggleGlobalEditMode = toggleGlobalEditMode;
window.enterGlobalEditMode = enterGlobalEditMode;
window.exitGlobalEditMode = exitGlobalEditMode;
window.saveAllEditedData = saveAllEditedData;
window.cancelGlobalEditMode = cancelGlobalEditMode;
window.updateEditedData = updateEditedData;
window.handleNameChange = handleNameChange;
window.handleRoleChange = handleRoleChange;
window.updateRowHours = updateRowHours;
window.validateEditedData = validateEditedData;
window.showTemporaryMessage = showTemporaryMessage;
window.changeDateForSection = changeDateForSection;

// Test function to verify button functionality
window.testAddRow = function(date) {
  console.log('🧪 TEST: testAddRow called with date:', date);
  console.log('🧪 TEST: addRowToDate function exists:', typeof window.addRowToDate);
  console.log('🧪 TEST: Calling addRowToDate...');
  try {
    addRowToDate(date);
  } catch (error) {
    console.error('🧪 TEST: Error calling addRowToDate:', error);
  }
};

// Debug function to help troubleshoot issues
window.debugCrewEditMode = function() {
  console.log('=== CREW EDIT MODE DEBUG ===');
  console.log('globalEditMode:', globalEditMode);
  console.log('editedData:', editedData);
  console.log('recentlyAddedRows:', recentlyAddedRows);
  console.log('tableId:', tableId);
  console.log('isOwner:', isOwner);
  
  const globalEditBtn = document.getElementById('globalEditBtn');
  const globalSaveBtn = document.getElementById('globalSaveBtn');
  const globalCancelBtn = document.getElementById('globalCancelBtn');
  
  console.log('Button states:');
  console.log('- Edit button:', globalEditBtn ? { display: globalEditBtn.style.display, disabled: globalEditBtn.disabled } : 'NOT FOUND');
  console.log('- Save button:', globalSaveBtn ? { display: globalSaveBtn.style.display, disabled: globalSaveBtn.disabled, text: globalSaveBtn.textContent } : 'NOT FOUND');
  console.log('- Cancel button:', globalCancelBtn ? { display: globalCancelBtn.style.display, disabled: globalCancelBtn.disabled } : 'NOT FOUND');
  
  console.log('Body classes:', document.body.className);
  console.log('Session storage:', sessionStorage.getItem(`crew_edited_data_${tableId}`));
  console.log('========================');
};

// Recovery function to reset edit mode if stuck
window.resetCrewEditMode = function() {
  console.log('🔄 CREW: Resetting edit mode...');
  
  try {
    // Force exit edit mode
    globalEditMode = true; // Set to true so exitGlobalEditMode will work
    exitGlobalEditMode();
    
    // Double-check and force clear if needed
    clearEditedDataFromSession();
    recentlyAddedRows.clear();
    document.body.classList.remove('global-edit-mode');
    
    console.log('✅ CREW: Edit mode reset successfully');
    showTemporaryMessage('Edit mode reset successfully', 'success');
  } catch (error) {
    console.error('❌ CREW: Error during reset:', error);
    
    // Manual fallback reset
    globalEditMode = false;
    clearEditedDataFromSession();
    document.body.classList.remove('global-edit-mode');
    
    const globalEditBtn = document.getElementById('globalEditBtn');
    const globalSaveBtn = document.getElementById('globalSaveBtn');
    const globalCancelBtn = document.getElementById('globalCancelBtn');
    
    if (globalEditBtn) {
      globalEditBtn.style.display = 'inline-block';
      globalEditBtn.disabled = false;
      globalEditBtn.textContent = 'Edit Mode';
    }
    
    if (globalSaveBtn) {
      globalSaveBtn.style.display = 'none';
      globalSaveBtn.disabled = false;
      globalSaveBtn.textContent = 'Save All';
    }
    
    if (globalCancelBtn) {
      globalCancelBtn.style.display = 'none';
      globalCancelBtn.disabled = false;
    }
    
    try {
      renderTableSection();
    } catch (renderError) {
      console.error('❌ CREW: Error during render:', renderError);
    }
    
    alert('Force reset completed. If issues persist, please refresh the page.');
  }
};
})();
