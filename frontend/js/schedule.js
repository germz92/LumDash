(function() {
// Guard to prevent multiple initializations
if (window.__scheduleJsLoaded) {
  console.log('Schedule.js already loaded, skipping initialization');
  return;
}
window.__scheduleJsLoaded = true;

let tableData = { programs: [] };
let saveTimeout;
let searchQuery = '';
let filterDate = 'all';
let allNotesVisible = false;
let isOwner = false;

// Store the intended event ID at module level to prevent external interference
let currentEventId = null;

// Add logging utility for event ID tracking
function logEventIdState(location) {
  const timestamp = new Date().toISOString();
  const stored = localStorage.getItem('eventId');
  const module = currentEventId;
  console.log(`[${timestamp}] EVENT_ID_TRACE [${location}]: module=${module}, localStorage=${stored}, match=${module === stored}`);
  return { timestamp, stored, module, match: module === stored };
}

// Add a localStorage monitor to detect external changes
let lastKnownEventId = null;
function startEventIdMonitoring() {
  if (window.eventIdMonitorInterval) {
    clearInterval(window.eventIdMonitorInterval);
  }
  lastKnownEventId = localStorage.getItem('eventId');
  console.log(`[MONITOR] Starting event ID monitoring. Initial value: ${lastKnownEventId}`);
  
  window.eventIdMonitorInterval = setInterval(() => {
    const current = localStorage.getItem('eventId');
    if (current !== lastKnownEventId) {
      const timestamp = new Date().toISOString();
      console.warn(`[${timestamp}] EVENT_ID_MONITOR: External change detected! Old: ${lastKnownEventId}, New: ${current}`);
      console.trace('Event ID changed by external code');
      lastKnownEventId = current;
    }
  }, 100); // Check every 100ms
}

function stopEventIdMonitoring() {
  if (window.eventIdMonitorInterval) {
    clearInterval(window.eventIdMonitorInterval);
    window.eventIdMonitorInterval = null;
    console.log(`[MONITOR] Stopped event ID monitoring`);
  }
}

// Add a global variable to track if scroll position should be restored
let pendingScrollRestore = null;

// Function to get the scrolling container element 
function getScrollContainer() {
  // Look for the page-container element which is the scrollable container in the SPA
  const container = document.getElementById('page-container');
  return container || window; // Fallback to window if container not found
}

// Store filter settings in sessionStorage
function saveFilterSettings() {
  // Use the module-level currentEventId first, then fall back to localStorage
  const tableId = currentEventId || localStorage.getItem('eventId');
  if (!tableId) {
    console.warn('No event ID available for saving filter settings');
    return;
  }
  
  // Get current scroll position from the container instead of window
  const scrollContainer = getScrollContainer();
  const currentScrollY = scrollContainer === window ? 
    (window.scrollY || window.pageYOffset || document.documentElement.scrollTop) : 
    scrollContainer.scrollTop;
  
  const settings = {
    filterDate,
    scrollPosition: currentScrollY,
    searchQuery
  };
  
  console.log(`Saving settings with scroll position: ${currentScrollY} for container: ${scrollContainer.id || 'window'}`);
  sessionStorage.setItem(`schedule_${tableId}_settings`, JSON.stringify(settings));
}

// Create a debounced scroll handler with proper reference for removal
function createScrollListener() {
  let timeout;
  
  const scrollHandler = function() {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      // Get current scroll position directly at time of saving
      const scrollContainer = getScrollContainer();
      const currentScrollY = scrollContainer === window ? 
        (window.scrollY || window.pageYOffset || document.documentElement.scrollTop) : 
        scrollContainer.scrollTop;
        
      console.log(`Detected scroll position: ${currentScrollY} for container: ${scrollContainer.id || 'window'}`);
      
      // Only save if we've scrolled a meaningful amount
      if (currentScrollY > 10) {
        saveFilterSettings();
      }
    }, 200);
  };
  
  // Add event listener to the correct scrolling container
  const scrollContainer = getScrollContainer();
  scrollContainer.addEventListener('scroll', scrollHandler);
  console.log(`Added scroll event listener to ${scrollContainer.id || 'window'}`);
  
  return {
    handler: scrollHandler,
    container: scrollContainer
  };
}

