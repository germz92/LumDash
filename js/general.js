(function() {
// ✅ Avoid redeclaration across scripts
window.token = window.token || localStorage.getItem('token');
const params = new URLSearchParams(window.location.search);
let tableId = params.get('id') || localStorage.getItem('eventId');
let isOwner = false;
let summaryQuill = null; // Global Quill instance for the summary editor

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

// Function to dynamically load Quill script
function loadQuillScript() {
  return new Promise((resolve, reject) => {
    // Check if Quill is already loaded
    if (typeof Quill !== 'undefined' && Quill) {
      console.log('Quill already loaded');
      resolve(true);
      return;
    }
    
    // Check if script is already being loaded
    if (document.querySelector('script[src*="quill"]')) {
      console.log('Quill script already in DOM, waiting for load');
      waitForQuill().then(resolve);
      return;
    }
    
    console.log('Loading Quill script dynamically...');
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js';
    script.async = true;
    
    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      console.error('Quill script loading timed out');
      script.remove();
      resolve(false);
    }, 10000); // 10 second timeout
    
    script.onload = () => {
      clearTimeout(timeout);
      console.log('Quill script loaded successfully');
      // Wait a bit for Quill to initialize
      setTimeout(() => {
        if (typeof Quill !== 'undefined' && Quill) {
          resolve(true);
        } else {
          console.error('Quill object not available after script load');
          resolve(false);
        }
      }, 100);
    };
    
    script.onerror = (error) => {
      clearTimeout(timeout);
      console.error('Failed to load Quill script:', error);
      // Remove the failed script element
      script.remove();
      resolve(false);
    };
    
    // Add script to head
    document.head.appendChild(script);
  });
}

// Function to wait for Quill to be available (fallback)
function waitForQuill(maxAttempts = 10, interval = 100) {
  return new Promise((resolve) => {
    let attempts = 0;
    
    const checkQuill = () => {
      attempts++;
      
      if (typeof Quill !== 'undefined' && Quill) {
        console.log('Quill loaded successfully after', attempts, 'attempts');
        resolve(true);
      } else if (attempts >= maxAttempts) {
        console.warn('Quill failed to load after', maxAttempts, 'attempts');
        resolve(false);
      } else {
        setTimeout(checkQuill, interval);
      }
    };
    
    checkQuill();
  });
}

// Function to initialize Quill editor
async function initSummaryEditor(initialContent = '') {
  const editorElement = document.getElementById('summaryEditor');
  if (!editorElement) {
    console.error('summaryEditor element not found');
    return null;
  }
  
  // Load Quill script dynamically
  const quillLoaded = await loadQuillScript();
  
  if (!quillLoaded) {
    console.error('Quill failed to load, falling back to textarea');
    createFallbackTextarea(editorElement, initialContent);
    return null;
  }
  
  try {
    // Clear any existing content (like loading indicator)
    console.log('Clearing editor element content before Quill initialization');
    console.log('Editor element current content:', editorElement.innerHTML);
    editorElement.innerHTML = '';
    console.log('Editor element cleared, new content:', editorElement.innerHTML);
    
    // Configure Quill with the formatting options we want
    console.log('Creating Quill instance...');
    const quill = new Quill(editorElement, {
      theme: 'snow',
      placeholder: 'Enter event summary with rich formatting...',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
          ['link'],
          ['clean']
        ]
      }
    });
    console.log('Quill instance created, editor element content:', editorElement.innerHTML);
    
    // Set initial content
    if (initialContent) {
      quill.clipboard.dangerouslyPasteHTML(initialContent);
    }
    
    // Wait for Quill to fully render
    await new Promise(resolve => {
      setTimeout(() => {
        // Force a refresh of the editor display
        quill.update();
        console.log('Quill editor display updated');
        console.log('Final editor element content:', editorElement.innerHTML);
        
        // Double-check that Quill has taken over
        const hasQuillContent = editorElement.querySelector('.ql-toolbar') || editorElement.querySelector('.ql-container');
        if (!hasQuillContent) {
          console.warn('Quill may not have properly initialized - no Quill elements found');
        } else {
          console.log('Quill has properly taken over the editor element');
        }
        
        resolve();
      }, 200);
    });
    
    console.log('Quill editor initialized successfully');
    return quill;
  } catch (error) {
    console.error('Error initializing Quill editor:', error);
    // Fallback to textarea if Quill initialization fails
    createFallbackTextarea(editorElement, initialContent);
    return null;
  }
}

