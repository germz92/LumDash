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

// Debounce utility function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Function to lookup nearest airport based on location
async function lookupNearestAirport() {
  const locationEl = document.getElementById('location');
  if (!locationEl || !locationEl.value) return;

  const location = locationEl.value.trim();
  if (location.length < 3) return; // Wait for at least 3 characters

  try {
    console.log('Looking up nearest airport for:', location);
    
    const response = await fetch(`${API_BASE}/api/airport-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': window.token
      },
      body: JSON.stringify({ address: location })
    });

    if (response.ok) {
      const data = await response.json();
      const airportEl = document.getElementById('airport');
      
      if (data.airport && airportEl) {
        const airportText = `${data.airport.code} - ${data.airport.name} (${data.airport.distance} mi)`;
        
        // Update the airport field
        if (airportEl.tagName === 'TEXTAREA') {
          airportEl.value = airportText;
          autoResizeTextarea(airportEl);
        } else {
          airportEl.textContent = airportText;
          airportEl.dataset.value = airportText;
        }
        
        console.log('Updated airport field:', airportText);
      } else if (airportEl) {
        // No airport found - clear the field or show a message
        const noAirportText = 'No nearby airport found';
        
        if (airportEl.tagName === 'TEXTAREA') {
          airportEl.value = noAirportText;
          autoResizeTextarea(airportEl);
        } else {
          airportEl.textContent = noAirportText;
          airportEl.dataset.value = noAirportText;
        }
        
        console.log('No airport found for location:', location);
      }
    }
  } catch (error) {
    console.error('Error looking up airport:', error);
  }
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

// Enhanced linkifyText function that preserves HTML formatting
function linkifyText(text) {
  if (!text) return '';
  
  // Handle markdown-style custom links first: [Custom Name](URL)
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  text = text.replace(markdownLinkRegex, (match, linkText, url) => {
    let href = url.trim();
    
    // Add protocol if missing
    if (!href.match(/^https?:\/\//)) {
      href = 'https://' + href;
    }
    
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #1976d2; text-decoration: underline;" onclick="window.open('${href}', '_blank'); return false;">${linkText}</a>`;
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
    
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #1976d2; text-decoration: underline;" onclick="window.open('${href}', '_blank'); return false;">${url}</a>`;
  });
  
  return text;
}

// Function to convert HTML to plain text for editing
function htmlToPlainText(html) {
  if (!html) return '';
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || '';
}

// TinyMCE editor instance
let summaryEditor = null;