// Restore filter settings from sessionStorage
function restoreFilterSettings() {
  // Use the module-level currentEventId first, then fall back to localStorage
  const tableId = currentEventId || localStorage.getItem('eventId');
  if (!tableId) {
    console.warn('No event ID available for restoring filter settings');
    return;
  }
  
  const settingsJson = sessionStorage.getItem(`schedule_${tableId}_settings`);
  if (!settingsJson) {
    console.log(`No saved settings found for event ${tableId}`);
    return;
  }
  
  try {
    const settings = JSON.parse(settingsJson);
    console.log('Restoring filter settings:', settings);
    
    // Restore filter date (will be applied when dropdown is populated)
    if (settings.filterDate) {
      filterDate = settings.filterDate;
      console.log(`Restored filter date: ${filterDate}`);
    }
    
    // Restore search query
    if (settings.searchQuery) {
      searchQuery = settings.searchQuery;
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = searchQuery;
      console.log(`Restored search query: ${searchQuery}`);
    }
    
    // Store the scroll position to be applied after rendering
    if (settings.scrollPosition) {
      pendingScrollRestore = settings.scrollPosition;
      console.log(`Saved scroll position ${settings.scrollPosition} for restoration after rendering`);
    }
  } catch (err) {
    console.error('Error restoring filter settings:', err);
  }
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatTo12Hour(time) {
  if (!time) return '';
  const [hour, minute] = time.split(':').map(Number);
  const h = hour % 12 || 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${h.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

window.initPage = async function(id) {
  console.log(`\n=== SCHEDULE INITPAGE START ===`);
  const startTime = Date.now();
  
  // CRITICAL FIX: Only use the explicit id parameter passed from navigation
  // Don't fall back to getTableId() which could return stale data
  const tableId = id;
  if (!tableId) {
    console.error('Event ID missing in schedule initPage - id parameter required.');
    alert('Event ID missing.');
    return;
  }
  
  console.log(`[INIT] Called with explicit tableId: ${tableId}`);
  logEventIdState('INIT_START');
  
  // Store the intended event ID at module level to prevent external interference
  // Make this assignment more defensive
  currentEventId = tableId;
  console.log(`[INIT] Set module currentEventId to: ${currentEventId}`);
  
  // CRITICAL: Trust the navigation system to have already set the correct eventId
  // Don't override localStorage here as it could persist wrong event IDs
  const previousEventId = localStorage.getItem('eventId');
  const isEventChange = previousEventId && previousEventId !== tableId;
  
  console.log(`[INIT] Previous event ID: ${previousEventId}, isEventChange: ${isEventChange}`);
  
  // CRITICAL FIX: Don't override localStorage - trust the navigation system
  // localStorage.setItem('eventId', tableId); // REMOVED - causes wrong event persistence
  console.log(`[INIT] Using localStorage eventId set by navigation system: ${previousEventId}`);
  logEventIdState('AFTER_NAVIGATION_TRUST');

  // Start monitoring for external changes (but don't defensively overwrite)
  startEventIdMonitoring();

  // Add schedule-page class to body
  document.body.classList.add('schedule-page');
  logEventIdState('AFTER_BODY_CLASS');

  // Load event title
  console.log(`[INIT] Starting event title fetch...`);
  try {
    const res = await fetch(`${API_BASE}/api/tables/${tableId}`, {
      headers: { Authorization: localStorage.getItem('token') }
    });
    const table = await res.json();
    const eventTitleEl = document.getElementById('eventTitle');
    if (eventTitleEl) eventTitleEl.textContent = table.title || 'Program Schedule';
    console.log(`[INIT] Event title loaded successfully`);
    logEventIdState('AFTER_EVENT_TITLE_FETCH');
  } catch (err) {
    console.error('Error loading event title:', err);
    const eventTitleEl = document.getElementById('eventTitle');
    if (eventTitleEl) eventTitleEl.textContent = 'Event Not Found';
    logEventIdState('AFTER_EVENT_TITLE_ERROR');
  }

  // Load bottom nav HTML
  console.log(`[INIT] Starting bottom nav setup...`);
  try {
    let navContainer = document.getElementById('bottomNav');
    if (!navContainer) {
      navContainer = document.createElement('nav');
      navContainer.className = 'bottom-nav';
      navContainer.id = 'bottomNav';
      document.body.appendChild(navContainer);
    }
    logEventIdState('AFTER_NAV_CONTAINER_SETUP');
    
    console.log(`[INIT] Fetching ../bottom-nav.html...`);
    const navRes = await fetch('../bottom-nav.html');
    const navHTML = await navRes.text();
    logEventIdState('AFTER_NAV_HTML_FETCH');
    
    // Extract just the nav content (without the outer nav tag)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = navHTML;
    const navContent = tempDiv.querySelector('nav').innerHTML;
    navContainer.innerHTML = navContent;
    logEventIdState('AFTER_NAV_HTML_SET');
    
    // Set up navigation using the centralized function from app.js
    // IMPORTANT: Pass the current tableId to ensure navigation stays within this event
    console.log(`[INIT] About to call setupBottomNavigation with event: ${tableId}`);
    logEventIdState('BEFORE_SETUP_BOTTOM_NAV');
    
    if (window.setupBottomNavigation) {
      console.log(`[INIT] Calling setupBottomNavigation(navContainer, ${tableId}, 'schedule')`);
      window.setupBottomNavigation(navContainer, tableId, 'schedule');
      console.log(`[INIT] setupBottomNavigation completed`);
      logEventIdState('AFTER_SETUP_BOTTOM_NAV');
    } else {
      console.warn(`[INIT] window.setupBottomNavigation not available`);
    }
    
    if (window.lucide) {
      console.log(`[INIT] Creating lucide icons...`);
      lucide.createIcons();
      logEventIdState('AFTER_LUCIDE_ICONS');
    }
  } catch (err) {
    console.error('Failed to load bottom nav:', err);
    logEventIdState('AFTER_NAV_ERROR');
  }

  // Setup event listeners for schedule page controls
  console.log(`[INIT] Setting up event listeners...`);
  const newDateInput = document.getElementById('newDate');
  const addDateBtn = document.querySelector('button.add-btn');
  if (addDateBtn) addDateBtn.onclick = () => addDateSection();

  // Add event listener for date filter
  const filterDropdown = document.getElementById('filterDateDropdown');
  if (filterDropdown) {
    filterDropdown.addEventListener('change', function(e) {
      filterDate = e.target.value;
      renderProgramSections(isOwner); // Use the correct access
      saveFilterSettings(); // Save filter selection
    });
  }
  
  // Set up the import button and file input
  const importBtn = document.getElementById('importBtn');
  const fileInput = document.getElementById('fileImport');
  
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => {
      fileInput.click();
    });
    
    fileInput.addEventListener('change', handleFileImport);
  }
  
  console.log(`[INIT] Event listeners setup complete`);
  logEventIdState('AFTER_EVENT_LISTENERS');

  // Monitor for external changes to eventId during loadPrograms
  console.log(`[INIT] About to call loadPrograms with tableId: ${tableId}...`);
  logEventIdState('BEFORE_LOAD_PROGRAMS');
  
  // Load programs (this sets isOwner/hasScheduleAccess and calls renderProgramSections)
  // Pass the tableId directly to ensure no confusion
  await loadPrograms(tableId);
  
  console.log(`[INIT] loadPrograms completed`);
  logEventIdState('AFTER_LOAD_PROGRAMS');

  // Check for interference after loadPrograms - but only warn, don't override
  const eventIdAfterLoad = localStorage.getItem('eventId');
  
  // Verify that the event ID is still correct after loadPrograms
  if (eventIdAfterLoad !== tableId) {
    console.warn(`[INIT] Event ID changed during loadPrograms! Expected: ${tableId}, Current: ${eventIdAfterLoad}. This indicates interference from external code.`);
    // Only update the module variable, don't force localStorage changes
    currentEventId = tableId;
    logEventIdState('AFTER_DETECTION');
  }

  // Only restore filter settings after loadPrograms, and do not call renderProgramSections in restoreFilterSettings
  if (isEventChange) {
    console.log('[INIT] Event changed, resetting filters and scroll position');
    resetFilterSettings();
  } else {
    console.log('[INIT] Same event, restoring filter settings');
    restoreFilterSettings(); // This should only update filter/search UI, not re-render
  }
  
  logEventIdState('INIT_COMPLETE');
  const endTime = Date.now();
  console.log(`=== SCHEDULE INITPAGE COMPLETE (${endTime - startTime}ms) ===\n`);
  
  // Stop monitoring after a delay to catch any post-init changes
  setTimeout(() => {
    stopEventIdMonitoring();
  }, 2000);
};

async function loadPrograms(tableId = null, retryCount = 0) {
  console.log(`\n--- LOAD PROGRAMS START (retry: ${retryCount}) ---`);
  const loadStartTime = Date.now();
  
  // Prioritize the passed tableId parameter - this is the intended event ID
  // Only fall back to other sources if no explicit tableId is provided
  let eventId;
  if (tableId) {
    eventId = tableId;
    console.log(`[LOAD] Using explicit tableId parameter: ${eventId}`);
  } else {
    eventId = currentEventId || localStorage.getItem('eventId');
    console.log(`[LOAD] No explicit tableId, using fallback: ${eventId}`);
  }
  
  console.log(`[LOAD] Parameters: tableId=${tableId}, currentEventId=${currentEventId}, localStorage=${localStorage.getItem('eventId')}`);
  console.log(`[LOAD] Final eventId decision: ${eventId}`);
  logEventIdState('LOAD_START');
  
  if (!eventId) {
    console.error('[LOAD] No event ID available');
    return;
  }

  // Update the module variable to match what we're actually loading
  currentEventId = eventId;
  console.log(`[LOAD] Updated currentEventId to match what we're loading: ${currentEventId}`);

  const maxRetries = 5;
  const retryDelay = 250;

  try {
    console.log(`[LOAD] Getting user ID from token (attempt ${retryCount + 1}/${maxRetries + 1})...`);
    const userId = await getUserIdFromToken();
    console.log(`[LOAD] User ID obtained: ${userId}`);
    logEventIdState('AFTER_GET_USER_ID');
    
    if (!userId) {
      if (retryCount < maxRetries) {
        console.warn(`[LOAD] No userId available, retrying in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries + 1})`);
        setTimeout(() => {
          loadPrograms(eventId, retryCount + 1);
        }, retryDelay);
        return;
      } else {
        console.error('[LOAD] Failed to get user ID after maximum retries');
        return;
      }
    }

    console.log(`[LOAD] Fetching event data for: ${eventId}...`);
    logEventIdState('BEFORE_EVENT_FETCH');
    
    // Use the original API endpoint that was working
    const response = await fetch(`${API_BASE}/api/tables/${eventId}`, {
      headers: { Authorization: localStorage.getItem('token') }
    });
    
    console.log(`[LOAD] Event fetch response status: ${response.status}`);
    logEventIdState('AFTER_EVENT_FETCH');

    if (!response.ok) {
      throw new Error(`Failed to fetch event data: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[LOAD] Event data received for event: ${eventId}`);
    logEventIdState('AFTER_EVENT_PARSE');

    // Use the original data structure
    tableData.programs = data.programSchedule || [];
    console.log(`[LOAD] Programs loaded for event ${eventId}, count: ${tableData.programs.length}`);
    
    console.log(`[LOAD] Checking access permissions for userId: ${userId}...`);
    // Check permissions using the data we just fetched
    const isOwnerRaw = userId && Array.isArray(data.owners) && data.owners.includes(userId);
    const isLead = userId && Array.isArray(data.leads) && data.leads.includes(userId);
    const hasScheduleAccess = isOwnerRaw || isLead;
    
    console.log(`[LOAD] Access check - isOwner: ${isOwnerRaw}, isLead: ${isLead}, hasAccess: ${hasScheduleAccess}`);
    logEventIdState('AFTER_ACCESS_CHECK');
    
    // Set global variables
    isOwner = hasScheduleAccess;
    
    // Add body class for CSS targeting
    if (hasScheduleAccess) {
      document.body.classList.add('has-owner-controls');
      document.body.classList.remove('no-owner-controls');
      console.log('[LOAD] Added has-owner-controls body class');
    } else {
      document.body.classList.add('no-owner-controls');
      document.body.classList.remove('has-owner-controls');
      console.log('[LOAD] Added no-owner-controls body class');
    }
    logEventIdState('AFTER_BODY_CLASS_UPDATE');

    console.log(`[LOAD] Calling renderProgramSections with hasScheduleAccess: ${hasScheduleAccess}...`);
    renderProgramSections(hasScheduleAccess);
    console.log(`[LOAD] renderProgramSections completed`);
    logEventIdState('AFTER_RENDER_PROGRAMS');

    console.log(`[LOAD] Setting up date filter options...`);
    setupDateFilterOptions();
    console.log(`[LOAD] Date filter options setup complete`);
    logEventIdState('AFTER_DATE_FILTER_SETUP');

    // Final verification that event ID hasn't changed
    const finalEventId = localStorage.getItem('eventId');
    if (finalEventId !== eventId) {
      console.warn(`[LOAD] Event ID changed during loadPrograms! Expected: ${eventId}, Final: ${finalEventId}`);
      logEventIdState('FINAL_ID_MISMATCH');
    } else {
      console.log(`[LOAD] Event ID verification passed: ${finalEventId}`);
      logEventIdState('FINAL_ID_VERIFIED');
    }
    
  } catch (error) {
    console.error('[LOAD] Error in loadPrograms:', error);
    logEventIdState('LOAD_ERROR');
    
    if (retryCount < maxRetries) {
      console.warn(`[LOAD] Retrying loadPrograms in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries + 1})`);
      setTimeout(() => {
        loadPrograms(eventId, retryCount + 1);
      }, retryDelay);
    } else {
      console.error('[LOAD] Failed to load programs after maximum retries');
      // Show error message to user
      const programList = document.getElementById('programList');
      if (programList) {
        programList.innerHTML = '<p>Error loading schedule. Please try again.</p>';
      }
      isOwner = false; // Reset on error
      document.body.classList.remove('has-owner-controls');
      document.body.classList.add('no-owner-controls');
      renderProgramSections(false); // Render without access on error
    }
  }
  
  const loadEndTime = Date.now();
  console.log(`--- LOAD PROGRAMS COMPLETE (${loadEndTime - loadStartTime}ms) ---\n`);
}

// Enhanced getUserIdFromToken with proper async handling and logging
async function getUserIdFromToken() {
  console.log(`[TOKEN] Getting user ID from token...`);
  
  const token = localStorage.getItem('token');
  if (!token) {
    console.log(`[TOKEN] No token found in localStorage`);
    return null;
  }
  
  try {
    console.log(`[TOKEN] Token found, decoding...`);
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.userId || payload.id || payload.sub;
    console.log(`[TOKEN] User ID decoded: ${userId}`);
    return userId;
  } catch (error) {
    console.error('[TOKEN] Error decoding token:', error);
    return null;
  }
}

function getUserRoleFromToken() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.role;
}

async function savePrograms() {
  const tableId = localStorage.getItem('eventId');
  if (!tableId) {
    console.error('No tableId found in localStorage. Cannot save.');
    return;
  }
  try {
    console.log('Saving programs for tableId:', tableId);
    const res = await fetch(`${API_BASE}/api/tables/${tableId}/program-schedule`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: localStorage.getItem('token'),
      },
      body: JSON.stringify({ programSchedule: tableData.programs }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('Failed to save programs:', res.status, text);
    } else {
      console.log('Programs saved! Response:', text);
    }
  } catch (err) {
    console.error('Failed to save programs:', err);
  }
}

function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(savePrograms, 1000);
}

