(function() {
window.initPage = undefined;
    const token = localStorage.getItem('token');
    const params = new URLSearchParams(window.location.search);
    const tableId = params.get('id') || localStorage.getItem('eventId');

    // Add guard for missing ID
    if (!tableId) {
      console.warn('No table ID provided, redirecting to dashboard...');
      window.location.href = 'dashboard.html';
      return;
    }

    let isOwner = false;
    let editMode = false;

    // Initialize back button
    const backToEventBtn = document.getElementById('backToEventBtn');
    if (backToEventBtn) {
      backToEventBtn.addEventListener('click', function() {
        // Navigate back to dashboard with the general page loaded for this event using hash only
        window.location.href = 'dashboard.html#general';
      });
    }

    function getUserIdFromToken() {
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.id;
    }

    function formatDateReadable(dateStr) {
      if (!dateStr) return '';
      const [year, month, day] = dateStr.split('-');
      return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('en-US', {
        month: 'long',
        day: '2-digit',
        year: 'numeric'
      });
    }

    function autoResizeTextarea(el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }

    function populateTable(rows) {
      console.log('populateTable called with editMode:', editMode);
      const table = document.getElementById('folderLogTable')?.querySelector("tbody");
      if (!table) return;
      table.innerHTML = '';

      rows.forEach(item => {
        const row = document.createElement("tr");

        if (!editMode) {
          console.log('Not in edit mode, showing readonly view');
          row.innerHTML = `
            <td class="date"><span class="readonly-span">${formatDateReadable(item.date)}</span></td>
            <td class="text"><span class="readonly-span">${item.description || ''}</span></td>
            <td class="text"><span class="readonly-span">${item.folderName || ''}</span></td>
            <td class="action"></td>
          `;
        } else {
          console.log('In edit mode, showing editable view with delete button');
          row.innerHTML = `
            <td class="date"><input type="date" value="${item.date || ''}"></td>
            <td class="text"><textarea>${item.description || ''}</textarea></td>
            <td class="text"><textarea>${item.folderName || ''}</textarea></td>
            <td class="action"><button type="button" class="delete-btn" style="visibility: visible !important; display: inline-block !important; opacity: 1 !important;">🗑️</button></td>
          `;
        }

        table.appendChild(row);
      });

      table.querySelectorAll('textarea').forEach(autoResizeTextarea);
    }

    function collectTableData() {
      const table = document.getElementById('folderLogTable')?.querySelectorAll("tbody tr");
      if (!table) return [];
      return Array.from(table).map(row => {
        const inputs = row.querySelectorAll('input, textarea');
        return {
          date: inputs[0]?.value || '',
          description: inputs[1]?.value || '',
          folderName: inputs[2]?.value || ''
        };
      });
    }

    function addRow(tableId) {
      console.log('addRow called for folderLogTable, editMode:', editMode);
      // Don't allow adding rows if not in edit mode or not an owner
      if (!editMode || !isOwner) {
        console.log('Cannot add row: editMode is', editMode, 'isOwner is', isOwner);
        return;
      }
      const table = document.getElementById('folderLogTable')?.querySelector("tbody");
      console.log('table element:', table);
      if (!table) {
        console.log('No table/tbody found for folderLogTable');
        return;
      }
      const row = document.createElement("tr");

      row.innerHTML = `
        <td class="date"><input type="date"></td>
        <td class="text"><textarea></textarea></td>
        <td class="text"><textarea></textarea></td>
        <td class="action"><button class="delete-btn" onclick="window.removeRow(this)">🗑️</button></td>
      `;

      table.appendChild(row);
      row.querySelectorAll('textarea').forEach(autoResizeTextarea);
      console.log('Row appended to folderLogTable');
    }

    function removeRow(button) {
      console.log('removeRow called', button);
      const row = button.closest('tr');
      console.log('row to remove:', row);
      if (row) {
        row.remove();
        console.log('row removed');
      }
    }

    async function loadData() {
      console.log('Fetching folder logs data for tableId:', tableId);
      const res = await fetch(`${API_BASE}/api/tables/${tableId}/folder-logs`, {
        headers: { Authorization: token }
      });
      const data = await res.json();
      populateTable(data.folders);
    }

    async function saveData() {
      const folderRows = collectTableData();
      await fetch(`${API_BASE}/api/tables/${tableId}/folder-logs`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token
        },
        body: JSON.stringify({ folders: folderRows })
      });
      editMode = false;
      const editModeBtn = document.getElementById('editModeBtn');
      const saveBtn = document.getElementById('saveBtn');
      if (editModeBtn) editModeBtn.style.display = 'inline-block';
      if (saveBtn) saveBtn.style.display = 'none';
      await loadData();
    }

    function enterEditMode() {
      console.log('enterEditMode called', { isOwner, editMode });
      if (!isOwner) return;
      editMode = true;
      console.log('Edit mode set to:', editMode);
      const editModeBtn = document.getElementById('editModeBtn');
      const saveBtn = document.getElementById('saveBtn');
      if (editModeBtn) editModeBtn.style.display = 'none';
      if (saveBtn) saveBtn.style.display = 'inline-block';
      loadData();
    }

    // Expose functions on window
    window.addRow = addRow;
    window.removeRow = removeRow;
    window.saveData = saveData;
    window.enterEditMode = enterEditMode;

    // Add click handler for delete buttons
    document.addEventListener('click', function(e) {
      if (e.target && e.target.classList.contains('delete-btn')) {
        console.log('Delete button clicked');
        window.removeRow(e.target);
      }
    });

    window.initPage = async function(id) {
      console.log('initPage called with id:', id);
      const tableIdToUse = id || tableId;
      
      // Initialize Lucide icons for the back button
      if (window.lucide) {
        lucide.createIcons();
      }
      
      try {
        const res = await fetch(`${API_BASE}/api/tables/${tableIdToUse}`, {
          headers: { Authorization: token }
        });

        if (!res.ok) {
          throw new Error(`Failed to load table: ${res.status}`);
        }

        const table = await res.json();
        const eventTitleEl = document.getElementById('eventTitle');
        if (eventTitleEl) eventTitleEl.textContent = table.title;
        
        const userId = getUserIdFromToken();
        isOwner = Array.isArray(table.owners) && table.owners.map(String).includes(String(userId));
        console.log('isOwner set to:', isOwner, 'userId:', userId, 'table.owners:', table.owners);
        
        // Hide edit button for non-owners
        const editModeBtn = document.getElementById('editModeBtn');
        if (!isOwner && editModeBtn) editModeBtn.style.display = 'none';
        
        // Hide add row buttons for non-owners
        const addRowButtons = document.querySelectorAll('.add-btn');
        if (!isOwner && addRowButtons) {
          addRowButtons.forEach(btn => {
            btn.style.display = 'none';
          });
        }
        
        await loadData();
      } catch (error) {
        console.error('Error initializing folder logs page:', error);
        alert('Failed to load folder logs information. Please try again.');
      }
    };

    // Socket.IO real-time updates
    if (window.socket) {
      // Listen for folder logs updates
      window.socket.on('folderLogsChanged', (data) => {
        console.log('Folder logs data changed, checking if relevant...');
        // Only reload if it's for the current table
        if (data && data.tableId && data.tableId !== tableId) {
          console.log('Update was for a different table, ignoring');
          return;
        }
        console.log('Reloading folder logs data for current table');
        loadData();
      });
      
      // Also listen for general table updates
      window.socket.on('tableUpdated', (data) => {
        console.log('Table updated, checking if relevant...');
        // Only reload if it's for the current table
        if (data && data.tableId && data.tableId !== tableId) {
          console.log('Update was for a different table, ignoring');
          return;
        }
        console.log('Reloading folder logs data for current table');
        loadData();
      });
    }

    // Call initPage on DOMContentLoaded to ensure isOwner is set before user interaction
    if (window.initPage) {
      document.addEventListener('DOMContentLoaded', function() {
        window.initPage();
      });
    }
})(); 