// Load TinyMCE dynamically
function loadTinyMCE() {
  return new Promise((resolve, reject) => {
    if (window.tinymce) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    // Use API key from config file, fallback to no-api-key for development
    const apiKey = window.TINYMCE_API_KEY || 'no-api-key';
    
    // For development/testing, you can temporarily use no-api-key
    // const apiKey = 'no-api-key'; // Uncomment this line for development
    
    script.src = `https://cdn.tiny.cloud/1/${apiKey}/tinymce/6/tinymce.min.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load TinyMCE'));
    document.head.appendChild(script);
  });
}

// Initialize TinyMCE editor
async function initializeTinyMCE(initialContent = '') {
  try {
    await loadTinyMCE();
    
    // Remove any existing editor first
    if (summaryEditor) {
      summaryEditor.remove();
      summaryEditor = null;
    }
    
    // Initialize TinyMCE
    await tinymce.init({
      selector: '#summaryEditor',
      height: 300,
      menubar: false,
      toolbar: 'bold italic | bullist numlist | link unlink | removeformat',
      plugins: 'lists link',
      branding: false,
      content_style: `
        body {
          font-family: 'Roboto', Arial, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #333;
          padding: 10px;
          margin: 0;
        }
        p { margin: 0 0 10px 0; }
        ul, ol { margin: 0 0 10px 20px; padding: 0; }
        li { margin: 0 0 4px 0; }
      `,
      setup: function(editor) {
        editor.on('init', function() {
          console.log('TinyMCE initialized successfully');
          editor.setContent(initialContent);
        });
      }
    });
    
    // Get the editor instance
    summaryEditor = tinymce.get('summaryEditor');
    
    if (summaryEditor) {
      summaryEditor.setContent(initialContent);
      console.log('TinyMCE editor ready with content');
    }
    
  } catch (error) {
    console.error('Error initializing TinyMCE:', error);
    throw error;
  }
}

// Get content from TinyMCE editor
function getTinyMCEContent() {
  if (summaryEditor) {
    return summaryEditor.getContent();
  }
  return '';
}

// Set content in TinyMCE editor
function setTinyMCEContent(content) {
  if (summaryEditor) {
    summaryEditor.setContent(content || '');
  }
}

// Clean up TinyMCE editor
function cleanupTinyMCE() {
  if (summaryEditor) {
    summaryEditor.remove();
    summaryEditor = null;
  }
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

    // Add QR Code button for owners, styled like folder icon, to the right
    const qrBtn = document.createElement('button');
    qrBtn.innerHTML = '<span class="material-symbols-outlined">qr_code</span>';
    qrBtn.className = 'qr-code-btn';
    qrBtn.style = 'margin-bottom: 18px; margin-left: 8px; background: none; color: #888; border: none; border-radius: 8px; padding: 8px; font-size: 17px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;';
    qrBtn.title = 'QR Code';
    qrBtn.onclick = () => {
      showQRCodeModal();
    };
    container.appendChild(qrBtn);
  }
  console.log('Folder logs button added for all users');
}

function showQRCodeModal() {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.id = 'qrCodeModal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    cursor: pointer;
  `;

  // Create QR code container
  const qrContainer = document.createElement('div');
  qrContainer.style.cssText = `
    background: white;
    border-radius: 16px;
    padding: 20px;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  `;

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.style.cssText = `
    position: absolute;
    top: 10px;
    right: 15px;
    background: none;
    border: none;
    font-size: 30px;
    color: #666;
    cursor: pointer;
    padding: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    closeQRCodeModal();
  };

  // Create QR code image
  const qrImage = document.createElement('img');
  qrImage.src = '../assets/qr-code.png'; // QR code that links to https://www.lumtags.com/#/attendee
  qrImage.alt = 'QR Code for LumTags Attendee';
  qrImage.style.cssText = `
    max-width: 100%;
    max-height: 60vh;
    width: auto;
    height: auto;
    border-radius: 8px;
    cursor: pointer;
  `;
  
  // Make QR code clickable to open the link
  qrImage.onclick = (e) => {
    e.stopPropagation();
    window.open('https://www.lumtags.com/#/attendee', '_blank');
  };

  // Create title
  const title = document.createElement('h3');
  title.textContent = 'LumTags Attendee Portal';
  title.style.cssText = `
    margin: 0 0 15px 0;
    color: #333;
    font-size: 24px;
    text-align: center;
  `;

  // Create subtitle with link
  const subtitle = document.createElement('p');
  subtitle.innerHTML = 'Scan QR code or <a href="https://www.lumtags.com/#/attendee" target="_blank" style="color: #CC0007; text-decoration: none; font-weight: bold;">click here</a> to access the attendee portal';
  subtitle.style.cssText = `
    margin: 0 0 20px 0;
    color: #666;
    font-size: 16px;
    text-align: center;
    max-width: 300px;
  `;

  // Create URL display
  const urlDisplay = document.createElement('div');
  urlDisplay.textContent = 'www.lumtags.com/#/attendee';
  urlDisplay.style.cssText = `
    margin: 15px 0 0 0;
    color: #888;
    font-size: 14px;
    text-align: center;
    font-family: monospace;
    background: #f5f5f5;
    padding: 8px 12px;
    border-radius: 4px;
    user-select: all;
  `;

  // Add elements to container
  qrContainer.appendChild(closeBtn);
  qrContainer.appendChild(title);
  qrContainer.appendChild(subtitle);
  qrContainer.appendChild(qrImage);
  qrContainer.appendChild(urlDisplay);

  // Add container to modal
  modal.appendChild(qrContainer);

  // Add modal to document
  document.body.appendChild(modal);

  // Close modal when clicking outside
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeQRCodeModal();
    }
  };

  // Prevent scrolling when modal is open
  document.body.style.overflow = 'hidden';

  // Handle image load error
  qrImage.onerror = () => {
    qrImage.style.display = 'none';
    const errorMsg = document.createElement('p');
    errorMsg.textContent = 'QR code image not found. Please add the LumTags QR code as qr-code.png to the assets folder.';
    errorMsg.style.cssText = `
      color: #666;
      text-align: center;
      margin: 20px;
      font-size: 16px;
    `;
    qrContainer.appendChild(errorMsg);
  };
}

function closeQRCodeModal() {
  const modal = document.getElementById('qrCodeModal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = '';
  }
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

      ['eventSummary', 'location', 'weather', 'attendees', 'airport'].forEach(field => {
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
            // Display rich HTML content with URL linkification
            const summaryContent = general.summary || '';
            if (summaryContent.includes('<') && summaryContent.includes('>')) {
              // Contains HTML tags, treat as rich content
              div.innerHTML = linkifyText(summaryContent);
              div.classList.add('rich-content');
            } else {
              // Plain text, apply basic linkification
              div.innerHTML = linkifyText(summaryContent);
            }
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
        window.setupBottomNavigation(null, tableId, 'general'); // Changed page to general
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
    if (id === 'summary') {
      // Get content from TinyMCE editor if active, otherwise from read-only div
      const summaryEditorContainer = document.getElementById('summaryEditorContainer');
      if (summaryEditorContainer && summaryEditorContainer.style.display !== 'none') {
        // Check if TinyMCE is available
        const content = getTinyMCEContent();
        if (content !== '') {
          console.log('Getting content from TinyMCE for save:', content);
          return content;
        } else {
          // Fallback to textarea if TinyMCE failed
          const fallbackTextarea = document.getElementById('summaryFallback');
          if (fallbackTextarea) {
            console.log('Getting content from fallback textarea for save:', fallbackTextarea.value);
            return fallbackTextarea.value.trim();
          }
        }
      } else {
        // Fall back to the read-only div
        const el = document.getElementById(id);
        return el?.dataset.value || el?.innerHTML || '';
      }
    } else {
      const el = document.getElementById(id);
      return el?.tagName === 'TEXTAREA' ? el.value.trim() : el?.textContent.trim() || '';
    }
  };

  // Create the general data object with the exact schema structure expected by the backend
  const generalData = {
    summary: getText('summary'),
    location: getText('location'),
    weather: getText('weather'),
    attendees: getText('attendees'),
    airport: getText('airport'),
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

  ['eventSummary', 'location', 'weather', 'attendees', 'airport'].forEach(id => {
    const element = document.getElementById(id === 'eventSummary' ? 'summary' : id);
    if (!element) return;
    
    if (id === 'eventSummary') {
      // Handle event summary with TinyMCE editor
      const summaryEditorContainer = document.getElementById('summaryEditorContainer');
      
      if (summaryEditorContainer) {
        // Hide the read-only div and show the editor
        element.style.display = 'none';
        summaryEditorContainer.style.display = 'block';
        
        // Get existing HTML content for editing
        const currentContent = element.dataset.value || element.innerHTML || '';
        
        // Initialize TinyMCE with current content
        initializeTinyMCE(currentContent).then(() => {
          console.log('TinyMCE editor ready with content');
        }).catch(error => {
          console.error('Failed to initialize TinyMCE:', error);
          // Fallback to a simple textarea if TinyMCE fails
          const fallbackTextarea = document.createElement('textarea');
          fallbackTextarea.id = 'summaryFallback';
          fallbackTextarea.value = htmlToPlainText(currentContent);
          fallbackTextarea.style.width = '100%';
          fallbackTextarea.style.minHeight = '200px';
          fallbackTextarea.style.fontFamily = 'inherit';
          fallbackTextarea.style.fontSize = '14px';
          fallbackTextarea.style.padding = '10px';
          fallbackTextarea.style.border = '1px solid #ccc';
          fallbackTextarea.style.borderRadius = '4px';
          summaryEditorContainer.appendChild(fallbackTextarea);
        });
        
      } else {
        console.error('summaryEditorContainer element not found');
      }
    } else {
      // Handle other fields with regular textareas
      if (element.tagName === 'TEXTAREA') {
        console.log(`[GENERAL] ${id} is already a textarea, preserving value:`, element.value);
        return; // Already in edit mode, don't change anything
      }
      
      console.log(`[GENERAL] Converting ${id} from div to textarea`);
      // Convert div to textarea
      const textarea = document.createElement('textarea');
      textarea.id = id;
      textarea.value = element.dataset.value || element.textContent || '';
      element.replaceWith(textarea);
      autoResizeTextarea(textarea);
      
      // Add input handler for weather field to update icon
      if (id === 'weather') {
        textarea.addEventListener('input', updateWeatherIcon);
      }
      
      // Add input handler for location field to lookup nearest airport
      if (id === 'location') {
        textarea.addEventListener('input', debounce(lookupNearestAirport, 1000));
      }
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
  // Check if we're already in edit mode by looking for TinyMCE editor or textareas
  const summaryEditorContainer = document.getElementById('summaryEditorContainer');
  const isAlreadyInEditMode = summaryEditorContainer && summaryEditorContainer.style.display !== 'none';
  
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
  // Check if we're already in edit mode by looking for TinyMCE editor or textareas
  const summaryEditorContainer = document.getElementById('summaryEditorContainer');
  const isAlreadyInEditMode = summaryEditorContainer && summaryEditorContainer.style.display !== 'none';
  
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

// Cleanup function for when leaving the page
window.addEventListener('beforeunload', function() {
  cleanupTinyMCE();
});
window.addContactRow = addContactRow;
window.addLocationRow = addLocationRow;
window.saveGeneralInfo = saveGeneralInfo;
window.switchToEdit = switchToEdit;
window.insertMarkdown = insertMarkdown;
window.updateMarkdownPreview = updateMarkdownPreview;

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