function renderProgramSections(hasScheduleAccess) {
  // If hasScheduleAccess is not explicitly provided, default to the global isOwner status.
  if (typeof hasScheduleAccess === 'undefined') {
    console.warn('renderProgramSections called without explicit access status, defaulting to global isOwner:', isOwner);
    hasScheduleAccess = isOwner;
  }

  const container = document.getElementById('programSections');
  if (!container) {
    console.error('Missing #programSections div!');
    return;
  }

  // --- Preserve focus and cursor position ---
  let activeElement = document.activeElement;
  let focusInfo = null;
  if (container.contains(activeElement) && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
    focusInfo = {
      tag: activeElement.tagName,
      className: activeElement.className,
      placeholder: activeElement.getAttribute('placeholder'),
      dataset: { ...activeElement.dataset },
      value: activeElement.value,
      selectionStart: activeElement.selectionStart,
      selectionEnd: activeElement.selectionEnd
    };
    // Try to get program index if present
    const entry = activeElement.closest('.program-entry');
    if (entry) {
      focusInfo.programIndex = entry.getAttribute('data-program-index');
    }
  }

  container.innerHTML = '';

  const filterDropdown = document.getElementById('filterDateDropdown');
  if (filterDropdown) {
    const allDates = [...new Set(tableData.programs.map(p => p.date))].sort((a, b) => a.localeCompare(b));
    const currentSelection = filterDate || 'all';
    filterDropdown.innerHTML = `<option value="all">All Dates</option>`;
    allDates.forEach(date => {
      const option = document.createElement('option');
      option.value = date;
      option.textContent = formatDate(date);
      filterDropdown.appendChild(option);
    });
    filterDropdown.value = currentSelection;
  }

  if (tableData.programs.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'No programs yet. Add a new date to get started.';
    empty.style.textAlign = 'center';
    empty.style.padding = '40px';
    empty.style.color = '#777';
    container.appendChild(empty);
    return;
  }

  const dates = [...new Set(tableData.programs.map(p => p.date))].sort((a, b) => a.localeCompare(b));

  dates.forEach(date => {
    const matchingPrograms = tableData.programs
      .map((p, i) => ({ ...p, __index: i }))
      .filter(p => p.date === date && matchesSearch(p))
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

    if (matchingPrograms.length === 0) return;

    const section = document.createElement('div');
    section.className = 'date-section';
    section.setAttribute('data-date', date);

    const headerWrapper = document.createElement('div');
    headerWrapper.className = 'date-header';
    headerWrapper.innerHTML = `
      <div class="date-title">${formatDate(date)}</div>
      ${hasScheduleAccess ? `<button class="delete-date-btn" onclick="deleteDate('${date}')"><span class="material-symbols-outlined">delete</span></button>` : ''}
    `;
    section.appendChild(headerWrapper);

    matchingPrograms.forEach(program => {
      const entry = document.createElement('div');
      entry.className = 'program-entry' + (program.done ? ' done-entry' : '');
      entry.setAttribute('data-program-index', program.__index);
      if (program._id) entry.setAttribute('data-program-id', program._id);

      entry.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
          <input class="program-name" type="text"
            ${!hasScheduleAccess ? 'readonly' : ''}
            placeholder="Program Name"
            style="flex: 1;"
            value="${program.name || ''}" 
            onfocus="${hasScheduleAccess ? 'enableEdit(this)' : ''}" 
            onblur="${hasScheduleAccess ? `autoSave(this, '${program.date}', ${program.__index}, 'name')` : ''}">
          <div class="right-actions">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 14px; margin-bottom: 0;">
            <input type="checkbox" class="done-checkbox"
              style="width: 20px; height: 20px;"
              ${program.done ? 'checked' : ''}
              onchange="toggleDone(this, ${program.__index})">
          </label>
        </div>
        </div>
        <div style="display: flex; align-items: center; gap: 3px;">
          <input type="time" placeholder="Start Time" style="flex: 1; min-width: 0; text-align: left;"
            value="${program.startTime || ''}"
            ${!hasScheduleAccess ? 'readonly' : ''}
            onfocus="${hasScheduleAccess ? 'enableEdit(this)' : ''}"
            onblur="${hasScheduleAccess ? `autoSave(this, '${program.date}', ${program.__index}, 'startTime')` : ''}">
          <input type="time" placeholder="End Time" style="flex: 1; min-width: 0; text-align: left;"
            value="${program.endTime || ''}"
            ${!hasScheduleAccess ? 'readonly' : ''}
            onfocus="${hasScheduleAccess ? 'enableEdit(this)' : ''}"
            onblur="${hasScheduleAccess ? `autoSave(this, '${program.date}', ${program.__index}, 'endTime')` : ''}">
        </div>
        <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
          <div style="display: flex; align-items: center; flex: 1;">
            <span class="material-symbols-outlined" style="margin-right: 4px; font-size: 18px;">location_on</span>
            <textarea style="flex: 1; resize: none;"
              placeholder="Location"
              ${!hasScheduleAccess ? 'readonly' : ''}
              onfocus="${hasScheduleAccess ? 'enableEdit(this)' : ''}"
              oninput="${hasScheduleAccess ? 'autoResizeTextarea(this)' : ''}"
              onblur="${hasScheduleAccess ? `autoSave(this, '${program.date}', ${program.__index}, 'location')` : ''}">${program.location || ''}</textarea>
          </div>
          <div style="display: flex; align-items: center; flex: 1;">
            <span class="material-symbols-outlined" style="margin-right: 4px; font-size: 18px;">photo_camera</span>
            <textarea style="flex: 1; resize: none;"
              placeholder="Photographer"
              ${!hasScheduleAccess ? 'readonly' : ''}
              onfocus="${hasScheduleAccess ? 'enableEdit(this)' : ''}"
              oninput="${hasScheduleAccess ? 'autoResizeTextarea(this)' : ''}"
              onblur="${hasScheduleAccess ? `autoSave(this, '${program.date}', ${program.__index}, 'photographer')` : ''}">${program.photographer || ''}</textarea>
          </div>
        </div>
        <div class="entry-actions">
        <button class="show-notes-btn" onclick="toggleNotes(this)">Show Notes</button>
          ${hasScheduleAccess ? `<button class="delete-btn" onclick="deleteProgram(this)"><span class="material-symbols-outlined">delete</span></button>` : ''}
        </div>
        <div class="notes-field" style="display: none;">
          <textarea
            class="auto-expand"
            placeholder="Notes"
            oninput="autoResizeTextarea(this)"
            ${!hasScheduleAccess ? 'readonly' : ''}
            onfocus="${hasScheduleAccess ? 'enableEdit(this)' : ''}"
            onblur="${hasScheduleAccess ? `autoSave(this, '${program.date}', ${program.__index}, 'notes')` : ''}">${program.notes || ''}</textarea>
        </div>
      `;
      section.appendChild(entry);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.textContent = '+ Add Row';
    addBtn.onclick = () => addProgram(date);
    if (hasScheduleAccess) section.appendChild(addBtn);

    container.appendChild(section);
  });

  // After rendering is complete, restore scroll position if needed
  setTimeout(() => {
    document.querySelectorAll('textarea').forEach(setupTextareaResize);
    // --- Restore focus and cursor position ---
    if (focusInfo) {
      // Try to find the new element matching the previous one
      let selector = '';
      if (focusInfo.className) selector += '.' + focusInfo.className.split(' ').join('.');
      if (focusInfo.placeholder) selector += `[placeholder="${focusInfo.placeholder}"]`;
      let candidates = Array.from(container.querySelectorAll(focusInfo.tag + selector));
      let target = null;
      if (focusInfo.programIndex) {
        // Try to match by program index
        target = candidates.find(el => {
          const entry = el.closest('.program-entry');
          return entry && entry.getAttribute('data-program-index') === focusInfo.programIndex;
        });
      }
      if (!target && candidates.length === 1) target = candidates[0];
      if (target) {
        target.focus();
        if (typeof focusInfo.selectionStart === 'number' && typeof focusInfo.selectionEnd === 'number') {
          target.setSelectionRange(focusInfo.selectionStart, focusInfo.selectionEnd);
        }
      }
    }
    // Apply pending scroll restore if exists
    if (pendingScrollRestore !== null) {
      applyScrollRestore();
    }
  }, 150); // Increased delay for more reliable rendering completion
}

// Create a separate function for scroll restoration that can be called multiple times
function applyScrollRestore() {
  if (pendingScrollRestore === null) return;
  
  const scrollContainer = getScrollContainer();
  console.log(`Applying pending scroll restore to position: ${pendingScrollRestore} for container: ${scrollContainer.id || 'window'}`);
  
  if (scrollContainer === window) {
    window.scrollTo({
      top: pendingScrollRestore,
      behavior: 'auto'
    });
  } else {
    scrollContainer.scrollTop = pendingScrollRestore;
  }
  
  // Schedule multiple restore attempts to overcome any competing operations
  // that might be scrolling the container back to top
  const scrollValue = pendingScrollRestore;
  
  // Make multiple attempts to restore the scroll position
  for (let delay of [100, 300, 500, 1000, 2000]) {
    setTimeout(() => {
      const currentScrollY = scrollContainer === window ? 
        (window.scrollY || window.pageYOffset || document.documentElement.scrollTop) : 
        scrollContainer.scrollTop;
      
      // Only re-apply if the position was lost
      if (currentScrollY < scrollValue - 50) {
        console.log(`Scroll position lost (current: ${currentScrollY}, target: ${scrollValue}), reapplying at ${delay}ms`);
        
        if (scrollContainer === window) {
          window.scrollTo({
            top: scrollValue,
            behavior: 'auto'
          });
        } else {
          scrollContainer.scrollTop = scrollValue;
        }
      } else {
        // console.log(`Scroll position maintained at ${currentScrollY} at ${delay}ms check`); // Commented out to reduce log noise
      }
      
      // Clear after final check
      if (delay === 2000) {
        pendingScrollRestore = null;
      }
    }, delay);
  }
}

function toggleDone(checkbox, index) {
  if (!isNaN(index)) {
    tableData.programs[index].done = checkbox.checked;
    const entry = checkbox.closest('.program-entry');
    if (entry) {
      entry.classList.toggle('done-entry', checkbox.checked);
    }
    scheduleSave();
  }
}

function matchesSearch(program) {
  if (filterDate !== 'all' && program.date !== filterDate) return false;
  if (!searchQuery.trim()) return true;
  const lower = searchQuery.toLowerCase();
  return (
    (program.name || '').toLowerCase().includes(lower) ||
    (program.startTime || '').toLowerCase().includes(lower) ||
    (program.endTime || '').toLowerCase().includes(lower) ||
    (program.location || '').toLowerCase().includes(lower) ||
    (program.photographer || '').toLowerCase().includes(lower) ||
    (program.notes || '').toLowerCase().includes(lower)
  );
}

// --- Editing guard for partial updates and optimistic UI ---
window.currentlyEditing = null; // { programId, field, pendingUpdate: null }

function enableEdit(field) {
  field.classList.add('editing');
  const entry = field.closest('.program-entry');
  if (entry) {
    const programIndex = entry.getAttribute('data-program-index');
    const program = tableData.programs[programIndex];
    if (program && program._id) {
      window.currentlyEditing = {
        programId: program._id,
        field: field.getAttribute('placeholder') || field.className,
        pendingUpdate: null
      };
    }
  }
}

function autoSave(field, date, ignoredIndex, key) {
  field.classList.remove('editing');
  const entry = field.closest('.program-entry');
  const programIndex = parseInt(entry.getAttribute('data-program-index'), 10);
  if (!isNaN(programIndex)) {
    tableData.programs[programIndex][key] = field.value.trim();
    scheduleSave();
  }
  // If there was a pending update for this program/field, apply it now
  if (window.currentlyEditing && window.currentlyEditing.pendingUpdate) {
    const { program, field: pendingField } = window.currentlyEditing.pendingUpdate;
    if (program && program._id && pendingField === key) {
      // Find the program and update it
      const idx = tableData.programs.findIndex(p => p._id === program._id);
      if (idx !== -1) {
        tableData.programs[idx] = program;
        renderProgramSections(isOwner);
      }
      window.currentlyEditing.pendingUpdate = null;
    }
  }
  window.currentlyEditing = null;
}

// Optimistic UI: update tableData on input
function optimisticInputHandler(e) {
  const field = e.target;
  const entry = field.closest('.program-entry');
  if (!entry) return;
  const programIndex = parseInt(entry.getAttribute('data-program-index'), 10);
  if (isNaN(programIndex)) return;
  const key = field.getAttribute('placeholder') || field.className;
  if (key && tableData.programs[programIndex]) {
    tableData.programs[programIndex][key] = field.value;
  }
}

function toggleNotes(button) {
  const entry = button.closest('.program-entry');
  const notesField = entry.querySelector('.notes-field');
  const textarea = notesField.querySelector('textarea');
  const isOpen = notesField.style.display === 'block';
  notesField.style.display = isOpen ? 'none' : 'block';
  button.textContent = isOpen ? 'Show Notes' : 'Hide Notes';
  if (!isOpen && textarea) {
    // Force a reflow to ensure the textarea is visible
    textarea.offsetHeight;
    setupTextareaResize(textarea);
  }
}

function toggleAllNotes() {
  const allNotes = document.querySelectorAll('.notes-field');
  const allButtons = document.querySelectorAll('.show-notes-btn');
  allNotes.forEach(note => {
    note.style.display = allNotesVisible ? 'none' : 'block';
    const textarea = note.querySelector('textarea');
    if (!allNotesVisible && textarea) setupTextareaResize(textarea);
  });
  allButtons.forEach(btn => {
    btn.textContent = allNotesVisible ? 'Show Notes' : 'Hide Notes';
  });
  allNotesVisible = !allNotesVisible;
  const toggleBtn = document.getElementById('toggleAllNotesBtn');
  if (toggleBtn) toggleBtn.textContent = allNotesVisible ? 'Hide All Notes' : 'Show All Notes';
}

function autoResizeTextarea(textarea) {
  if (!textarea) return;

  // Reset height to auto to get the correct scrollHeight
  textarea.style.height = 'auto';

  // Calculate the new height
  const newHeight = Math.max(textarea.scrollHeight, 40); // Ensure minimum height of 40px

  // Set the new height
  textarea.style.height = newHeight + 'px';
}

function setupTextareaResize(textarea) {
  if (!textarea) return;

  // Initial resize
  autoResizeTextarea(textarea);

  // Add input event listener
  textarea.addEventListener('input', () => autoResizeTextarea(textarea));

  // Add change event listener for paste events
  textarea.addEventListener('change', () => autoResizeTextarea(textarea));

  // Add paste event listener
  textarea.addEventListener('paste', () => {
    // Wait for paste to complete
    setTimeout(() => autoResizeTextarea(textarea), 0);
  });

  // Add focus event listener to ensure resizing on focus
  textarea.addEventListener('focus', () => autoResizeTextarea(textarea));
}

function captureCurrentPrograms() {
  const sections = document.querySelectorAll('.date-section');
  tableData.programs = [];
  sections.forEach(section => {
    const date = section.getAttribute('data-date');
    section.querySelectorAll('.program-entry').forEach(entry => {
      tableData.programs.push({
        date,
        name: entry.querySelector('input.program-name')?.value.trim() || '',
        startTime: entry.querySelector('input[placeholder="Start Time"]')?.value.trim() || '',
        endTime: entry.querySelector('input[placeholder="End Time"]')?.value.trim() || '',
        location: entry.querySelector('textarea[placeholder="Location"]')?.value.trim() || '',
        photographer: entry.querySelector('textarea[placeholder="Photographer"]')?.value.trim() || '',
        notes: entry.querySelector('textarea[placeholder="Notes"]')?.value.trim() || '',
        done: entry.querySelector('input.done-checkbox')?.checked || false,
      });
    });
  });
}

function addDateSection() {
  const date = document.getElementById('newDate').value;
  if (!date) return alert('Please select a date');
  captureCurrentPrograms();
  tableData.programs.push({ date, name: '', startTime: '', endTime: '', location: '', photographer: '', notes: '' });
  document.getElementById('newDate').value = '';
  renderProgramSections(isOwner);
  scheduleSave();
}

function addProgram(date) {
  captureCurrentPrograms();
  tableData.programs.push({ date, name: '', startTime: '', endTime: '', location: '', photographer: '', notes: '' });
  renderProgramSections(isOwner);
  scheduleSave();
}

function deleteProgram(button) {
  const index = parseInt(button.closest('.program-entry').getAttribute('data-program-index'), 10);
  if (!isNaN(index)) {
    tableData.programs.splice(index, 1);
    renderProgramSections(isOwner);
    scheduleSave();
  }
}

function deleteDate(date) {
  if (confirm('Delete all programs for this date?')) {
    tableData.programs = tableData.programs.filter(p => p.date !== date);
    renderProgramSections(isOwner);
    scheduleSave();
  }
}

function goBack() {
  // Use the module-level currentEventId first, then fall back to localStorage
  const eventIdToUse = currentEventId || localStorage.getItem('eventId');
  if (!eventIdToUse) {
    console.error('No current event ID found for goBack navigation');
    // Fallback to dashboard
    window.location.href = 'dashboard.html';
    return;
  }
  console.log(`Navigating back to event: ${eventIdToUse}`);
  window.location.href = `event.html?id=${eventIdToUse}`;
}

function handleSearchInput(e) {
  searchQuery = e.target.value.toLowerCase();
  renderProgramSections(isOwner);
  saveFilterSettings();
}

window.loadPrograms = loadPrograms;
window.getUserIdFromToken = getUserIdFromToken;
window.savePrograms = savePrograms;
window.scheduleSave = scheduleSave;
window.renderProgramSections = renderProgramSections;
window.toggleDone = toggleDone;
window.matchesSearch = matchesSearch;
window.enableEdit = enableEdit;
window.autoSave = autoSave;
window.toggleNotes = toggleNotes;
window.toggleAllNotes = toggleAllNotes;
window.autoResizeTextarea = autoResizeTextarea;
window.captureCurrentPrograms = captureCurrentPrograms;
window.addDateSection = addDateSection;
window.addProgram = addProgram;
window.deleteProgram = deleteProgram;
window.deleteDate = deleteDate;
window.goBack = goBack;
window.handleSearchInput = handleSearchInput;
window.resetFilterSettings = resetFilterSettings;

// Call setupTextareaResize for each textarea on page load
document.querySelectorAll('.auto-expand').forEach(setupTextareaResize);

function cleanupSchedulePage() {
  // Remove schedule-page class from body
  document.body.classList.remove('schedule-page');

  // Remove event listeners
  const navLinks = document.querySelectorAll('#bottomNav a[data-page]');
  navLinks.forEach(link => {
    link.removeEventListener('click', handleNavClick);
  });

  // Remove input event listeners
  const inputs = document.querySelectorAll('input, textarea, select');
  inputs.forEach(input => {
    input.removeEventListener('input', handleSearchInput);
    input.removeEventListener('change', handleSearchInput);
  });

  // Clear injected elements
  const navContainer = document.getElementById('bottomNav');
  if (navContainer) {
    navContainer.innerHTML = '';
  }

  // Remove scroll event listener
  if (window.scheduleScrollHandler) {
    const { handler, container } = window.scheduleScrollHandler;
    if (container && handler) {
      container.removeEventListener('scroll', handler);
      console.log(`Removed scroll event listener from ${container.id || 'window'}`);
    }
  }
  
  // Clear scroll timeout if exists
  if (window.scrollSaveTimeout) {
    clearTimeout(window.scrollSaveTimeout);
  }

  // Reset any global variables or state
  tableData = { programs: [] };
  saveTimeout = null;
  searchQuery = '';
  filterDate = 'all';
  allNotesVisible = false;
  isOwner = false;
  pendingScrollRestore = null;

  // Remove any other dynamically added elements or styles
  const dynamicElements = document.querySelectorAll('.dynamic-element');
  dynamicElements.forEach(el => el.remove());

  // Clear any remaining timeouts
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  // Reset the initialization guard when cleaned up
  window.__scheduleJsLoaded = false;
}

function handleNavClick(e) {
  e.preventDefault();
  const page = e.currentTarget.getAttribute('data-page');
  
  // Use the module-level currentEventId first, then fall back to localStorage
  const eventIdToUse = currentEventId || localStorage.getItem('eventId');
  if (!eventIdToUse) {
    console.error('No current event ID found for navigation');
    // Fallback to dashboard if no event ID
    window.navigate('dashboard');
    return;
  }
  
  console.log(`Navigating to page: ${page} within event: ${eventIdToUse}`);
  window.navigate(page, eventIdToUse);
}

// Call cleanupSchedulePage before navigating away
window.addEventListener('beforeunload', cleanupSchedulePage);

// Import the SheetJS library dynamically when needed
function loadSheetJSLibrary() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) {
      resolve(window.XLSX);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.19.3/package/dist/xlsx.full.min.js';
    script.async = true;
    script.onload = () => resolve(window.XLSX);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Function to handle the file import
async function handleFileImport(event) {
  // Only allow owners to import files
  if (!isOwner) {
    alert('Not authorized. Only owners can import schedules.');
    // Reset the file input
    if (event.target) {
      event.target.value = '';
    }
    return;
  }
  
  const file = event.target.files[0];
  if (!file) return;

  try {
    const XLSX = await loadSheetJSLibrary();
    
    // Read the file
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get the first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Process the data
        processImportedData(jsonData);
      } catch (error) {
        console.error('Error parsing file:', error);
        alert('Error parsing file. Please check the format and try again.');
      }
    };
    
    reader.readAsArrayBuffer(file);
  } catch (error) {
    console.error('Error loading SheetJS library:', error);
    alert('Error loading import library. Please try again later.');
  }
}

// Process the imported data and add it to the schedule
function processImportedData(data) {
  if (!data || data.length < 2) {
    alert('The file appears to be empty or missing required data.');
    return;
  }
  
  // Extract headers from the first row
  const headers = data[0].map(header => header.toLowerCase().trim());
  
  // Check for required columns
  const requiredColumns = ['date', 'name'];
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));
  
  if (missingColumns.length > 0) {
    alert(`The following required columns are missing: ${missingColumns.join(', ')}`);
    return;
  }
  
  // Map column indices
  const columnMap = {
    date: headers.indexOf('date'),
    name: headers.indexOf('name'),
    startTime: headers.indexOf('starttime') !== -1 ? headers.indexOf('starttime') : headers.indexOf('start time'),
    endTime: headers.indexOf('endtime') !== -1 ? headers.indexOf('endtime') : headers.indexOf('end time'),
    location: headers.indexOf('location'),
    photographer: headers.indexOf('photographer'),
    notes: headers.indexOf('notes')
  };
  
  // Process each row
  const newPrograms = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[columnMap.date] || !row[columnMap.name]) continue; // Skip rows without date or name
    
    // Format the date to YYYY-MM-DD
    let dateValue = row[columnMap.date];
    
    // Handle Excel date format (numeric)
    if (typeof dateValue === 'number') {
      // Convert Excel date number to JS date
      const excelDate = new Date(Math.round((dateValue - 25569) * 86400 * 1000));
      dateValue = excelDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    } else if (typeof dateValue === 'string') {
      // Try to parse the date string
      const dateParts = dateValue.split(/[-\/]/);
      if (dateParts.length === 3) {
        // Check if it's MM/DD/YYYY or DD/MM/YYYY or YYYY/MM/DD
        if (dateParts[0].length === 4) {
          // YYYY/MM/DD
          dateValue = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
        } else if (parseInt(dateParts[0]) > 12) {
          // DD/MM/YYYY
          dateValue = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
        } else {
          // MM/DD/YYYY
          dateValue = `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;
        }
      }
    }
    
    // Format times (convert e.g. "9:00" to "09:00")
    let startTime = '';
    let endTime = '';
    
    if (columnMap.startTime !== -1 && row[columnMap.startTime]) {
      startTime = formatTimeValue(row[columnMap.startTime]);
    }
    
    if (columnMap.endTime !== -1 && row[columnMap.endTime]) {
      endTime = formatTimeValue(row[columnMap.endTime]);
    }
    
    newPrograms.push({
      date: dateValue,
      name: row[columnMap.name],
      startTime: startTime,
      endTime: endTime,
      location: columnMap.location !== -1 ? (row[columnMap.location] || '') : '',
      photographer: columnMap.photographer !== -1 ? (row[columnMap.photographer] || '') : '',
      notes: columnMap.notes !== -1 ? (row[columnMap.notes] || '') : '',
      done: false
    });
  }
  
  if (newPrograms.length === 0) {
    alert('No valid data found in the file.');
    return;
  }

  // Create and show the modal
  showImportModal(newPrograms);
}

