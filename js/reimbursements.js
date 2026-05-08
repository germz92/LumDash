(function () {
  const API_BASE = window.API_BASE;
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  const reimbursementsBody = document.getElementById('reimbursementsBody');
  const mobileCardsContainer = document.getElementById('mobileCardsContainer');
  const emptyState = document.getElementById('emptyState');
  const table = document.getElementById('reimbursementsTable');
  const createModal = document.getElementById('createRequestModal');
  const eventNameInput = document.getElementById('eventNameInput');
  const eventIdInput = document.getElementById('eventIdInput');
  const descriptionInput = document.getElementById('descriptionInput');
  const eventSuggestions = document.getElementById('eventSuggestions');

  let events = [];

  // Move modal to document.body so it escapes #page-container stacking context
  if (createModal) document.body.appendChild(createModal);

  // Back button
  document.getElementById('backBtn').addEventListener('click', () => {
    if (window.navigate) window.navigate('timesheet');
    else window.location.href = '/dashboard.html#timesheet';
  });

  // Modal controls
  document.getElementById('createRequestBtn').addEventListener('click', openCreateModal);
  document.getElementById('closeCreateModal').addEventListener('click', closeCreateModal);
  document.getElementById('cancelCreateBtn').addEventListener('click', closeCreateModal);
  document.getElementById('submitCreateBtn').addEventListener('click', submitCreate);

  createModal.addEventListener('click', (e) => {
    if (e.target === createModal) closeCreateModal();
  });

  // Match event name to ID when user selects from datalist
  eventNameInput.addEventListener('input', () => {
    const match = events.find(ev => ev.title === eventNameInput.value);
    eventIdInput.value = match ? match._id : '';
  });

  function openCreateModal() {
    eventNameInput.value = '';
    eventIdInput.value = '';
    descriptionInput.value = '';
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
        eventSuggestions.innerHTML = events.map(ev =>
          `<option value="${escapeHtml(ev.title)}">`
        ).join('');
      }
    } catch (err) {
      console.error('Failed to load events:', err);
    }
  }

  async function submitCreate() {
    const eventName = eventNameInput.value.trim();
    const description = descriptionInput.value.trim();
    const eventId = eventIdInput.value || null;

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
        table.style.display = 'none';
        mobileCardsContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
      }

      emptyState.style.display = 'none';

      // Desktop table
      table.style.display = '';
      reimbursementsBody.innerHTML = requests.map(req => `
        <tr class="clickable-row" data-id="${req._id}">
          <td>${formatDate(req.dateSubmitted || req.createdAt)}</td>
          <td>$${(req.totalAmount || 0).toFixed(2)}</td>
          <td>${escapeHtml(req.eventName || '—')}</td>
          <td><span class="status-badge status-${req.status}">${capitalize(req.status)}</span></td>
        </tr>
      `).join('');

      // Mobile cards
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
