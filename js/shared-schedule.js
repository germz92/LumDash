// =====================================================
// Shared Schedule - View-Only Client Page
// =====================================================
(function () {
  'use strict';

  let scheduleData = [];
  let eventTitle = 'Program Schedule';
  let searchQuery = '';
  let filterDate = 'all';
  let currentView = 'table'; // Default to table view on desktop
  let allNotesVisible = false;

  // ---- Helpers ----

  function getShareToken() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  }

  function formatDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatTo12Hour(time) {
    if (!time) return '';
    const [hour, minute] = time.split(':').map(Number);
    const h = hour % 12 || 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${h}:${minute.toString().padStart(2, '0')} ${ampm}`;
  }

  function matchesSearch(program) {
    if (filterDate !== 'all' && program.date !== filterDate) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (program.name || '').toLowerCase().includes(q) ||
      (program.location || '').toLowerCase().includes(q) ||
      (program.photographer || '').toLowerCase().includes(q) ||
      (program.notes || '').toLowerCase().includes(q)
    );
  }

  function calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) return Infinity;
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    return (endHour * 60 + endMin) - (startHour * 60 + startMin);
  }

  function sortPrograms(programs) {
    return programs.sort((a, b) => {
      const aHasTime = a.startTime && a.startTime.trim() !== '';
      const bHasTime = b.startTime && b.startTime.trim() !== '';

      if (aHasTime && bHasTime) {
        const timeComparison = a.startTime.localeCompare(b.startTime);
        if (timeComparison === 0) {
          return calculateDuration(a.startTime, a.endTime) - calculateDuration(b.startTime, b.endTime);
        }
        return timeComparison;
      }
      if (aHasTime && !bHasTime) return -1;
      if (!aHasTime && bHasTime) return 1;
      return a.__index - b.__index;
    });
  }

  // ---- Data Loading ----

  async function loadSharedSchedule() {
    const shareToken = getShareToken();
    if (!shareToken) {
      showError();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/shared-schedule/${shareToken}`);
      if (!res.ok) {
        showError();
        return;
      }

      const data = await res.json();
      eventTitle = data.title || 'Program Schedule';
      scheduleData = data.programSchedule || [];

      document.getElementById('eventTitle').textContent = eventTitle;
      document.title = `${eventTitle} - Schedule`;

      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('scheduleContent').style.display = 'block';

      populateDateFilter();
      initializeView();
      render();
    } catch (err) {
      console.error('Error loading shared schedule:', err);
      showError();
    }
  }

  function showError() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'flex';
  }

  // ---- Date Filter ----

  function populateDateFilter() {
    const dropdown = document.getElementById('filterDateDropdown');
    if (!dropdown) return;

    const dates = [...new Set(scheduleData.map(p => p.date))].sort();
    dropdown.innerHTML = '<option value="all">All Dates</option>';
    dates.forEach(date => {
      const option = document.createElement('option');
      option.value = date;
      option.textContent = formatDate(date);
      dropdown.appendChild(option);
    });
  }

  // ---- View Toggle ----

  function initializeView() {
    // On mobile, always use card view
    if (window.innerWidth <= 768) {
      currentView = 'cards';
    }
    applyView();
  }

  function applyView() {
    const cardContainer = document.getElementById('programSections');
    const tableContainer = document.getElementById('scheduleTableView');
    const toggleText = document.getElementById('viewToggleText');
    const toggleBtn = document.getElementById('viewToggleBtn');
    const toggleIcon = toggleBtn ? toggleBtn.querySelector('.material-symbols-outlined') : null;

    if (!cardContainer || !tableContainer) return;

    if (currentView === 'table') {
      cardContainer.classList.add('hidden');
      cardContainer.style.display = 'none';
      tableContainer.classList.add('active');
      if (toggleText) toggleText.textContent = 'Card View';
      if (toggleIcon) toggleIcon.textContent = 'view_module';
      renderTableView();
    } else {
      cardContainer.classList.remove('hidden');
      cardContainer.style.display = '';
      tableContainer.classList.remove('active');
      if (toggleText) toggleText.textContent = 'Table View';
      if (toggleIcon) toggleIcon.textContent = 'table_chart';
      renderCardView();
    }
  }

  window.toggleView = function () {
    if (window.innerWidth <= 768) return;
    currentView = currentView === 'cards' ? 'table' : 'cards';
    applyView();
  };

  // ---- Render ----

  function render() {
    if (currentView === 'table' && window.innerWidth > 768) {
      renderTableView();
    } else {
      renderCardView();
    }
  }

  // ---- Notes Toggle (Card View) ----
  window.toggleSharedNotes = function (btn) {
    const entry = btn.closest('.program-entry');
    if (!entry) return;
    const notesField = entry.querySelector('.notes-field');
    if (!notesField) return;

    const isHidden = notesField.style.display === 'none' || notesField.style.display === '';
    notesField.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? 'Hide Notes' : 'Show Notes';
  };

  // ---- Card View Rendering ----

  function renderCardView() {
    const container = document.getElementById('programSections');
    if (!container) return;

    container.innerHTML = '';

    if (scheduleData.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:#777;">No schedule entries yet.</div>';
      return;
    }

    const dates = [...new Set(scheduleData.map(p => p.date))].sort();

    dates.forEach(date => {
      const matchingPrograms = scheduleData
        .map((p, i) => ({ ...p, __index: i }))
        .filter(p => p.date === date && matchesSearch(p));

      const sorted = sortPrograms(matchingPrograms);
      if (sorted.length === 0) return;

      const section = document.createElement('div');
      section.className = 'date-section';
      section.setAttribute('data-date', date);

      const headerWrapper = document.createElement('div');
      headerWrapper.className = 'date-header';
      headerWrapper.innerHTML = `
        <div class="date-title">${formatDate(date)}</div>
        <button class="suggest-new-btn" onclick="openAddModal('${date}')">
          <span class="material-symbols-outlined">add_circle</span> Suggest Entry
        </button>
      `;
      section.appendChild(headerWrapper);

      sorted.forEach(program => {
        const entry = document.createElement('div');
        entry.className = 'program-entry' + (program.done ? ' done-entry' : '');
        const escapedProgram = encodeURIComponent(JSON.stringify({
          _id: program._id,
          date: program.date,
          name: program.name || '',
          startTime: program.startTime || '',
          endTime: program.endTime || '',
          location: program.location || '',
          photographer: program.photographer || '',
          notes: program.notes || ''
        }));

        entry.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;" class="time-row">
            <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;" class="time-fields-container">
              <input type="time"
                class="time-input"
                style="width: 110px; min-width: 90px; text-align: left; font-size: 12px;"
                value="${program.startTime || ''}"
                readonly>
              <input type="time"
                class="time-input"
                style="width: 110px; min-width: 90px; text-align: left; font-size: 12px;"
                value="${program.endTime || ''}"
                readonly>
            </div>
            <div class="right-actions" style="flex-shrink: 0; margin-left: auto; display: flex; align-items: center; gap: 6px;">
              ${program.done ? '<span class="material-symbols-outlined" style="color: #28a745; font-size: 20px;">check_circle</span>' : ''}
              <button class="suggest-edit-btn" onclick="openEditModal('${escapedProgram}')">
                <span class="material-symbols-outlined">edit_note</span>
              </button>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <input class="program-name" type="text"
              style="flex: 1;"
              value="${program.name || ''}"
              readonly>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
            <div style="display: flex; align-items: center; flex: 1;">
              <span class="material-symbols-outlined" style="margin-right: 4px; font-size: 18px;">location_on</span>
              <textarea style="flex: 1; resize: none;" placeholder="Location" readonly>${program.location || ''}</textarea>
            </div>
            <div style="display: flex; align-items: center; flex: 1;">
              <span class="material-symbols-outlined" style="margin-right: 4px; font-size: 18px;">photo_camera</span>
              <textarea style="flex: 1; resize: none;" placeholder="Photographer" readonly>${program.photographer || ''}</textarea>
            </div>
          </div>
          <div class="entry-actions">
            <button class="show-notes-btn" onclick="toggleSharedNotes(this)">Show Notes</button>
          </div>
          <div class="notes-field" style="display: ${allNotesVisible ? 'block' : 'none'};">
            <textarea class="auto-expand" placeholder="Notes" readonly>${program.notes || ''}</textarea>
          </div>
        `;

        section.appendChild(entry);
      });

      container.appendChild(section);
    });
  }

  // ---- Table View Rendering ----

  function renderTableView() {
    const tableContainer = document.getElementById('scheduleTableView');
    if (!tableContainer) return;

    tableContainer.innerHTML = '';

    if (scheduleData.length === 0) {
      tableContainer.innerHTML = '<div style="text-align:center;padding:40px;color:#777;">No schedule entries yet.</div>';
      return;
    }

    const dates = [...new Set(scheduleData.map(p => p.date))].sort();

    dates.forEach(date => {
      const matchingPrograms = scheduleData
        .map((p, i) => ({ ...p, __index: i }))
        .filter(p => p.date === date && matchesSearch(p));

      const sorted = sortPrograms(matchingPrograms);
      if (sorted.length === 0) return;

      const section = document.createElement('div');
      section.className = 'schedule-table-section';
      section.setAttribute('data-date', date);

      const dateHeader = document.createElement('div');
      dateHeader.className = 'date-header';
      dateHeader.innerHTML = `<div>${formatDate(date)}</div>`;
      section.appendChild(dateHeader);

      const table = document.createElement('table');

      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Start Time</th>
          <th>End Time</th>
          <th>Program Name</th>
          <th>Location</th>
          <th>Photographer</th>
          <th>Notes</th>
          <th>Done</th>
          <th style="width: 50px;"></th>
        </tr>
      `;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      sorted.forEach(program => {
        const row = document.createElement('tr');
        row.className = program.done ? 'done-row' : '';
        const escapedProgram = encodeURIComponent(JSON.stringify({
          _id: program._id,
          date: program.date,
          name: program.name || '',
          startTime: program.startTime || '',
          endTime: program.endTime || '',
          location: program.location || '',
          photographer: program.photographer || '',
          notes: program.notes || ''
        }));

        row.innerHTML = `
          <td><span class="cell-display">${formatTo12Hour(program.startTime || '')}</span></td>
          <td><span class="cell-display">${formatTo12Hour(program.endTime || '')}</span></td>
          <td><span class="cell-display">${program.name || ''}</span></td>
          <td><span class="cell-display">${program.location || ''}</span></td>
          <td><span class="cell-display">${program.photographer || ''}</span></td>
          <td><span class="cell-display">${program.notes || ''}</span></td>
          <td class="done-checkbox-cell">
            ${program.done
              ? '<span class="material-symbols-outlined" style="color: #28a745; font-size: 20px;">check_circle</span>'
              : '<span style="color: #ccc;">—</span>'}
          </td>
          <td>
            <button class="suggest-edit-btn" onclick="openEditModal('${escapedProgram}')" title="Suggest Edit">
              <span class="material-symbols-outlined">edit_note</span>
            </button>
          </td>
        `;

        tbody.appendChild(row);
      });

      // Add a "Suggest New Entry" row at the bottom
      const addRow = document.createElement('tr');
      addRow.innerHTML = `
        <td colspan="8" style="text-align: center; padding: 8px;">
          <button class="suggest-new-btn" onclick="openAddModal('${date}')" style="margin: 0;">
            <span class="material-symbols-outlined">add_circle</span> Suggest New Entry
          </button>
        </td>
      `;
      tbody.appendChild(addRow);

      table.appendChild(tbody);
      section.appendChild(table);
      tableContainer.appendChild(section);
    });
  }

  // ---- Event Listeners ----

  function setupEventListeners() {
    // Date filter
    const filterDropdown = document.getElementById('filterDateDropdown');
    if (filterDropdown) {
      filterDropdown.addEventListener('change', function (e) {
        filterDate = e.target.value;
        render();
      });
    }

    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', function (e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          searchQuery = e.target.value.trim();
          render();
        }, 200);
      });
    }

    // Handle resize (switch to card view on mobile)
    window.addEventListener('resize', function () {
      if (window.innerWidth <= 768 && currentView === 'table') {
        currentView = 'cards';
        applyView();
      }
    });
  }

  // ---- Change Request Modal Logic ----

  function showToast(msg) {
    const toast = document.getElementById('crToast');
    const msgEl = document.getElementById('crToastMsg');
    if (!toast || !msgEl) return;
    msgEl.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  window.closeCrModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  };

  window.openEditModal = function (encodedProgram) {
    const program = JSON.parse(decodeURIComponent(encodedProgram));
    const modal = document.getElementById('crEditModal');
    if (!modal) return;

    // Store original data
    document.getElementById('crEditProgramId').value = program._id || '';
    document.getElementById('crEditProgramDate').value = program.date || '';

    // Pre-fill fields with current values
    document.getElementById('crEditName').value = program.name || '';
    document.getElementById('crEditStartTime').value = program.startTime || '';
    document.getElementById('crEditEndTime').value = program.endTime || '';
    document.getElementById('crEditLocation').value = program.location || '';
    document.getElementById('crEditPhotographer').value = program.photographer || '';
    document.getElementById('crEditNotes').value = program.notes || '';
    document.getElementById('crEditMessage').value = '';

    // Persist client name across modals
    const savedName = sessionStorage.getItem('crClientName') || '';
    document.getElementById('crEditClientName').value = savedName;

    // Show original values below each field
    document.getElementById('crEditNameOrig').textContent = program.name ? `Current: ${program.name}` : '';
    document.getElementById('crEditStartTimeOrig').textContent = program.startTime ? `Current: ${formatTo12Hour(program.startTime)}` : '';
    document.getElementById('crEditEndTimeOrig').textContent = program.endTime ? `Current: ${formatTo12Hour(program.endTime)}` : '';
    document.getElementById('crEditLocationOrig').textContent = program.location ? `Current: ${program.location}` : '';
    document.getElementById('crEditPhotographerOrig').textContent = program.photographer ? `Current: ${program.photographer}` : '';
    document.getElementById('crEditNotesOrig').textContent = program.notes ? `Current: ${program.notes}` : '';

    // Store original data on the modal for submission
    modal.dataset.originalData = JSON.stringify(program);

    modal.classList.add('active');
  };

  window.openAddModal = function (date) {
    const modal = document.getElementById('crAddModal');
    if (!modal) return;

    // Clear fields
    document.getElementById('crAddDate').value = date || '';
    document.getElementById('crAddName').value = '';
    document.getElementById('crAddStartTime').value = '';
    document.getElementById('crAddEndTime').value = '';
    document.getElementById('crAddLocation').value = '';
    document.getElementById('crAddPhotographer').value = '';
    document.getElementById('crAddNotes').value = '';
    document.getElementById('crAddMessage').value = '';

    // Persist client name
    const savedName = sessionStorage.getItem('crClientName') || '';
    document.getElementById('crAddClientName').value = savedName;

    modal.classList.add('active');
  };

  window.submitEditRequest = async function () {
    const btn = document.getElementById('crEditSubmitBtn');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    const shareToken = getShareToken();
    const modal = document.getElementById('crEditModal');
    const originalData = JSON.parse(modal.dataset.originalData || '{}');

    const clientName = document.getElementById('crEditClientName').value.trim();
    if (clientName) sessionStorage.setItem('crClientName', clientName);

    const proposedData = {
      name: document.getElementById('crEditName').value.trim(),
      startTime: document.getElementById('crEditStartTime').value,
      endTime: document.getElementById('crEditEndTime').value,
      location: document.getElementById('crEditLocation').value.trim(),
      photographer: document.getElementById('crEditPhotographer').value.trim(),
      notes: document.getElementById('crEditNotes').value.trim()
    };

    try {
      const res = await fetch(`${API_BASE}/api/shared-schedule/${shareToken}/change-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'edit',
          programId: document.getElementById('crEditProgramId').value,
          programDate: document.getElementById('crEditProgramDate').value,
          proposedData,
          originalData: {
            name: originalData.name || '',
            startTime: originalData.startTime || '',
            endTime: originalData.endTime || '',
            location: originalData.location || '',
            photographer: originalData.photographer || '',
            notes: originalData.notes || ''
          },
          clientName: clientName || 'Client',
          clientMessage: document.getElementById('crEditMessage').value.trim()
        })
      });

      if (!res.ok) throw new Error('Failed to submit');

      closeCrModal('crEditModal');
      showToast('Edit suggestion submitted for review!');
    } catch (err) {
      console.error('Error submitting edit request:', err);
      alert('Failed to submit suggestion. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Suggestion';
    }
  };

  window.submitAddRequest = async function () {
    const btn = document.getElementById('crAddSubmitBtn');
    if (btn.disabled) return;

    const date = document.getElementById('crAddDate').value;
    const name = document.getElementById('crAddName').value.trim();
    if (!date) {
      alert('Please select a date.');
      return;
    }
    if (!name) {
      alert('Please enter a program name.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting...';

    const shareToken = getShareToken();
    const clientName = document.getElementById('crAddClientName').value.trim();
    if (clientName) sessionStorage.setItem('crClientName', clientName);

    try {
      const res = await fetch(`${API_BASE}/api/shared-schedule/${shareToken}/change-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'add',
          programDate: date,
          proposedData: {
            date,
            name,
            startTime: document.getElementById('crAddStartTime').value,
            endTime: document.getElementById('crAddEndTime').value,
            location: document.getElementById('crAddLocation').value.trim(),
            photographer: document.getElementById('crAddPhotographer').value.trim(),
            notes: document.getElementById('crAddNotes').value.trim()
          },
          clientName: clientName || 'Client',
          clientMessage: document.getElementById('crAddMessage').value.trim()
        })
      });

      if (!res.ok) throw new Error('Failed to submit');

      closeCrModal('crAddModal');
      showToast('New entry suggestion submitted for review!');
    } catch (err) {
      console.error('Error submitting add request:', err);
      alert('Failed to submit suggestion. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Suggestion';
    }
  };

  // Close modals on overlay click or Escape
  document.addEventListener('click', function (e) {
    if (e.target.classList.contains('cr-modal-overlay')) {
      e.target.classList.remove('active');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.cr-modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
  });

  // ---- Init ----

  document.addEventListener('DOMContentLoaded', function () {
    setupEventListeners();
    loadSharedSchedule();
  });
})();