// Function to create and show the import modal
function showImportModal(newPrograms) {
  // Create modal container
  const modalContainer = document.createElement('div');
  modalContainer.className = 'import-modal-container';
  modalContainer.style.position = 'fixed';
  modalContainer.style.top = '0';
  modalContainer.style.left = '0';
  modalContainer.style.width = '100%';
  modalContainer.style.height = '100%';
  modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  modalContainer.style.display = 'flex';
  modalContainer.style.justifyContent = 'center';
  modalContainer.style.alignItems = 'center';
  modalContainer.style.zIndex = '9999';
  
  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.className = 'import-modal-content';
  modalContent.style.backgroundColor = 'white';
  modalContent.style.padding = '20px';
  modalContent.style.borderRadius = '8px';
  modalContent.style.maxWidth = '500px';
  modalContent.style.width = '90%';
  modalContent.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  
  // Create modal header
  const modalHeader = document.createElement('div');
  modalHeader.innerHTML = `<h3 style="margin-top: 0; color: #333;">Import Schedule</h3>`;
  
  // Create modal body
  const modalBody = document.createElement('div');
  modalBody.innerHTML = `
    <p>Found ${newPrograms.length} valid program entries.</p>
    <p>How would you like to import these entries?</p>
  `;
  
  // Create modal footer with buttons
  const modalFooter = document.createElement('div');
  modalFooter.style.display = 'flex';
  modalFooter.style.justifyContent = 'flex-end';
  modalFooter.style.marginTop = '20px';
  modalFooter.style.gap = '10px';

  // Create cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.style.padding = '8px 16px';
  cancelButton.style.border = '1px solid #ddd';
  cancelButton.style.borderRadius = '4px';
  cancelButton.style.backgroundColor = '#f5f5f5';
  cancelButton.style.cursor = 'pointer';
  
  // Create merge button
  const mergeButton = document.createElement('button');
  mergeButton.textContent = 'Merge with Current';
  mergeButton.style.padding = '8px 16px';
  mergeButton.style.border = 'none';
  mergeButton.style.borderRadius = '4px';
  mergeButton.style.backgroundColor = '#4a5568';
  mergeButton.style.color = 'white';
  mergeButton.style.cursor = 'pointer';
  
  // Create replace button
  const replaceButton = document.createElement('button');
  replaceButton.textContent = 'Replace Current';
  replaceButton.style.padding = '8px 16px';
  replaceButton.style.border = 'none';
  replaceButton.style.borderRadius = '4px';
  replaceButton.style.backgroundColor = '#CC0007';
  replaceButton.style.color = 'white';
  replaceButton.style.cursor = 'pointer';
  
  // Add buttons to footer
  modalFooter.appendChild(cancelButton);
  modalFooter.appendChild(mergeButton);
  modalFooter.appendChild(replaceButton);
  
  // Add all elements to modal content
  modalContent.appendChild(modalHeader);
  modalContent.appendChild(modalBody);
  modalContent.appendChild(modalFooter);
  
  // Add modal content to container
  modalContainer.appendChild(modalContent);
  
  // Add modal to body
  document.body.appendChild(modalContainer);
  
  // Add event listeners to buttons
  cancelButton.addEventListener('click', () => {
    document.body.removeChild(modalContainer);
  });
  
  mergeButton.addEventListener('click', () => {
    // Merge data
    tableData.programs = [...tableData.programs, ...newPrograms];
    renderProgramSections();
    scheduleSave();
    document.body.removeChild(modalContainer);
    alert(`Successfully imported ${newPrograms.length} program entries.`);
  });
  
  replaceButton.addEventListener('click', () => {
    // Replace data
    tableData.programs = newPrograms;
    renderProgramSections();
    scheduleSave();
    document.body.removeChild(modalContainer);
    alert(`Successfully replaced schedule with ${newPrograms.length} program entries.`);
  });
}

