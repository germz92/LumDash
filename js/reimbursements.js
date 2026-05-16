(function () {
  const API_BASE = window.API_BASE;
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  // Clean up any stale modal left on document.body from a previous navigation
  const existingModal = document.body.querySelector(':scope > #createRequestModal');
  if (existingModal) existingModal.remove();

  // Grab fresh references from the just-injected page HTML
  const pageContainer = document.getElementById('page-container');
  const reimbursementsBody = document.getElementById('reimbursementsBody');
  const mobileCardsContainer = document.getElementById('mobileCardsContainer');
  const emptyState = document.getElementById('emptyState');
  const table = document.getElementById('reimbursementsTable');
  const createModal = document.getElementById('createRequestModal');
  const eventNameInput = document.getElementById('eventNameInput');
  const eventIdInput = document.getElementById('eventIdInput');
  const descriptionInput = document.getElementById('descriptionInput');
  const eventSuggestions = document.getElementById('eventSuggestions');

  if (!createModal) {
    console.error('[reimbursements.js] createRequestModal not found in DOM');
    return;
  }

  let events = [];

  // Move modal to document.body so it escapes #page-container stacking context
  document.body.appendChild(createModal);

  // Cleanup function called by app.js when navigating away
  window.cleanupReimbursementsPage = function () {
    const modal = document.body.querySelector(':scope > #createRequestModal');
    if (modal) modal.remove();
    document.body.classList.remove('modal-open');
  };

  // Use event delegation on pageContainer for the Create Request button
  // so it works even if the button reference was tricky to grab
  if (pageContainer) {
    pageContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('#createRequestBtn');
      if (btn) openCreateModal();
    });
  }

  // Direct listeners on modal elements (these are now on document.body)
  document.getElementById('closeCreateModal')?.addEventListener('click', closeCreateModal);
  document.getElementById('cancelCreateBtn')?.addEventListener('click', closeCreateModal);
  document.getElementById('submitCreateBtn')?.addEventListener('click', submitCreate);

  createModal.addEventListener('click', (e) => {
    if (e.target === createModal) closeCreateModal();
  });

  // Back button - also use delegation
  if (pageContainer) {
    pageContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('#backBtn');
      if (btn) {
        if (window.navigate) window.navigate('timesheet');
        else window.location.href = '/dashboard.html#timesheet';
      }
    });
  }

  if (eventNameInput) {
    eventNameInput.addEventListener('input', () => {
      const match = events.find(ev => ev.title === eventNameInput.value);
      if (eventIdInput) eventIdInput.value = match ? match._id : '';
    });
  }

  function openCreateModal() {
    if (eventNameInput) eventNameInput.value = '';
    if (eventIdInput) eventIdInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
    createModal.style.display = 'flex';
    document.body.classList.add('modal-open');
    loadEvents();
  }

  function closeCreateModal() {
    createModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  async function loadEvents() {
    try {
      const res = await fetch(`${API_BASE}/api/tables`, {
        headers: { Authorization: token }
      });
      if (res.ok) {
        events = await res.json();
        if (eventSuggestions) {
          eventSuggestions.innerHTML = events.map(ev =>
            `<option value="${escapeHtml(ev.title)}">`
          ).join('');
        }
      }
    } catch (err) {
      console.error('Failed to load events:', err);
    }
  }

  async function submitCreate() {
    const eventName = (eventNameInput?.value || '').trim();
    const description = (descriptionInput?.value || '').trim();
    const eventId = eventIdInput?.value || null;

    if (!eventName) {
      alert('Please enter an event name.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/reimbursements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token
        },
        body: JSON.stringify({ eventId, eventName, description })
      });

      if (res.ok) {
        closeCreateModal();
        loadReimbursements();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create request');
      }
    } catch (err) {
      console.error('Error creating reimbursement:', err);
      alert('Failed to create request');
    }
  }

  async function loadReimbursements() {
    try {
      const res = await fetch(`${API_BASE}/api/reimbursements`, {
        headers: { Authorization: token }
      });

      if (!res.ok) throw new Error('Failed to load');
      const requests = await res.json();

      if (requests.length === 0) {
        if (table) table.style.display = 'none';
        if (mobileCardsContainer) mobileCardsContainer.style.display = 'none';
        if (emptyState) emptyState.style.display = 'flex';
        return;
      }

      if (emptyState) emptyState.style.display = 'none';

      if (table) table.style.display = '';
      if (reimbursementsBody) {
        reimbursementsBody.innerHTML = requests.map(req => `
          <tr class="clickable-row" data-id="${req._id}">
            <td>${formatDate(req.dateSubmitted || req.createdAt)}</td>
            <td>$${(req.totalAmount || 0).toFixed(2)}</td>
            <td>${escapeHtml(req.eventName || '—')}</td>
            <td><span class="status-badge status-${req.status}">${capitalize(req.status)}</span></td>
          </tr>
        `).join('');
      }

      if (mobileCardsContainer) {
        mobileCardsContainer.innerHTML = requests.map(req => `
          <div class="reimburse-card clickable-row" data-id="${req._id}">
            <div class="reimburse-card-row">
              <span class="reimburse-card-label">Event</span>
              <span class="reimburse-card-value">${escapeHtml(req.eventName || '—')}</span>
            </div>
            <div class="reimburse-card-row">
              <span class="reimburse-card-label">Date</span>
              <span class="reimburse-card-value">${formatDate(req.dateSubmitted || req.createdAt)}</span>
            </div>
            <div class="reimburse-card-row">
              <span class="reimburse-card-label">Amount</span>
              <span class="reimburse-card-value reimburse-amount">$${(req.totalAmount || 0).toFixed(2)}</span>
            </div>
            <div class="reimburse-card-row">
              <span class="reimburse-card-label">Status</span>
              <span class="status-badge status-${req.status}">${capitalize(req.status)}</span>
            </div>
          </div>
        `).join('');
      }

      // Click handlers for navigation to detail
      document.querySelectorAll('.clickable-row').forEach(row => {
        row.addEventListener('click', () => {
          const id = row.dataset.id;
          localStorage.setItem('reimbursementRequestId', id);
          if (window.navigate) window.navigate('reimbursement-detail', id);
          else window.location.href = `/dashboard.html#reimbursement-detail`;
        });
      });

    } catch (err) {
      console.error('Error loading reimbursements:', err);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Initialize
  loadReimbursements();
})();
