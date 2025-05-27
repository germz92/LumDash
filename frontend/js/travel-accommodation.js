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

    function formatTo12Hour(time) {
      if (!time) return '';
      const [hourStr, minuteStr] = time.split(':');
      let hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr || '0', 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12 || 12;
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${ampm}`;
    }

    function autoResizeTextarea(el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }

    // Airline URL mapping for major airlines
    const airlineUrls = {
      'United': (ref, last) => `https://www.united.com/en/us/checkin/confirmation?confirmationNumber=${encodeURIComponent(ref)}&lastName=${encodeURIComponent(last)}`,
      'Delta': (ref, last) => `https://www.delta.com/mytrips/validatePNR?confirmationNumber=${encodeURIComponent(ref)}&lastName=${encodeURIComponent(last)}`,
      'American': (ref, last) => `https://www.aa.com/guest/viewreservation/findReservation?recordLocator=${encodeURIComponent(ref)}&lastName=${encodeURIComponent(last)}`,
      'Southwest': (ref, first, last) => `https://www.southwest.com/air/manage-reservation/index.html?confirmationNumber=${encodeURIComponent(ref)}&firstName=${encodeURIComponent(first)}&lastName=${encodeURIComponent(last)}`,
      'Alaska': (ref, last) => `https://www.alaskaair.com/booking/reservation-lookup?confirmationCode=${encodeURIComponent(ref)}&lastName=${encodeURIComponent(last)}`,
      'JetBlue': (ref, last) => `https://www.jetblue.com/at-the-airport/check-in?confirmationCode=${encodeURIComponent(ref)}&lastName=${encodeURIComponent(last)}`,
      'Air Canada': (ref, last) => `https://www.aircanada.com/ca/en/aco/home/book/manage-bookings.html#/find?bookingReference=${encodeURIComponent(ref)}&lastName=${encodeURIComponent(last)}`,
      'British Airways': (ref, last) => `https://www.britishairways.com/travel/yourbooking/public/en_us?bookingReference=${encodeURIComponent(ref)}&lastName=${encodeURIComponent(last)}`
    };

    function openAirlineSite(airline, ref, name) {
      if (!airline || !ref || !name) {
        alert('Missing airline, reference, or name.');
        return;
      }
      // Try to match airline name loosely
      const key = Object.keys(airlineUrls).find(k => airline.toLowerCase().includes(k.toLowerCase()));
      if (key) {
        let firstName = name.trim().split(' ')[0];
        let lastName = name.trim().split(' ').slice(-1)[0];
        if (key === 'Southwest') {
          window.open(airlineUrls[key](ref, firstName, lastName), '_blank');
        } else {
          window.open(airlineUrls[key](ref, lastName), '_blank');
        }
      } else {
        alert('This airline is not supported for automatic lookup.');
      }
    }

    function populateTable(tableId, rows) {
      console.log('populateTable called with editMode:', editMode);
      const table = document.getElementById(tableId)?.querySelector("tbody");
      if (!table) return;
      table.innerHTML = '';

      rows.forEach(item => {
        const row = document.createElement("tr");

        if (!editMode) {
          console.log('Not in edit mode, showing readonly view');
          if (tableId === 'travelTable') {
            row.innerHTML = `
              <td class="date"><span class="readonly-span">${formatDateReadable(item.date)}</span></td>
              <td class="time"><span class="readonly-span">${formatTo12Hour(item.time)}</span></td>
              <td class="text"><span class="readonly-span">${item.name || ''}</span></td>
              <td class="text"><span class="readonly-span">${item.airline || ''}</span></td>
              <td class="text"><span class="readonly-span">${item.ref || ''}</span></td>
              <td class="action"></td>
            `;
            // Add Open Airline button if airline/ref/name present
            const airline = item.airline || '';
            const ref = item.ref || '';
            const name = item.name || '';
            if (airline && ref && name) {
              const btn = document.createElement('button');
              btn.textContent = 'Open';
              btn.className = 'open-airline-btn';
              btn.onclick = () => {
                // Use first and last word in name for Southwest, last word for others
                openAirlineSite(airline, ref, name);
              };
              row.querySelector('.action').appendChild(btn);
            }
          } else {
            row.innerHTML = `
              <td class="date"><span class="readonly-span">${formatDateReadable(item.checkin)}</span></td>
              <td class="date"><span class="readonly-span">${formatDateReadable(item.checkout)}</span></td>
              <td class="text"><span class="readonly-span">${item.hotel || ''}</span></td>
              <td class="text"><span class="readonly-span">${item.name || ''}</span></td>
              <td class="text"><span class="readonly-span">${item.ref || ''}</span></td>
              <td class="action"></td>
            `;
          }
        } else {
          console.log('In edit mode, showing editable view with delete button');
          if (tableId === 'travelTable') {
            row.innerHTML = `
              <td class="date"><input type="date" value="${item.date || ''}"></td>
              <td class="time"><input type="time" value="${item.time || ''}"></td>
              <td class="text"><textarea>${item.name || ''}</textarea></td>
              <td class="text"><textarea>${item.airline || ''}</textarea></td>
              <td class="text"><textarea>${item.ref || ''}</textarea></td>
              <td class="action"><button type="button" class="delete-btn"><span class="material-symbols-outlined">delete</span></button></td>
            `;
          } else {
            row.innerHTML = `
              <td class="date"><input type="date" value="${item.checkin || ''}"></td>
              <td class="date"><input type="date" value="${item.checkout || ''}"></td>
              <td class="text"><textarea>${item.hotel || ''}</textarea></td>
              <td class="text"><textarea>${item.name || ''}</textarea></td>
              <td class="text"><textarea>${item.ref || ''}</textarea></td>
              <td class="action"><button type="button" class="delete-btn"><span class="material-symbols-outlined">delete</span></button></td>
            `;
          }
        }

        table.appendChild(row);
      });

      table.querySelectorAll('textarea').forEach(autoResizeTextarea);
    }

    function collectTableData(tableId) {
      const table = document.getElementById(tableId)?.querySelectorAll("tbody tr");
      if (!table) return [];
      return Array.from(table).map(row => {
        const inputs = row.querySelectorAll('input, textarea');
        return tableId === 'travelTable' ? {
          date: inputs[0]?.value || '',
          time: inputs[1]?.value || '',
          name: inputs[2]?.value || '',
          airline: inputs[3]?.value || '',
          ref: inputs[4]?.value || ''
        } : {
          checkin: inputs[0]?.value || '',
          checkout: inputs[1]?.value || '',
          hotel: inputs[2]?.value || '',
          name: inputs[3]?.value || '',
          ref: inputs[4]?.value || ''
        };
      });
    }

    function addRow(tableId) {
      console.log('addRow called for', tableId, 'editMode:', editMode);
      // Don't allow adding rows if not in edit mode or not an owner
      if (!editMode || !isOwner) {
        console.log('Cannot add row: editMode is', editMode, 'isOwner is', isOwner);
        return;
      }
      const table = document.getElementById(tableId)?.querySelector("tbody");
      console.log('table element:', table);
      if (!table) {
        console.log('No table/tbody found for', tableId);
        return;
      }
      const row = document.createElement("tr");

      row.innerHTML = tableId === 'travelTable'
        ? `
          <td class="date"><input type="date"></td>
          <td class="time"><input type="time"></td>
          <td class="text"><textarea></textarea></td>
          <td class="text"><textarea></textarea></td>
          <td class="text"><textarea></textarea></td>
          <td class="action"><button class="delete-btn" onclick="window.removeRow(this)"><span class="material-symbols-outlined">delete</span></button></td>
        `
        : `
          <td class="date"><input type="date"></td>
          <td class="date"><input type="date"></td>
          <td class="text"><textarea></textarea></td>
          <td class="text"><textarea></textarea></td>
          <td class="text"><textarea></textarea></td>
          <td class="action"><button class="delete-btn" onclick="window.removeRow(this)"><span class="material-symbols-outlined">delete</span></button></td>
        `;

      table.appendChild(row);
      row.querySelectorAll('textarea').forEach(autoResizeTextarea);
      console.log('Row appended to', tableId);
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
      console.log('Fetching table data for tableId:', tableId);
      const res = await fetch(`${API_BASE}/api/tables/${tableId}/travel`, {
        headers: { Authorization: token }
      });
      const data = await res.json();
      populateTable('travelTable', data.travel);
      populateTable('accommodationTable', data.accommodation);
    }

    async function saveData() {
      const travelRows = collectTableData('travelTable');
      const accommodationRows = collectTableData('accommodationTable');
      await fetch(`${API_BASE}/api/tables/${tableId}/travel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token
        },
        body: JSON.stringify({ travel: travelRows, accommodation: accommodationRows })
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
        console.error('Error initializing travel page:', error);
        alert('Failed to load travel information. Please try again.');
      }

      // Bottom Nav
      try {
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
          window.setupBottomNavigation(navContainer, tableIdToUse, 'travel-accommodation');
        }
      } catch (error) {
        console.error('Error loading navigation:', error);
      }

      if (window.lucide) lucide.createIcons();
    };

    // Add Socket.IO real-time updates early in the file
    // Socket.IO real-time updates
    if (window.socket) {
      // Listen for travel updates
      window.socket.on('travelChanged', (data) => {
        console.log('Travel/accommodation data changed, checking if relevant...');
        // Only reload if it's for the current table
        if (data && data.tableId && data.tableId !== tableId) {
          console.log('Update was for a different table, ignoring');
          return;
        }
        console.log('Reloading travel/accommodation data for current table');
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
        console.log('Reloading travel data for current table');
        loadData();
      });
    }
})();