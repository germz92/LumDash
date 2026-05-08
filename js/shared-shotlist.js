// =====================================================
// Shared Shotlist - View-Only Client Page with Suggest Changes
// =====================================================
(function () {
  'use strict';

  let shotlistsData = [];
  let eventTitle = 'Shotlists';
  let selectedListId = null;

  // ---- Helpers ----

  function getShareToken() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ---- Navigation ----

  function setupNavigation() {
    const token = getShareToken();
    const navSchedule = document.getElementById('navSchedule');
    const navShotlist = document.getElementById('navShotlist');

    if (navSchedule) {
      navSchedule.href = `shared-schedule.html?token=${token}`;
    }
    if (navShotlist) {
      navShotlist.href = `shared-shotlist.html?token=${token}`;
    }
  }

  // ---- Data Loading ----

  let autoRefreshInterval = null;
  const AUTO_REFRESH_MS = 60000; // 60 seconds

  async function loadSharedShotlist() {
    const shareToken = getShareToken();
    if (!shareToken) {
      showError();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/shared-shotlist/${shareToken}`);
      if (!res.ok) {
        showError();
        return;
      }

      const data = await res.json();
      eventTitle = data.title || 'Shotlists';
      shotlistsData = data.shotlists || [];

      document.getElementById('eventTitle').textContent = eventTitle + ' - Shotlists';
      document.title = `${eventTitle} - Shotlists`;

      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('shotlistContent').style.display = 'block';

      renderShotlists();

      // Start auto-refresh after initial load
      startAutoRefresh();
    } catch (err) {
      console.error('Error loading shared shotlist:', err);
      showError();
    }
  }

  // Silent auto-refresh: re-fetches data and re-renders without losing current selection
  async function silentRefresh() {
    const shareToken = getShareToken();
    if (!shareToken) return;

    try {
      const res = await fetch(`${API_BASE}/api/shared-shotlist/${shareToken}`);
      if (!res.ok) return; // Silently skip on error

      const data = await res.json();
      const newTitle = data.title || 'Shotlists';
      const newData = data.shotlists || [];

      // Only re-render if data actually changed
      if (JSON.stringify(newData) !== JSON.stringify(shotlistsData) || newTitle !== eventTitle) {
        eventTitle = newTitle;
        shotlistsData = newData;

        document.getElementById('eventTitle').textContent = eventTitle + ' - Shotlists';
        document.title = `${eventTitle} - Shotlists`;

        renderShotlists();
        console.log('[AutoRefresh] Shotlist data updated');
      }

      // Also refresh the badge count
      updateMyReqBadge();
    } catch (err) {
      console.log('[AutoRefresh] Silent refresh failed, will retry next cycle');
    }
  }

  function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(silentRefresh, AUTO_REFRESH_MS);
    console.log(`[AutoRefresh] Started - refreshing every ${AUTO_REFRESH_MS / 1000}s`);
  }

  function showError() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'flex';
  }

  // ---- Rendering ----

  function renderShotlists() {
    const container = document.getElementById('lists-container');
    const emptyState = document.getElementById('empty-state');
    const listSelectorSection = document.getElementById('list-selector-section');

    if (!container) return;

    // Update list selector dropdown
    updateListSelector();

    // Show/hide list selector based on whether there are lists
    if (listSelectorSection) {
      listSelectorSection.style.display = shotlistsData.length > 0 ? 'block' : 'none';
    }

    // Show/hide empty state
    if (shotlistsData.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      container.innerHTML = '';
      selectedListId = null;
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // If no list is selected, select the first one
    if (!selectedListId && shotlistsData.length > 0) {
      selectedListId = shotlistsData[0]._id || 'list-0';
    }

    // Find the selected list
    let selectedList = shotlistsData.find(list => {
      const listId = list._id || `list-${shotlistsData.indexOf(list)}`;
      return listId === selectedListId;
    });

    if (!selectedList && shotlistsData.length > 0) {
      selectedListId = shotlistsData[0]._id || 'list-0';
      selectedList = shotlistsData[0];
    }

    // Render the selected list
    if (selectedList) {
      const selectedIndex = shotlistsData.indexOf(selectedList);
      container.innerHTML = renderShotlist(selectedList, selectedIndex);
    } else {
      container.innerHTML = '';
    }
  }

  function updateListSelector() {
    const selector = document.getElementById('list-selector');
    if (!selector) return;

    selector.innerHTML = '<option value="">Choose a list...</option>';

    shotlistsData.forEach((list, index) => {
      const listId = list._id || `list-${index}`;
      const option = document.createElement('option');
      option.value = listId;
      option.textContent = list.name;
      if (listId === selectedListId) {
        option.selected = true;
      }
      selector.appendChild(option);
    });
  }

  function renderShotlist(list, listIndex) {
    const completedCount = list.items ? list.items.filter(item => item.completed).length : 0;
    const totalCount = list.items ? list.items.length : 0;
    const progressText = `${completedCount}/${totalCount}`;
    const listId = list._id || `list-${listIndex}`;

    return `
      <div class="shot-list" data-list-id="${listId}" data-list-index="${listIndex}">
        <div class="list-header">
          <h3 class="list-title">${escapeHtml(list.name)}</h3>
          <div class="list-info">
            <span class="list-progress">${progressText}</span>
          </div>
        </div>
        
        <div class="list-content">
          ${(list.items || []).map((item, itemIndex) => renderShotItem(item, itemIndex, listId, list.name)).join('')}
          
          <div class="add-shot-section" style="text-align: center; padding: 12px 20px;">
            <button class="suggest-add-item-btn" onclick="openAddItemModal('${listId}', decodeURIComponent('${encodeURIComponent(list.name)}'))">
              <span class="material-symbols-outlined">add_circle</span> Suggest New Item
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderShotItem(item, itemIndex, listId, listName) {
    const itemId = item._id || `item-${itemIndex}`;

    // Format completion info
    let completionInfo = '';
    if (item.completed && item.completedByName) {
      completionInfo = `
        <div class="completion-info">
          <span class="completed-by">✓ ${escapeHtml(item.completedByName)}</span>
        </div>
      `;
    }

    const encodedData = encodeURIComponent(JSON.stringify({
      listId: listId,
      listName: listName,
      itemId: itemId,
      title: item.title || ''
    }));

    return `
      <div class="shot-item ${item.completed ? 'completed' : ''}" data-item-id="${itemId}" data-item-index="${itemIndex}">
        <input type="checkbox" class="shot-checkbox" ${item.completed ? 'checked' : ''} disabled>
        <div class="shot-content">
          <div class="shot-title">${escapeHtml(item.title)}</div>
          ${completionInfo}
        </div>
        <button class="suggest-edit-item-btn" onclick="openEditItemModal('${encodedData}')">
          <span class="material-symbols-outlined">edit_note</span>
        </button>
      </div>
    `;
  }

  // ---- Event Listeners ----

  function setupEventListeners() {
    // List selector dropdown
    const selector = document.getElementById('list-selector');
    if (selector) {
      selector.addEventListener('change', function (e) {
        selectedListId = e.target.value;
        renderShotlists();
      });
    }
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

  // Body scroll lock helpers
  let scrollLockPos = 0;
  function lockBodyScroll() {
    scrollLockPos = window.pageYOffset || document.documentElement.scrollTop;
    document.body.classList.add('modal-open');
    document.body.style.top = `-${scrollLockPos}px`;
  }
  function unlockBodyScroll() {
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, scrollLockPos);
  }

  // Prevent iOS rubber-band scroll on modal overlays
  document.addEventListener('touchmove', function (e) {
    if (!document.body.classList.contains('modal-open')) return;
    // Allow scrolling inside .cr-modal-body and .my-requests-body
    let target = e.target;
    while (target && target !== document.body) {
      if (target.classList && (target.classList.contains('cr-modal-body') || target.classList.contains('my-requests-body'))) {
        if (target.scrollHeight > target.clientHeight) return;
      }
      target = target.parentElement;
    }
    e.preventDefault();
  }, { passive: false });

  window.closeShotlistModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
    unlockBodyScroll();
  };

  window.openEditItemModal = function (encodedData) {
    const data = JSON.parse(decodeURIComponent(encodedData));
    const modal = document.getElementById('crEditItemModal');
    if (!modal) return;

    document.getElementById('crEditShotlistId').value = data.listId || '';
    document.getElementById('crEditShotlistName').value = data.listName || '';
    document.getElementById('crEditItemId').value = data.itemId || '';
    document.getElementById('crEditItemTitle').value = data.title || '';
    document.getElementById('crEditItemMessage').value = '';

    // Show original value
    document.getElementById('crEditItemTitleOrig').textContent = data.title ? `Current: ${data.title}` : '';

    // Persist client name
    const savedName = sessionStorage.getItem('crClientName') || '';
    document.getElementById('crEditItemClientName').value = savedName;

    modal.classList.add('active');
    lockBodyScroll();
  };

  window.openAddItemModal = function (listId, listName) {
    const modal = document.getElementById('crAddItemModal');
    if (!modal) return;

    document.getElementById('crAddItemShotlistId').value = listId || '';
    document.getElementById('crAddItemShotlistName').value = listName || '';
    document.getElementById('crAddItemTitle').value = '';
    document.getElementById('crAddItemMessage').value = '';

    // Persist client name
    const savedName = sessionStorage.getItem('crClientName') || '';
    document.getElementById('crAddItemClientName').value = savedName;

    modal.classList.add('active');
    lockBodyScroll();
  };

  window.submitEditItemRequest = async function () {
    const btn = document.getElementById('crEditItemSubmitBtn');
    if (btn.disabled) return;

    const newTitle = document.getElementById('crEditItemTitle').value.trim();
    if (!newTitle) {
      alert('Please enter an item title.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting...';

    const shareToken = getShareToken();
    const clientName = document.getElementById('crEditItemClientName').value.trim();
    if (clientName) sessionStorage.setItem('crClientName', clientName);

    const shotlistId = document.getElementById('crEditShotlistId').value;
    const shotlistName = document.getElementById('crEditShotlistName').value;
    const itemId = document.getElementById('crEditItemId').value;

    try {
      const res = await fetch(`${API_BASE}/api/shared-shotlist/${shareToken}/change-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'edit',
          shotlistId,
          shotlistName,
          itemId,
          proposedItemData: { title: newTitle },
          originalItemData: { title: document.getElementById('crEditItemTitleOrig').textContent.replace('Current: ', '') },
          clientName: clientName || 'Client',
          clientMessage: document.getElementById('crEditItemMessage').value.trim()
        })
      });

      if (!res.ok) throw new Error('Failed to submit');

      closeShotlistModal('crEditItemModal');
      showToast('Edit suggestion submitted for review!');
      updateMyReqBadge();
    } catch (err) {
      console.error('Error submitting edit request:', err);
      alert('Failed to submit suggestion. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Suggestion';
    }
  };

  window.submitAddItemRequest = async function () {
    const btn = document.getElementById('crAddItemSubmitBtn');
    if (btn.disabled) return;

    const title = document.getElementById('crAddItemTitle').value.trim();
    if (!title) {
      alert('Please enter an item title.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting...';

    const shareToken = getShareToken();
    const clientName = document.getElementById('crAddItemClientName').value.trim();
    if (clientName) sessionStorage.setItem('crClientName', clientName);

    const shotlistId = document.getElementById('crAddItemShotlistId').value;
    const shotlistName = document.getElementById('crAddItemShotlistName').value;

    try {
      const res = await fetch(`${API_BASE}/api/shared-shotlist/${shareToken}/change-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'add',
          shotlistId,
          shotlistName,
          proposedItemData: { title },
          clientName: clientName || 'Client',
          clientMessage: document.getElementById('crAddItemMessage').value.trim()
        })
      });

      if (!res.ok) throw new Error('Failed to submit');

      closeShotlistModal('crAddItemModal');
      showToast('New item suggestion submitted for review!');
      updateMyReqBadge();
    } catch (err) {
      console.error('Error submitting add request:', err);
      alert('Failed to submit suggestion. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Suggestion';
    }
  };

  // ---- My Requests Panel ----

  let myRequestsData = [];
  let myReqCurrentFilter = 'all';

  window.openMyRequests = async function () {
    const overlay = document.getElementById('myRequestsOverlay');
    if (overlay) overlay.classList.add('active');
    lockBodyScroll();
    myReqCurrentFilter = 'all';
    document.querySelectorAll('.my-req-filter button').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('.my-req-filter button[data-filter="all"]');
    if (allBtn) allBtn.classList.add('active');
    await loadMyRequests();
  };

  window.closeMyRequests = function () {
    const overlay = document.getElementById('myRequestsOverlay');
    if (overlay) overlay.classList.remove('active');
    unlockBodyScroll();
  };

  window.filterMyRequests = function (filter, btn) {
    myReqCurrentFilter = filter;
    document.querySelectorAll('.my-req-filter button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderMyRequests();
  };

  async function loadMyRequests() {
    const body = document.getElementById('myRequestsBody');
    if (!body) return;
    body.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">Loading...</div>';

    const shareToken = getShareToken();
    if (!shareToken) return;

    try {
      const res = await fetch(`${API_BASE}/api/shared-schedule/${shareToken}/change-requests/mine`);
      if (!res.ok) throw new Error('Failed to fetch');
      myRequestsData = await res.json();
      renderMyRequests();
    } catch (err) {
      console.error('Error loading my requests:', err);
      body.innerHTML = '<div style="text-align:center; padding:40px; color:#999;">Failed to load requests.</div>';
    }
  }

  function renderMyRequests() {
    const body = document.getElementById('myRequestsBody');
    if (!body) return;

    let filtered = myRequestsData;
    if (myReqCurrentFilter !== 'all') {
      filtered = myRequestsData.filter(r => r.status === myReqCurrentFilter);
    }

    if (filtered.length === 0) {
      body.innerHTML = `
        <div class="my-req-empty">
          <span class="material-symbols-outlined">inbox</span>
          <p>${myReqCurrentFilter === 'all' ? 'No requests submitted yet.' : 'No ' + myReqCurrentFilter + ' requests.'}</p>
        </div>
      `;
      return;
    }

    body.innerHTML = filtered.map(req => renderMyRequestCard(req)).join('');
  }

  function renderMyRequestCard(req) {
    const statusIcon = req.status === 'pending' ? 'schedule' : req.status === 'accepted' ? 'check_circle' : 'cancel';
    const statusLabel = req.status.charAt(0).toUpperCase() + req.status.slice(1);
    const typeLabel = req.type === 'edit' ? 'Edit' : 'New Entry';
    const sectionLabel = req.section === 'shotlist' ? 'Shotlist' : 'Schedule';

    let details = '';
    if (req.section === 'schedule') {
      const d = req.proposedData;
      if (d) {
        if (d.name) details += `<div class="detail-row"><span class="detail-label">Name:</span><span>${escapeHtml(d.name)}</span></div>`;
        if (d.date) details += `<div class="detail-row"><span class="detail-label">Date:</span><span>${d.date}</span></div>`;
        if (d.location) details += `<div class="detail-row"><span class="detail-label">Location:</span><span>${escapeHtml(d.location)}</span></div>`;
      }
    } else if (req.section === 'shotlist') {
      if (req.shotlistName) details += `<div class="detail-row"><span class="detail-label">List:</span><span>${escapeHtml(req.shotlistName)}</span></div>`;
      const itemData = req.proposedItemData || {};
      if (itemData.title) details += `<div class="detail-row"><span class="detail-label">Item:</span><span>${escapeHtml(itemData.title)}</span></div>`;
    }

    const timeAgo = getTimeAgo(new Date(req.createdAt));
    const message = req.clientMessage ? `<div class="my-req-message">"${escapeHtml(req.clientMessage)}"</div>` : '';

    return `
      <div class="my-req-card">
        <div class="my-req-card-header">
          <div style="display:flex; gap:6px; align-items:center;">
            <span class="my-req-type-badge ${req.type}">${typeLabel}</span>
            <span class="my-req-section-badge">${sectionLabel}</span>
          </div>
          <span class="my-req-status ${req.status}">
            <span class="material-symbols-outlined" style="font-size:14px;">${statusIcon}</span>
            ${statusLabel}
          </span>
        </div>
        <div class="my-req-details">${details || '<span style="color:#bbb;">No details</span>'}</div>
        ${message}
        <div class="my-req-time">${timeAgo}</div>
      </div>
    `;
  }

  function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async function updateMyReqBadge() {
    const shareToken = getShareToken();
    if (!shareToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/shared-schedule/${shareToken}/change-requests/mine`);
      if (!res.ok) return;
      const data = await res.json();
      const pendingCount = data.filter(r => r.status === 'pending').length;
      const badge = document.getElementById('myReqBadge');
      if (badge) {
        if (pendingCount > 0) {
          badge.textContent = pendingCount;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch (err) {
      // Silently fail
    }
  }

  // Close modals on overlay click or Escape
  document.addEventListener('click', function (e) {
    if (e.target.classList.contains('cr-modal-overlay') || e.target.classList.contains('my-requests-overlay')) {
      e.target.classList.remove('active');
      unlockBodyScroll();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const activeModals = document.querySelectorAll('.cr-modal-overlay.active, .my-requests-overlay.active');
      if (activeModals.length > 0) {
        activeModals.forEach(m => m.classList.remove('active'));
        unlockBodyScroll();
      }
    }
  });

  // ---- Init ----

  document.addEventListener('DOMContentLoaded', function () {
    setupNavigation();
    setupEventListeners();
    loadSharedShotlist();
    updateMyReqBadge();
  });
})();