// Helper function to format time values
function formatTimeValue(timeValue) {
  if (typeof timeValue === 'number') {
    // Handle Excel time (decimal fraction of day)
    const totalMinutes = Math.round(timeValue * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  } else if (typeof timeValue === 'string') {
    // Parse time string (various formats)
    const timeMatch = timeValue.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
      let [_, hours, minutes, ampm] = timeMatch;
      hours = parseInt(hours);
      minutes = minutes ? parseInt(minutes) : 0;
      
      // Handle 12-hour format
      if (ampm) {
        if (ampm.toLowerCase() === 'pm' && hours < 12) hours += 12;
        if (ampm.toLowerCase() === 'am' && hours === 12) hours = 0;
      }
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }
  return timeValue;
}

// Function to download a CSV template for importing
function downloadImportTemplate() {
  // Only allow owners to download the template
  if (!isOwner) {
    alert('Not authorized. Only owners can download import templates.');
    return;
  }
  
  const headers = ['Date', 'Name', 'StartTime', 'EndTime', 'Location', 'Photographer', 'Notes'];
  const csvContent = headers.join(',') + '\n' +
    '2023-06-01,Main Event,09:00,12:00,Grand Hall,John Smith,VIP guests expected\n' +
    '2023-06-01,Lunch Break,12:00,13:00,Dining Room,N/A,Catering by LocalFood\n' +
    '2023-06-01,Panel Discussion,13:30,15:00,Conference Room B,Jane Doe,Q&A session at the end\n' +
    '2023-06-02,Workshop,10:00,12:30,Training Room,Michael Johnson,Bring extra equipment\n' +
    '2023-06-02,Closing Event,16:00,18:00,Main Stage,Full Team,Group photo at 17:30';
  
  // Create a Blob with the CSV content
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Create a download link
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', 'schedule_template.csv');
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Add to exports
window.downloadImportTemplate = downloadImportTemplate;
window.handleFileImport = handleFileImport;
window.processImportedData = processImportedData;
window.formatTimeValue = formatTimeValue;
window.showImportModal = showImportModal;

// --- Socket.IO real-time updates ---
if (typeof io !== 'undefined') {
  const socket = io();
  
  // Listen for program updates
  socket.on('programUpdate', (data) => {
    console.log(`[SOCKET] Program update received:`, data);
    logEventIdState('SOCKET_PROGRAM_UPDATE');
    
    const currentEvent = localStorage.getItem('eventId');
    
    // Only update if this update is for the current event
    if (data.eventId === currentEvent) {
      console.log(`[SOCKET] Update is for current event (${currentEvent}), refreshing...`);
      loadPrograms(); // Reload programs
    } else {
      console.log(`[SOCKET] Update is for different event (${data.eventId}), current: ${currentEvent}, ignoring`);
    }
  });
  
  // Listen for event/table updates that might affect ownership
  socket.on('tableUpdate', (data) => {
    console.log(`[SOCKET] Table update received:`, data);
    logEventIdState('SOCKET_TABLE_UPDATE');
    
    const currentEvent = localStorage.getItem('eventId');
    
    // Only update if this update is for the current event
    if (data.tableId === currentEvent) {
      console.log(`[SOCKET] Table update is for current event (${currentEvent}), reloading...`);
      loadPrograms(); // Reload to get updated permissions
    } else {
      console.log(`[SOCKET] Table update is for different event (${data.tableId}), current: ${currentEvent}, ignoring`);
    }
  });
  
  console.log('[SOCKET] Socket.IO event handlers registered');
} else {
  console.warn('[SOCKET] Socket.IO not available');
}

// Create and store the scroll handler when page loads
window.scheduleScrollHandler = createScrollListener();

// Add a function to reset filter settings
function resetFilterSettings() {
  // Reset filter date
  filterDate = 'all';
  const filterDropdown = document.getElementById('filterDateDropdown');
  if (filterDropdown) filterDropdown.value = 'all';
  
  // Reset search query
  searchQuery = '';
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';
  
  // Reset scroll position
  window.scrollTo(0, 0);
  pendingScrollRestore = null;
  
  // Apply the reset filters
  renderProgramSections(isOwner);
}

// --- Editing guard for real-time updates ---
window.isActiveEditing = false;
window.pendingReload = false;

function setEditingListeners() {
  // Attach to all inputs and textareas in the schedule page
  document.querySelectorAll('input, textarea').forEach(el => {
    el.addEventListener('focus', () => {
      window.isActiveEditing = true;
    });
    el.addEventListener('blur', () => {
      window.isActiveEditing = false;
      // If a reload was pending, do it now
      if (window.pendingReload) {
        window.pendingReload = false;
        const tableId = localStorage.getItem('eventId');
        if (tableId && typeof loadPrograms === 'function') loadPrograms(tableId);
      }
    });
  });
}

// Call this after rendering program sections
const origRenderProgramSections = renderProgramSections;
renderProgramSections = function(...args) {
  origRenderProgramSections.apply(this, args);
  setEditingListeners();
  // Attach input handler for optimistic UI
  document.querySelectorAll('.program-entry input, .program-entry textarea').forEach(el => {
    el.removeEventListener('input', optimisticInputHandler);
    el.addEventListener('input', optimisticInputHandler);
  });
};

// --- Per-row update for programUpdated ---
function updateProgramRow(program, hasScheduleAccess) {
  // Find the row by _id
  const container = document.getElementById('programSections');
  if (!container) return;
  // Find the entry with the matching data-program-id
  const entry = container.querySelector(`.program-entry[data-program-id='${program._id}']`);
  if (!entry) return;
  // Rebuild the row's HTML (copy from renderProgramSections)
  const programIndex = tableData.programs.findIndex(p => p._id === program._id);
  if (programIndex === -1) return;
  entry.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
      <input class="program-name" type="text"
        ${!hasScheduleAccess ? 'readonly' : ''}
        placeholder="Program Name"
        style="flex: 1;"
        value="${program.name || ''}" 
        onfocus="${hasScheduleAccess ? 'enableEdit(this)' : ''}" 
        onblur="${hasScheduleAccess ? `autoSave(this, '${program.date}', ${programIndex}, 'name')` : ''}">
      <div class="right-actions">
        <label style="display: flex; align-items: center; gap: 6px; font-size: 14px; margin-bottom: 0;">
        <input type="checkbox" class="done-checkbox"
          style="width: 20px; height: 20px;"
          ${program.done ? 'checked' : ''}
          onchange="toggleDone(this, ${programIndex})">
      </label>
    </div>
    </div>
    <div style="display: flex; align-items: center; gap: 3px;">
      <input type="time" placeholder="Start Time" style="flex: 1; min-width: 0; text-align: left;"
        value="${program.startTime || ''}"
        ${!hasScheduleAccess ? 'readonly' : ''}
        onfocus="${hasScheduleAccess ? 'enableEdit(this)' : ''}"
        onblur="${hasScheduleAccess ? `autoSave(this, '${program.date}', ${programIndex}, 'startTime')` : ''}">
      <input type="time" placeholder="End Time" style="flex: 1; min-width: 0; text-align: left;"
        value="${program.endTime || ''}"
        ${!hasScheduleAccess ? 'readonly' : ''}
        onfocus="${hasScheduleAccess ? 'enableEdit(this)' : ''}"
        onblur="${hasScheduleAccess ? `autoSave(this, '${program.date}', ${programIndex}, 'endTime')` : ''}">
    </div>
    <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
      <div style="display: flex; align-items: center; flex: 1;">
        <span class="material-symbols-outlined" style="margin-right: 4px; font-size: 18px;">location_on</span>
        <textarea style="flex: 1; resize: none;"
          placeholder="Location"
          ${!hasScheduleAccess ? 'readonly' : ''}
          onfocus="${hasScheduleAccess ? 'enableEdit(this)' : ''}"
          oninput="${hasScheduleAccess ? 'autoResizeTextarea(this)' : ''}"
          onblur="${hasScheduleAccess ? `autoSave(this, '${program.date}', ${programIndex}, 'location')` : ''}">${program.location || ''}</textarea>
      </div>
      <div style="display: flex; align-items: center; flex: 1;">
        <span class="material-symbols-outlined" style="margin-right: 4px; font-size: 18px;">photo_camera</span>
        <textarea style="flex: 1; resize: none;"
          placeholder="Photographer"
          ${!hasScheduleAccess ? 'readonly' : ''}
          onfocus="${hasScheduleAccess ? 'enableEdit(this)' : ''}"
          oninput="${hasScheduleAccess ? 'autoResizeTextarea(this)' : ''}"
          onblur="${hasScheduleAccess ? `autoSave(this, '${program.date}', ${programIndex}, 'photographer')` : ''}">${program.photographer || ''}</textarea>
      </div>
    </div>
    <div class="entry-actions">
    <button class="show-notes-btn" onclick="toggleNotes(this)">Show Notes</button>
      ${hasScheduleAccess ? `<button class="delete-btn" onclick="deleteProgram(this)"><span class="material-symbols-outlined">delete</span></button>` : ''}
    </div>
    <div class="notes-field" style="display: none;">
      <textarea
        class="auto-expand"
        placeholder="Notes"
        oninput="autoResizeTextarea(this)"
        ${!hasScheduleAccess ? 'readonly' : ''}
        onfocus="${hasScheduleAccess ? 'enableEdit(this)' : ''}"
        onblur="${hasScheduleAccess ? `autoSave(this, '${program.date}', ${programIndex}, 'notes')` : ''}">${program.notes || ''}</textarea>
    </div>
  `;
  // Re-attach listeners and auto-resize
  entry.querySelectorAll('textarea').forEach(setupTextareaResize);
}

// Add missing setupDateFilterOptions function and fix programs reference
function setupDateFilterOptions() {
  const filterDropdown = document.getElementById('filterDateDropdown');
  if (filterDropdown && tableData.programs) {
    const allDates = [...new Set(tableData.programs.map(p => p.date))].sort((a, b) => a.localeCompare(b));
    const currentSelection = filterDate || 'all';
    filterDropdown.innerHTML = `<option value="all">All Dates</option>`;
    allDates.forEach(date => {
      const option = document.createElement('option');
      option.value = date;
      option.textContent = formatDate(date);
      filterDropdown.appendChild(option);
    });
    filterDropdown.value = currentSelection;
    console.log(`[FILTER] Setup ${allDates.length} date filter options, current: ${currentSelection}`);
  }
}

// Monitor setupBottomNavigation calls
const originalSetupBottomNavigation = window.setupBottomNavigation;
if (originalSetupBottomNavigation) {
  window.setupBottomNavigation = function(...args) {
    console.log(`[MONITOR] setupBottomNavigation called with args:`, args);
    logEventIdState('BEFORE_SETUP_BOTTOM_NAV_CALL');
    
    const result = originalSetupBottomNavigation.apply(this, args);
    
    logEventIdState('AFTER_SETUP_BOTTOM_NAV_CALL');
    console.log(`[MONITOR] setupBottomNavigation completed`);
    
    return result;
  };
  console.log(`[MONITOR] setupBottomNavigation monitoring installed`);
} else {
  console.warn(`[MONITOR] setupBottomNavigation not found for monitoring`);
}

})();
