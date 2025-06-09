(function() {
// ✅ Avoid redeclaration across scripts
window.token = window.token || localStorage.getItem('token');
const params = new URLSearchParams(window.location.search);
let tableId = params.get('id') || localStorage.getItem('eventId');
let isOwner = false;

// Socket.IO real-time updates
if (window.socket) {
  // Listen for general info updates
  window.socket.on('generalChanged', (data) => {
    console.log('General info changed, checking if relevant...');
    // Only reload if it's for the current table
    if (data && data.tableId && data.tableId !== tableId) {
      console.log('Update was for a different table, ignoring');
      return;
    }
    console.log('Reloading general info for current table');
    initPage(tableId);
  });
  
  // Also listen for general table updates
  window.socket.on('tableUpdated', (data) => {
    console.log('Table updated, checking if relevant...');
    // Only reload if it's for the current table
    if (data && data.tableId && data.tableId !== tableId) {
      console.log('Update was for a different table, ignoring');
      return;
    }
    console.log('Reloading general info for current table');
    initPage(tableId);
  });
}

// Function to get appropriate weather icon based on text description
function getWeatherIcon(weatherText) {
  if (!weatherText) return 'cloud'; // Default Material Symbol
  
  const text = weatherText.toLowerCase();
  
  // Check for various weather conditions - return Material Symbol names
  if (text.includes('sunny') || text.includes('clear')) return 'clear_day';
  if (text.includes('partly cloudy') || text.includes('partly sunny')) return 'partly_cloudy_day';
  if (text.includes('cloudy') || text.includes('overcast')) return 'cloudy';
  if (text.includes('rain') || text.includes('shower')) return 'rainy';
  if (text.includes('storm') || text.includes('thunder') || text.includes('lightning')) return 'thunderstorm';
  if (text.includes('snow') || text.includes('flurrie')) return 'weather_snowy';
  if (text.includes('fog') || text.includes('mist')) return 'foggy';
  if (text.includes('wind') || text.includes('breez')) return 'air';
  if (text.includes('hot') || text.includes('heat')) return 'local_fire_department';
  if (text.includes('cold') || text.includes('freez')) return 'ac_unit';
  if (text.includes('tornado') || text.includes('hurricane')) return 'cyclone';
  
  return 'cloud'; // Default Material Symbol
}

// Function to update the weather label icon based on current weather text
function updateWeatherIcon() {
  const weatherLabel = document.querySelector('label[for="weather"]');
  if (!weatherLabel) return;
  
  const weatherEl = document.getElementById('weather');
  const weatherText = weatherEl?.tagName === 'TEXTAREA' 
    ? weatherEl.value.trim() 
    : weatherEl?.textContent.trim() || '';
  
  const iconName = getWeatherIcon(weatherText);
  // Ensure the label starts with the icon span, then text
  weatherLabel.innerHTML = `<span class="material-symbols-outlined">${iconName}</span> Weather`;
}

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
    if (type === 'email') {
      window.location.href = `mailto:${val}`;
    }
    else if (type === 'phone') {
      window.location.href = `tel:${val}`;
    }
    else if (type === 'address') {
      // Use a more iOS-friendly maps URL format
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      
      if (isIOS) {
        // Apple Maps format (iOS)
        window.location.href = `maps://?q=${encodeURIComponent(val)}`;
      } else {
        // Google Maps format (Android, desktop)
        window.open(`https://www.google.com/maps/search/?q=${encodeURIComponent(val)}`, '_blank');
      }
    }
  });
  return textarea;
}

function createLinkHTML(value, type) {
  if (!value) return '<div>(empty)</div>';
  value = value.trim();
  let href = '#';
  
  if (type === 'email') {
    href = `mailto:${value}`;
  } 
  else if (type === 'phone' || type === 'number') {
    href = `tel:${value}`;
  } 
  else if (type === 'address') {
    // Use a more iOS-friendly maps URL format
    // Apple Maps URL scheme for iOS, fallback to Google Maps
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    if (isIOS) {
      // Apple Maps format (iOS)
      href = `maps://?q=${encodeURIComponent(value)}`;
    } else {
      // Google Maps format (Android, desktop)
      href = `https://www.google.com/maps/search/?q=${encodeURIComponent(value)}`;
    }
  }
  else {
    return `<div>${value}</div>`;
  }
  
  return `<a href="${href}" target="_blank" style="color: #1976d2; text-decoration: underline;">${value}</a>`;
}

