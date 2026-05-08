(function () {
  const API_BASE = window.API_BASE;
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  let requestId = null;
  let requestData = null;
  let items = [];

  const itemsBody = document.getElementById('itemsBody');
  const mobileItemsContainer = document.getElementById('mobileItemsContainer');
  const emptyItemsState = document.getElementById('emptyItemsState');
  const itemsTable = document.getElementById('itemsTable');
  const totalAmountEl = document.getElementById('totalAmount');
  const requestEvent = document.getElementById('requestEvent');
  const requestDescription = document.getElementById('requestDescription');
  const requestStatus = document.getElementById('requestStatus');
  const requestTitle = document.getElementById('requestTitle');
  const submitBtn = document.getElementById('submitBtn');
  const deleteBtn = document.getElementById('deleteRequestBtn');

  // Back button
  document.getElementById('backBtn').addEventListener('click', () => {
    if (window.navigate) window.navigate('reimbursements');
    else window.location.href = '/dashboard.html#reimbursements';
  });

  document.getElementById('addItemBtn').addEventListener('click', addNewItem);
  document.getElementById('saveBtn').addEventListener('click', saveItems);
  document.getElementById('submitBtn').addEventListener('click', submitRequest);
  deleteBtn.addEventListener('click', deleteRequest);

  // initPage is called by app.js with the request ID
  window.initPage = function (id) {
    requestId = id;
    if (requestId) loadRequest();
  };

  // Fallback: if initPage wasn't called, try localStorage
  setTimeout(() => {
    if (!requestId) {
      requestId = localStorage.getItem('reimbursementRequestId');
      if (requestId) loadRequest();
    }
  }, 200);

  async function loadRequest() {
    try {
      const res = await fetch(`${API_BASE}/api/reimbursements/${requestId}`, {
        headers: { Authorization: token }
      });
      if (!res.ok) throw new Error('Failed to load request');

      requestData = await res.json();
      items = requestData.items || [];

      requestTitle.textContent = 'Reimbursement Request';
      requestEvent.textContent = requestData.eventName || '—';
      requestDescription.textContent = requestData.description || '—';
      requestStatus.textContent = capitalize(requestData.status);
      requestStatus.className = `status-badge status-${requestData.status}`;

      const isEditable = requestData.status === 'draft';
      document.getElementById('addItemBtn').style.display = isEditable ? '' : 'none';
      document.getElementById('saveBtn').style.display = isEditable ? '' : 'none';
      submitBtn.style.display = isEditable ? '' : 'none';
      deleteBtn.style.display = isEditable ? '' : 'none';

      renderItems();
    } catch (err) {
      console.error('Error loading reimbursement request:', err);
    }
  }

  function renderItems() {
    updateTotal();

    if (items.length === 0) {
      itemsTable.style.display = 'none';
      mobileItemsContainer.style.display = 'none';
      emptyItemsState.style.display = 'flex';
      return;
    }

    emptyItemsState.style.display = 'none';
    const isEditable = requestData && requestData.status === 'draft';

    // Desktop table
    itemsTable.style.display = '';
    itemsBody.innerHTML = items.map((item, idx) => {
      if (isEditable) {
        return `
          <tr data-idx="${idx}">
            <td><input type="date" class="item-date" value="${item.date ? item.date.split('T')[0] : ''}" data-idx="${idx}"></td>
            <td>
              <select class="item-category" data-idx="${idx}">
                <option value="meals" ${item.category === 'meals' ? 'selected' : ''}>Meals</option>
                <option value="travel" ${item.category === 'travel' ? 'selected' : ''}>Travel</option>
                <option value="misc" ${item.category === 'misc' ? 'selected' : ''}>Misc</option>
              </select>
            </td>
            <td><input type="number" class="item-amount" step="0.01" min="0" value="${item.amount || ''}" placeholder="0.00" data-idx="${idx}"></td>
            <td><input type="text" class="item-notes" value="${escapeAttr(item.notes || '')}" placeholder="Notes..." data-idx="${idx}"></td>
            <td class="receipt-cell">
              ${item.attachmentUrl
                ? `<a href="${item.attachmentUrl}" target="_blank" class="receipt-link" title="${escapeAttr(item.attachmentName || 'Receipt')}">
                    <span class="material-symbols-outlined">description</span>
                  </a>
                  <button class="btn-remove-receipt" data-idx="${idx}" title="Remove receipt">
                    <span class="material-symbols-outlined">close</span>
                  </button>`
                : `<label class="btn-upload-receipt" title="Upload receipt">
                    <span class="material-symbols-outlined">upload_file</span>
                    <input type="file" class="file-input" accept="image/jpeg,image/png,application/pdf" data-idx="${idx}" style="display:none">
                  </label>`
              }
            </td>
            <td class="actions-col">
              <button class="btn-delete-item" data-idx="${idx}" title="Remove item">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </td>
          </tr>`;
      } else {
        return `
          <tr>
            <td>${formatDate(item.date)}</td>
            <td>${capitalize(item.category || 'misc')}</td>
            <td>$${(item.amount || 0).toFixed(2)}</td>
            <td>${escapeHtml(item.notes || '—')}</td>
            <td class="receipt-cell">
              ${item.attachmentUrl
                ? `<a href="${item.attachmentUrl}" target="_blank" class="receipt-link" title="${escapeAttr(item.attachmentName || 'Receipt')}">
                    <span class="material-symbols-outlined">description</span> View
                  </a>`
                : '—'
              }
            </td>
            <td></td>
          </tr>`;
      }
    }).join('');

    // Mobile cards
    mobileItemsContainer.innerHTML = items.map((item, idx) => {
      if (isEditable) {
        return `
          <div class="reimburse-item-card" data-idx="${idx}">
            <div class="item-card-field">
              <label>Date</label>
              <input type="date" class="item-date" value="${item.date ? item.date.split('T')[0] : ''}" data-idx="${idx}">
            </div>
            <div class="item-card-field">
              <label>Category</label>
              <select class="item-category" data-idx="${idx}">
                <option value="meals" ${item.category === 'meals' ? 'selected' : ''}>Meals</option>
                <option value="travel" ${item.category === 'travel' ? 'selected' : ''}>Travel</option>
                <option value="misc" ${item.category === 'misc' ? 'selected' : ''}>Misc</option>
              </select>
            </div>
            <div class="item-card-field">
              <label>Amount</label>
              <input type="number" class="item-amount" step="0.01" min="0" value="${item.amount || ''}" placeholder="0.00" data-idx="${idx}">
            </div>
            <div class="item-card-field">
              <label>Notes</label>
              <input type="text" class="item-notes" value="${escapeAttr(item.notes || '')}" placeholder="Notes..." data-idx="${idx}">
            </div>
            <div class="item-card-field receipt-field">
              <label>Receipt</label>
              ${item.attachmentUrl
                ? `<a href="${item.attachmentUrl}" target="_blank" class="receipt-link">
                    <span class="material-symbols-outlined">description</span> ${escapeHtml(item.attachmentName || 'View')}
                  </a>
                  <button class="btn-remove-receipt" data-idx="${idx}"><span class="material-symbols-outlined">close</span></button>`
                : `<label class="btn-upload-receipt">
                    <span class="material-symbols-outlined">upload_file</span> Upload
                    <input type="file" class="file-input" accept="image/jpeg,image/png,application/pdf" data-idx="${idx}" style="display:none">
                  </label>`
              }
            </div>
            <div class="item-card-actions">
              <button class="btn-delete-item" data-idx="${idx}">
                <span class="material-symbols-outlined">delete</span> Remove
              </button>
            </div>
          </div>`;
      } else {
        return `
          <div class="reimburse-item-card readonly">
            <div class="item-card-field">
              <label>Date</label>
              <span>${formatDate(item.date)}</span>
            </div>
            <div class="item-card-field">
              <label>Category</label>
              <span>${capitalize(item.category || 'misc')}</span>
            </div>
            <div class="item-card-field">
              <label>Amount</label>
              <span>$${(item.amount || 0).toFixed(2)}</span>
            </div>
            <div class="item-card-field">
              <label>Notes</label>
              <span>${escapeHtml(item.notes || '—')}</span>
            </div>
            <div class="item-card-field">
              <label>Receipt</label>
              ${item.attachmentUrl
                ? `<a href="${item.attachmentUrl}" target="_blank" class="receipt-link">${escapeHtml(item.attachmentName || 'View')}</a>`
                : '<span>—</span>'
              }
            </div>
          </div>`;
      }
    }).join('');

    bindItemEvents();
  }

  function bindItemEvents() {
    // Inline edits -> sync to items array
    document.querySelectorAll('.item-date').forEach(el => {
      el.addEventListener('change', (e) => {
        items[e.target.dataset.idx].date = e.target.value;
      });
    });
    document.querySelectorAll('.item-category').forEach(el => {
      el.addEventListener('change', (e) => {
        items[e.target.dataset.idx].category = e.target.value;
      });
    });
    document.querySelectorAll('.item-amount').forEach(el => {
      el.addEventListener('input', (e) => {
        items[e.target.dataset.idx].amount = parseFloat(e.target.value) || 0;
        updateTotal();
      });
    });
    document.querySelectorAll('.item-notes').forEach(el => {
      el.addEventListener('input', (e) => {
        items[e.target.dataset.idx].notes = e.target.value;
      });
    });

    // Delete item
    document.querySelectorAll('.btn-delete-item').forEach(el => {
      el.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx);
        items.splice(idx, 1);
        renderItems();
      });
    });

    // Remove receipt
    document.querySelectorAll('.btn-remove-receipt').forEach(el => {
      el.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx);
        items[idx].attachmentUrl = '';
        items[idx].attachmentPublicId = '';
        items[idx].attachmentName = '';
        renderItems();
      });
    });

    // File upload
    document.querySelectorAll('.file-input').forEach(el => {
      el.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const file = e.target.files[0];
        if (file) uploadReceipt(idx, file);
      });
    });
  }

  function addNewItem() {
    items.push({
      date: new Date().toISOString().split('T')[0],
      category: 'misc',
      amount: 0,
      notes: '',
      attachmentUrl: '',
      attachmentPublicId: '',
      attachmentName: ''
    });
    renderItems();

    // Scroll to the new item
    const lastRow = itemsBody.lastElementChild || mobileItemsContainer.lastElementChild;
    if (lastRow) lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function uploadReceipt(idx, file) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/api/reimbursements/${requestId}/upload`, {
        method: 'POST',
        headers: { Authorization: token },
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Upload failed');
        return;
      }

      const data = await res.json();
      items[idx].attachmentUrl = data.url;
      items[idx].attachmentPublicId = data.publicId;
      items[idx].attachmentName = data.originalName;
      renderItems();
    } catch (err) {
      console.error('Error uploading receipt:', err);
      alert('Failed to upload receipt');
    }
  }

  async function saveItems() {
    try {
      const res = await fetch(`${API_BASE}/api/reimbursements/${requestId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token
        },
        body: JSON.stringify({ items })
      });

      if (res.ok) {
        const updated = await res.json();
        requestData = updated;
        items = updated.items || [];
        renderItems();
        showToast('Saved successfully');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save');
      }
    } catch (err) {
      console.error('Error saving items:', err);
      alert('Failed to save');
    }
  }

  async function submitRequest() {
    if (items.length === 0) {
      alert('Please add at least one item before submitting.');
      return;
    }
    if (!confirm('Submit this reimbursement request? You won\'t be able to edit it after submission.')) return;

    try {
      const res = await fetch(`${API_BASE}/api/reimbursements/${requestId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token
        },
        body: JSON.stringify({ items, status: 'submitted' })
      });

      if (res.ok) {
        const updated = await res.json();
        requestData = updated;
        items = updated.items || [];
        renderItems();
        loadRequest();
        showToast('Request submitted');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to submit');
      }
    } catch (err) {
      console.error('Error submitting request:', err);
      alert('Failed to submit');
    }
  }

  async function deleteRequest() {
    if (!confirm('Delete this reimbursement request?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/reimbursements/${requestId}`, {
        method: 'DELETE',
        headers: { Authorization: token }
      });

      if (res.ok) {
        if (window.navigate) window.navigate('reimbursements');
        else window.location.href = '/dashboard.html#reimbursements';
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to delete');
      }
    } catch (err) {
      console.error('Error deleting request:', err);
      alert('Failed to delete');
    }
  }

  function updateTotal() {
    const total = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    totalAmountEl.textContent = `$${total.toFixed(2)}`;
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
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

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
})();
