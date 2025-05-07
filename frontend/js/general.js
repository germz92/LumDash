(function() {
// ✅ Avoid redeclaration across scripts
window.token = window.token || localStorage.getItem('token');
const params = new URLSearchParams(window.location.search);
let tableId = params.get('id') || localStorage.getItem('eventId');
let isOwner = false;

function getUserIdFromToken() {
  try {
    const token = window.token;
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id;
  } catch {
    return null;
  }
}

function createLinkedTextarea(value, type) {
  const textarea = document.createElement('textarea');
  textarea.value = value || '';
  textarea.placeholder = type.charAt(0).toUpperCase() + type.slice(1);
  textarea.addEventListener('input', () => autoResizeTextarea(textarea));
  autoResizeTextarea(textarea);
  textarea.addEventListener('dblclick', () => {
    const val = textarea.value.trim();
    if (!val) return;
    if (type === 'email') window.location.href = `mailto:${val}`;
    else if (type === 'phone') window.location.href = `tel:${val}`;
    else if (type === 'address') window.open(`https://www.google.com/maps/search/?q=${encodeURIComponent(val)}`, '_blank');
  });
  return textarea;
}

function createLinkHTML(value, type) {
  if (!value) return '<div>(empty)</div>';
  value = value.trim();
  let href = '#';
  if (type === 'email') href = `mailto:${value}`;
  else if (type === 'phone' || type === 'number') href = `tel:${value}`;
  else if (type === 'address') href = `https://www.google.com/maps/search/?q=${encodeURIComponent(value)}`;
  else return `<div>${value}</div>`;
  return `<a href="${href}" target="_blank" style="color: #1976d2; text-decoration: underline;">${value}</a>`;
}

function renderContactRow(data = {}, readOnly = false) {
  const tbody = document.getElementById('contactRows');
  const row = document.createElement('tr');
  const fields = ['name', 'number', 'email', 'role'];

  fields.forEach(type => {
    const td = document.createElement('td');
    if (readOnly) td.innerHTML = createLinkHTML(data[type], type);
    else td.appendChild(createLinkedTextarea(data[type], type));
    row.appendChild(td);
  });

  const deleteTd = document.createElement('td');
  if (!readOnly) {
    const btn = document.createElement('button');
    btn.textContent = '❌';
    btn.onclick = () => row.remove();
    deleteTd.appendChild(btn);
  }
  row.appendChild(deleteTd);
  tbody.appendChild(row);
}

function renderLocationRow(data = {}, readOnly = false) {
  const tbody = document.getElementById('locationsRows');
  const row = document.createElement('tr');
  const fields = ['name', 'address', 'event'];

  fields.forEach(type => {
    const td = document.createElement('td');
    if (readOnly) td.innerHTML = createLinkHTML(data[type], type);
    else td.appendChild(createLinkedTextarea(data[type], type));
    row.appendChild(td);
  });

  const deleteTd = document.createElement('td');
  if (!readOnly) {
    const btn = document.createElement('button');
    btn.textContent = '❌';
    btn.onclick = () => row.remove();
    deleteTd.appendChild(btn);
  }
  row.appendChild(deleteTd);
  tbody.appendChild(row);
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

document.addEventListener('input', e => {
  if (e.target.tagName.toLowerCase() === 'textarea') autoResizeTextarea(e.target);
});

function collectContacts() {
  return [...document.querySelectorAll("#contactRows tr")].map(row => {
    const inputs = row.querySelectorAll("textarea");
    if (inputs.length) {
    return {
      name: inputs[0]?.value.trim(),
      number: inputs[1]?.value.trim(),
      email: inputs[2]?.value.trim(),
      role: inputs[3]?.value.trim()
    };
    } else {
      // Fallback to text content in view mode
      const cells = row.querySelectorAll("td");
      return {
        name: cells[0]?.textContent.trim(),
        number: cells[1]?.textContent.trim(),
        email: cells[2]?.textContent.trim(),
        role: cells[3]?.textContent.trim()
      };
    }
  });
}

function collectLocations() {
  return [...document.querySelectorAll("#locationsRows tr")].map(row => {
    const inputs = row.querySelectorAll("textarea");
    if (inputs.length) {
    return {
      name: inputs[0]?.value.trim(),
      address: inputs[1]?.value.trim(),
      event: inputs[2]?.value.trim()
    };
    } else {
      // Fallback to text content in view mode
      const cells = row.querySelectorAll("td");
      return {
        name: cells[0]?.textContent.trim(),
        address: cells[1]?.textContent.trim(),
        event: cells[2]?.textContent.trim()
      };
    }
  });
}

async function saveGeneralInfo() {
  if (!isOwner) return alert("You are not allowed to edit this page.");

  const getText = id => {
    const el = document.getElementById(id);
    return el?.tagName === 'TEXTAREA' ? el.value.trim() : el?.textContent.trim() || '';
  };

  const generalData = {
    summary: getText('summary'),
    location: getText('location'),
    weather: getText('weather'),
    attendees: getText('attendees'),
    budget: getText('budget'),
    start: document.getElementById('start')?.value || '',
    end: document.getElementById('end')?.value || '',
    contacts: collectContacts(),
    locations: collectLocations()
  };

  console.log('Saving general data:', generalData);
  console.log('Summary element:', document.getElementById('summary'));
  console.log('Summary element value:', getText('summary'));

  try {
    const res = await fetch(`${API_BASE}/api/tables/${tableId}/general`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: window.token
      },
      body: JSON.stringify(generalData)
    });

    if (!res.ok) throw new Error(await res.text());
    alert("Saved successfully!");
    location.reload();
  } catch (err) {
    console.error(err);
    alert("Failed to save.");
  }
}

function switchToEdit() {
  if (!isOwner) return;

  ['eventSummary', 'location', 'weather', 'attendees', 'budget'].forEach(id => {
    const div = document.getElementById(id === 'eventSummary' ? 'summary' : id);
    if (!div) return;
    const textarea = document.createElement('textarea');
    textarea.id = id === 'eventSummary' ? 'summary' : id;
    textarea.value = div.dataset.value || div.textContent || '';
    div.replaceWith(textarea);
    autoResizeTextarea(textarea);
  });

  const contactData = collectContacts();
  document.getElementById('contactRows').innerHTML = '';
  contactData.forEach(data => renderContactRow(data, false));

  const locationData = collectLocations();
  document.getElementById('locationsRows').innerHTML = '';
  locationData.forEach(data => renderLocationRow(data, false));

  document.querySelectorAll('.add-row-btn').forEach(btn => {
    btn.style.display = 'inline-block';
  });

  const editBtn = document.getElementById('editBtn');
  if (editBtn) editBtn.style.display = 'none';

  // Auto-resize all textareas after rendering
  document.querySelectorAll('textarea').forEach(autoResizeTextarea);
}

function addContactRow() {
  switchToEdit();
  renderContactRow({}, false);
}

function addLocationRow() {
  switchToEdit();
  renderLocationRow({}, false);
}

function initPage(id) {
  if (!id || !window.token) return;

  fetch(`${API_BASE}/api/tables/${id}`, {
    headers: { Authorization: window.token }
  })
    .then(res => res.json())
    .then(table => {
      const general = table.general || {};
      const userId = getUserIdFromToken();
      isOwner = Array.isArray(table.owners) && table.owners.includes(userId);

      const eventTitleEl = document.getElementById('eventTitle');
      if (eventTitleEl) eventTitleEl.textContent = table.title;

      ['eventSummary', 'location', 'weather', 'attendees', 'budget'].forEach(field => {
        const el = document.getElementById(field === 'eventSummary' ? 'summary' : field);
        if (el) {
          const div = document.createElement('div');
          div.id = field === 'eventSummary' ? 'summary' : field;
          div.dataset.value = general[field === 'eventSummary' ? 'summary' : field] || '';
          div.className = 'read-only';
          div.textContent = general[field === 'eventSummary' ? 'summary' : field] || '';
          el.replaceWith(div);
        }
      });

      document.getElementById('start').value = general.start?.split('T')[0] || '';
      document.getElementById('end').value = general.end?.split('T')[0] || '';

      const contactRows = document.getElementById('contactRows');
      contactRows.innerHTML = '';
      (general.contacts || []).forEach(data => renderContactRow(data, true));

      const locationRows = document.getElementById('locationsRows');
      locationRows.innerHTML = '';
      (general.locations || []).forEach(data => renderLocationRow(data, true));

      document.getElementById('editBtn').style.display = isOwner ? 'inline-block' : 'none';
      document.querySelectorAll('.add-row-btn').forEach(btn => {
        btn.style.display = isOwner ? 'inline-block' : 'none';
      });
    })
    .catch(err => console.error('Error loading event:', err));
}

// ✅ Ensure it's globally accessible for SPA router
window.initPage = initPage;
window.addContactRow = addContactRow;
window.addLocationRow = addLocationRow;
window.saveGeneralInfo = saveGeneralInfo;
window.switchToEdit = switchToEdit;
})();