function linkifyText(text) {
  if (!text) return '';
  
  // First, handle markdown-style custom links: [Custom Name](URL)
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  text = text.replace(markdownLinkRegex, (match, linkText, url) => {
    let href = url.trim();
    
    // Add protocol if missing
    if (!href.match(/^https?:\/\//)) {
      href = 'https://' + href;
    }
    
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #1976d2; text-decoration: underline;">${linkText}</a>`;
  });
  
  // Then handle regular URLs (but skip ones already inside <a> tags from markdown processing)
  const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\/[^\s<]*)?)/g;
  
  // Replace URLs with clickable links, but only if they're not already inside <a> tags
  text = text.replace(urlRegex, (url) => {
    // Check if this URL is already inside an <a> tag
    const beforeUrl = text.substring(0, text.indexOf(url));
    const lastATag = beforeUrl.lastIndexOf('<a ');
    const lastCloseATag = beforeUrl.lastIndexOf('</a>');
    
    // If we're inside an <a> tag, don't linkify
    if (lastATag > lastCloseATag) {
      return url;
    }
    
    let href = url;
    
    // Add protocol if missing
    if (!url.match(/^https?:\/\//)) {
      href = 'https://' + url;
    }
    
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #1976d2; text-decoration: underline;">${url}</a>`;
  });
  
  return text;
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
    btn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
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
    btn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
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

function isAdmin() {
  try {
    const token = window.token;
    if (!token) return false;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

function insertAdminNotesBtn(tableId) {
  const container = document.getElementById('adminNotesBtnContainer');
  if (!container) return;
  container.innerHTML = '';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  
  if (isAdmin() || isOwner) {
    const btn = document.createElement('button');
    btn.textContent = 'Notes';
    btn.className = 'admin-notes-btn';
    btn.style = 'margin-bottom: 18px; background: #CC0007; color: #fff; border: none; border-radius: 8px; padding: 10px 22px; font-weight: 600; font-size: 17px; box-shadow: 0 2px 8px rgba(204,0,7,0.08); cursor: pointer;';
    btn.onclick = () => {
      window.location.href = `/pages/notes.html?id=${tableId}`;
    };
    container.appendChild(btn);
  }
  
  // Add Folder Logs icon button for all users
  const folderBtn = document.createElement('button');
  folderBtn.innerHTML = '<span class="material-symbols-outlined">folder</span>';
  folderBtn.className = 'folder-logs-btn';
  folderBtn.style = 'margin-bottom: 18px; margin-left: 8px; background: none; color: #888; border: none; border-radius: 8px; padding: 8px; font-size: 17px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;';
  folderBtn.title = 'Folder Logs';
  folderBtn.onclick = () => {
    window.location.href = `/folder-logs.html?id=${tableId}`;
  };
  container.appendChild(folderBtn);

  // Add Task icon button for owners, styled like folder icon, to the right
  if (isOwner) {
    const taskBtn = document.createElement('button');
    taskBtn.innerHTML = '<span class="material-symbols-outlined">task_alt</span>';
    taskBtn.className = 'task-logs-btn';
    taskBtn.style = 'margin-bottom: 18px; margin-left: 8px; background: none; color: #888; border: none; border-radius: 8px; padding: 8px; font-size: 17px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;';
    taskBtn.title = 'To-Do List';
    taskBtn.onclick = () => {
      window.location.href = `/pages/tasks.html?id=${tableId}`;
    };
    container.appendChild(taskBtn);
  }
  console.log('Folder logs button added for all users');
}

function initPage(id) {
  // Safeguard: Only run on the general page
  const currentPage = location.hash.replace('#', '') || 'events';
  if (currentPage !== 'general') {
    console.log(`general.js initPage called on wrong page: ${currentPage}, skipping execution`);
    return;
  }
  
  console.log('[GENERAL] initPage called with id:', id);
  
  if (!id || !window.token) return;

  fetch(`${API_BASE}/api/tables/${id}`, {
    headers: { Authorization: window.token }
  })
    .then(res => res.json())
    .then(table => {
      const general = table.general || {};
      const userId = getUserIdFromToken();
      isOwner = Array.isArray(table.owners) && table.owners.includes(userId);

      // Now that isOwner is set, insert the admin/folder/task buttons
      insertAdminNotesBtn(id);

      const eventTitleEl = document.getElementById('eventTitle');
      if (eventTitleEl) eventTitleEl.textContent = table.title;

      ['eventSummary', 'location', 'weather', 'attendees', 'budget'].forEach(field => {
        const el = document.getElementById(field === 'eventSummary' ? 'summary' : field);
        if (el) {
          const div = document.createElement('div');
          div.id = field === 'eventSummary' ? 'summary' : field;
          div.dataset.value = general[field === 'eventSummary' ? 'summary' : field] || '';
          div.className = 'read-only';
          
          // Make location field clickable to open maps
          if (field === 'location') {
            div.innerHTML = createLinkHTML(general.location || '', 'address');
          } else if (field === 'eventSummary') {
            // Make URLs in summary clickable
            div.innerHTML = linkifyText(general.summary || '');
          } else {
            div.textContent = general[field] || '';
          }
          
          el.replaceWith(div);
        }
      });

      // Update weather icon after loading data
      updateWeatherIcon();
      
      // Store original date values for non-owners
      const startDate = general.start?.split('T')[0] || '';
      const endDate = general.end?.split('T')[0] || '';
      
      // Set values for date fields
      document.getElementById('start').value = startDate;
      document.getElementById('end').value = endDate;
      
      // 🔒 Make date fields readonly for non-owners
      if (!isOwner) {
        const startInput = document.getElementById('start');
        const endInput = document.getElementById('end');
        
        // Make inputs readonly
        startInput.setAttribute('readonly', 'readonly');
        endInput.setAttribute('readonly', 'readonly');
        
        // Add visual indicator
        startInput.classList.add('read-only-input');
        endInput.classList.add('read-only-input');
        
        // Prevent changes to the date inputs by adding event listeners
        startInput.addEventListener('change', function(e) {
          e.preventDefault();
          this.value = startDate;
          alert('Not authorized. Only owners can change event dates.');
          return false;
        });
        
        endInput.addEventListener('change', function(e) {
          e.preventDefault();
          this.value = endDate;
          alert('Not authorized. Only owners can change event dates.');
          return false;
        });
        
        // Prevent click events on date inputs
        startInput.addEventListener('mousedown', function(e) {
          if (!isOwner) {
            e.preventDefault();
            alert('Not authorized. Only owners can change event dates.');
            return false;
          }
        });
        
        endInput.addEventListener('mousedown', function(e) {
          if (!isOwner) {
            e.preventDefault();
            alert('Not authorized. Only owners can change event dates.');
            return false;
          }
        });
      }

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
      
      // 🔒 Add a "View Only" indicator for non-owners
      if (!isOwner) {
        const viewOnlyIndicator = document.createElement('div');
        viewOnlyIndicator.textContent = 'View Only';
        viewOnlyIndicator.className = 'view-only-indicator';
        viewOnlyIndicator.style.position = 'absolute';
        viewOnlyIndicator.style.top = '20px';
        viewOnlyIndicator.style.right = '20px';
        viewOnlyIndicator.style.backgroundColor = '#f0f0f0';
        viewOnlyIndicator.style.color = '#666';
        viewOnlyIndicator.style.padding = '6px 12px';
        viewOnlyIndicator.style.borderRadius = '4px';
        viewOnlyIndicator.style.fontSize = '14px';
        viewOnlyIndicator.style.fontWeight = 'bold';
        document.querySelector('.container').style.position = 'relative';
        document.querySelector('.container').appendChild(viewOnlyIndicator);
      }
      
      // Set up navigation using the centralized function from app.js
      if (window.setupBottomNavigation) {
        window.setupBottomNavigation(navContainer, tableId, 'general'); // Changed page to general
      }
    })
    .catch(err => console.error('Error loading event:', err));
}

async function saveGeneralInfo() {
  // 🔒 Check if user is owner before proceeding
  if (!isOwner) {
    return alert("Not authorized. Only owners can edit event information.");
  }

  const getText = id => {
    const el = document.getElementById(id);
    return el?.tagName === 'TEXTAREA' ? el.value.trim() : el?.textContent.trim() || '';
  };

  // Create the general data object with the exact schema structure expected by the backend
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

  // Update the weather icon before saving
  updateWeatherIcon();

  console.log('Saving general data:', generalData);

  try {
    // Get the current table ID directly from the URL or localStorage
    const currentTableId = params.get('id') || localStorage.getItem('eventId');
    
    if (!currentTableId) {
      throw new Error('No table ID found. Cannot save data.');
    }
    
    console.log('Saving to table ID:', currentTableId);
    
    // Key difference: Wrap the generalData in a "general" property to match the backend API expectation
    const res = await fetch(`${API_BASE}/api/tables/${currentTableId}/general`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': window.token
      },
      // This is the key fix - the server.js API expects a body with a "general" property
      body: JSON.stringify({ general: generalData })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Server error response:', errorText);
      throw new Error(errorText || 'Server returned an error');
    }
    
    console.log('Save successful!');
    window.location.reload();
  } catch (err) {
    console.error('Save error:', err);
    alert("Failed to save: " + (err.message || "Unknown error occurred"));
  }
}

function switchToEdit() {
  if (!isOwner) return;

  console.log('[GENERAL] switchToEdit called');

  ['eventSummary', 'location', 'weather', 'attendees', 'budget'].forEach(id => {
    const element = document.getElementById(id === 'eventSummary' ? 'summary' : id);
    if (!element) return;
    
    // If it's already a textarea, preserve its current value
    if (element.tagName === 'TEXTAREA') {
      console.log(`[GENERAL] ${id} is already a textarea, preserving value:`, element.value);
      return; // Already in edit mode, don't change anything
    }
    
    console.log(`[GENERAL] Converting ${id} from div to textarea`);
    // Convert div to textarea
    const textarea = document.createElement('textarea');
    textarea.id = id === 'eventSummary' ? 'summary' : id;
    textarea.value = element.dataset.value || element.textContent || '';
    element.replaceWith(textarea);
    autoResizeTextarea(textarea);
    
    // Add input handler for weather field to update icon
    if (id === 'weather') {
      textarea.addEventListener('input', updateWeatherIcon);
    }
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
  // Check if we're already in edit mode by looking for textareas
  const summaryEl = document.getElementById('summary');
  const isAlreadyInEditMode = summaryEl && summaryEl.tagName === 'TEXTAREA';
  
  console.log('[GENERAL] addContactRow called, already in edit mode:', isAlreadyInEditMode);
  
  if (!isAlreadyInEditMode) {
    console.log('[GENERAL] Switching to edit mode before adding contact row');
    switchToEdit();
  } else {
    console.log('[GENERAL] Already in edit mode, preserving existing data');
  }
  renderContactRow({}, false);
}

function addLocationRow() {
  // Check if we're already in edit mode by looking for textareas
  const summaryEl = document.getElementById('summary');
  const isAlreadyInEditMode = summaryEl && summaryEl.tagName === 'TEXTAREA';
  
  console.log('[GENERAL] addLocationRow called, already in edit mode:', isAlreadyInEditMode);
  
  if (!isAlreadyInEditMode) {
    console.log('[GENERAL] Switching to edit mode before adding location row');
    switchToEdit();
  } else {
    console.log('[GENERAL] Already in edit mode, preserving existing data');
  }
  renderLocationRow({}, false);
}

// ✅ Ensure it's globally accessible for SPA router
window.initPage = initPage;
window.addContactRow = addContactRow;
window.addLocationRow = addLocationRow;
window.saveGeneralInfo = saveGeneralInfo;
window.switchToEdit = switchToEdit;

// CLOCK ICON LOGIC
(function() {
  const clockBtn = document.getElementById('clockIconBtn');
  const clockPopup = document.getElementById('clockPopup');
  let clockInterval = null;

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function showClock() {
    clockPopup.style.display = 'block';
    clockPopup.textContent = formatTime(new Date());
    clockInterval = setInterval(() => {
      clockPopup.textContent = formatTime(new Date());
    }, 1000);
  }

  function hideClock() {
    clockPopup.style.display = 'none';
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = null;
  }

  if (clockBtn && clockPopup) {
    let isVisible = false;
    clockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isVisible = !isVisible;
      if (isVisible) {
        showClock();
      } else {
        hideClock();
      }
    });
    // Hide popup when clicking outside
    document.addEventListener('click', (e) => {
      if (isVisible && !clockPopup.contains(e.target) && e.target !== clockBtn) {
        hideClock();
        isVisible = false;
      }
    });
  }
})();
})();