// Fallback function to create a textarea if Quill fails
function createFallbackTextarea(editorElement, initialContent) {
  // Hide the Quill editor container
  editorElement.style.display = 'none';
  
  // Check if fallback textarea already exists
  const existingFallback = document.getElementById('summaryFallback');
  if (existingFallback) {
    console.log('Fallback textarea already exists');
    return;
  }
  
  // Create a textarea as fallback
  const textarea = document.createElement('textarea');
  textarea.id = 'summaryFallback';
  textarea.value = htmlToPlainText(initialContent) || '';
  textarea.placeholder = 'Enter event summary...';
  textarea.className = 'fallback-textarea';
  
  // Insert after the editor element
  editorElement.parentNode.insertBefore(textarea, editorElement.nextSibling);
  
  // Auto-resize the textarea
  autoResizeTextarea(textarea);
  textarea.addEventListener('input', () => autoResizeTextarea(textarea));
  
  console.log('Fallback textarea created successfully');
}

// Function to clean up Quill editor
function destroySummaryEditor() {
  if (summaryQuill) {
    summaryQuill = null;
  }
  
  // Also clean up fallback textarea if it exists
  const fallbackTextarea = document.getElementById('summaryFallback');
  if (fallbackTextarea) {
    fallbackTextarea.remove();
  }
  
  // Also clean up by class name in case ID wasn't set
  const fallbackTextareaByClass = document.querySelector('.fallback-textarea');
  if (fallbackTextareaByClass) {
    fallbackTextareaByClass.remove();
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
  
  // Preload Quill script in the background for better UX
  console.log('Preloading Quill script...');
  loadQuillScript().then(success => {
    if (success) {
      console.log('Quill preloaded successfully');
    } else {
      console.log('Quill preload failed, will fallback to textarea when needed');
    }
  }).catch(error => {
    console.log('Error preloading Quill:', error);
  });

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
      // Get content from Quill editor if active, otherwise check fallback textarea or read-only div
      if (summaryQuill) {
        return summaryQuill.root.innerHTML.trim();
      } else {
        // Check for fallback textarea first
        const fallbackTextarea = document.getElementById('summaryFallback') || document.querySelector('.fallback-textarea');
        if (fallbackTextarea) {
          return fallbackTextarea.value.trim();
        } else {
          // Fall back to the read-only div
          const el = document.getElementById(id);
          return el?.dataset.value || el?.innerHTML || '';
        }
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
    // Clean up Quill editor before reload
    destroySummaryEditor();
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
    
    if (id === 'eventSummary') {
      // Handle event summary with rich text editor
      const summaryEditor = document.getElementById('summaryEditor');
      if (summaryEditor) {
        // Hide the read-only div and show the editor
        element.style.display = 'none';
        summaryEditor.style.display = 'block';
        
        // Initialize Quill editor if not already initialized
        if (!summaryQuill) {
          const currentContent = element.dataset.value || element.innerHTML || '';
          console.log('Initializing Quill editor with content:', currentContent);
          
          // Show loading indicator
          summaryEditor.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;"><div style="margin-bottom: 10px;">Loading rich text editor...</div><div style="font-size: 12px; color: #999;">This may take a moment on first load</div></div>';
          
          // Initialize Quill editor asynchronously
          (async () => {
            try {
              summaryQuill = await initSummaryEditor(currentContent);
              
              // If Quill initialization failed, we might have a fallback textarea
              if (!summaryQuill) {
                console.log('Quill initialization failed, checking for fallback textarea');
                const fallbackTextarea = document.getElementById('summaryFallback') || document.querySelector('.fallback-textarea');
                if (fallbackTextarea) {
                  console.log('Found fallback textarea, editor is ready');
                  // Hide the loading indicator since we have a fallback
                  summaryEditor.style.display = 'none';
                } else {
                  console.error('No fallback textarea found, summary editing may not work');
                  // Show error message instead of loading indicator
                  summaryEditor.innerHTML = '<div style="padding: 20px; text-align: center; color: #cc0007;">Failed to load editor. Please refresh the page.</div>';
                }
              } else {
                console.log('Quill editor is now ready for use');
              }
            } catch (error) {
              console.error('Error during Quill initialization:', error);
              // Show error message instead of loading indicator
              summaryEditor.innerHTML = '<div style="padding: 20px; text-align: center; color: #cc0007;">Failed to load editor. Please refresh the page.</div>';
            }
          })();
        }
      } else {
        console.error('summaryEditor element not found');
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
  // Check if we're already in edit mode by looking for Quill editor, fallback textarea, or textareas
  const summaryEditor = document.getElementById('summaryEditor');
  const fallbackTextarea = document.getElementById('summaryFallback') || document.querySelector('.fallback-textarea');
  const isAlreadyInEditMode = summaryQuill || (summaryEditor && summaryEditor.style.display !== 'none') || fallbackTextarea;
  
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
  // Check if we're already in edit mode by looking for Quill editor, fallback textarea, or textareas
  const summaryEditor = document.getElementById('summaryEditor');
  const fallbackTextarea = document.getElementById('summaryFallback') || document.querySelector('.fallback-textarea');
  const isAlreadyInEditMode = summaryQuill || (summaryEditor && summaryEditor.style.display !== 'none') || fallbackTextarea;
  
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

// Clean up Quill editor when leaving the page
window.addEventListener('beforeunload', destroySummaryEditor);

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
