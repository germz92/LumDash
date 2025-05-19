(function() {
const categories = ["Cameras", "Lenses", "Lighting", "Support", "Accessories"];

const token = window.token || (window.token = localStorage.getItem('token'));

const params = new URLSearchParams(window.location.search);
let tableId = params.get('id') || localStorage.getItem('eventId');

// Socket.IO real-time updates - IMPROVED IMPLEMENTATION
if (window.socket) {
  // Track if the user is currently editing a field
  window.isActiveEditing = false;
  
  // Listen for gear-specific updates
  window.socket.on('gearChanged', (data) => {
    console.log('Gear data changed, checking if relevant...', data);
    // Get the current table ID from localStorage (more reliable than params)
    const currentTableId = localStorage.getItem('eventId');
    
    // Check if update is for the current table
    if (data && data.tableId && data.tableId !== currentTableId) {
      console.log('Update was for a different table, ignoring');
      return;
    }
    
    // Don't reload if the user is actively editing
    if (!window.isActiveEditing) {
      console.log('Reloading gear data for current table');
      loadGear();
    } else {
      console.log('Skipping reload while user is editing');
      // Set a flag to reload when user finishes editing
      window.pendingReload = true;
    }
  });
  
  // Also listen for general table updates
  window.socket.on('tableUpdated', (data) => {
    console.log('Table updated, checking if relevant...', data);
    // Get the current table ID from localStorage (more reliable than params)
    const currentTableId = localStorage.getItem('eventId');
    
    // Check if update is for the current table
    if (data && data.tableId && data.tableId !== currentTableId) {
      console.log('Update was for a different table, ignoring');
      return;
    }
    
    // Don't reload if the user is actively editing
    if (!window.isActiveEditing) {
      console.log('Reloading gear data for current table');
      loadGear();
    } else {
      console.log('Skipping reload while user is editing');
      // Set a flag to reload when user finishes editing
      window.pendingReload = true;
    }
  });
  
  // Log connection status changes
  window.socket.on('connect', () => {
    console.log('Socket.IO connected - Gear page will receive live updates');
  });
  
  window.socket.on('disconnect', () => {
    console.log('Socket.IO disconnected - Gear page live updates paused');
  });
}

// ✨ New centralized event context
const eventContext = {
  tableId: tableId || localStorage.getItem('eventId'),
  lists: {},
  activeList: null,
  
  // Initialize context
  init(id) {
    this.tableId = id || this.tableId;
    if (!this.tableId) return false;
    return true;
  },
  
  // Create a new list with metadata
  createList(name, description = "") {
    if (!name || this.lists[name]) return false;
    
    this.lists[name] = {
      meta: {
        description: description,
        created: new Date().toISOString()
      },
      categories: {}
    };
    
    // Initialize categories
    for (const category of categories) {
      this.lists[name].categories[category] = [];
    }
    
    // Set as active if first list
    if (!this.activeList) {
      this.activeList = name;
    }
    
    return true;
  },
  
  // Delete a list
  deleteList(name) {
    if (!this.lists[name]) return false;
    
    // Prevent deleting the only list
    if (Object.keys(this.lists).length <= 1) return false;
    
    // Delete the list
    delete this.lists[name];
    
    // If active list was deleted, switch to another
    if (this.activeList === name) {
      this.activeList = Object.keys(this.lists)[0];
    }
    
    return true;
  },
  
  // Switch active list
  switchList(name) {
    if (!this.lists[name]) return false;
    this.activeList = name;
    return true;
  },
  
  // Get items from the active list
  getItems(category) {
    if (!this.activeList || !this.lists[this.activeList]) return [];
    return this.lists[this.activeList].categories[category] || [];
  },
  
  // Check if an item exists in any list
  isItemInAnyList(label) {
    return Object.values(this.lists).some(list => {
      return Object.values(list.categories).some(categoryItems => 
        categoryItems.some(item => item.label === label)
      );
    });
  },
  
  // Get all items across all lists (flattened)
  getAllItems() {
    const allItems = [];
    Object.values(this.lists).forEach(list => {
      Object.values(list.categories).forEach(categoryItems => {
        categoryItems.forEach(item => {
          allItems.push(item);
        });
      });
    });
    return allItems;
  },
  
  // Save all lists and date context to server
  async save(checkOutDate, checkInDate) {
    try {
      console.log("Saving gear to:", `${window.API_BASE}/api/tables/${this.tableId}/gear`);
      
      const payload = {
        lists: this.lists,
        checkOutDate: checkOutDate || '',
        checkInDate: checkInDate || ''
      };
      
      console.log("Payload:", JSON.stringify(payload, null, 2));
      
      const res = await fetch(`${window.API_BASE}/api/tables/${this.tableId}/gear`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Status ${res.status}: ${text}`);
      }
      
      console.log("Save successful!");
      return true;
    } catch (err) {
      console.error("Error saving gear:", err.message);
      return false;
    }
  },
  
  // Load lists and date context from server
  async load() {
    try {
      const res = await fetch(`${window.API_BASE}/api/tables/${this.tableId}/gear`, {
        headers: { Authorization: token }
      });
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Status ${res.status}: ${text}`);
      }
      
      const data = await res.json();
      
      // Handle the new format or convert from old format
      if (data.lists) {
        // Check if it's in the new format with meta/categories structure
        const firstList = Object.values(data.lists)[0];
        if (firstList && firstList.categories) {
          // New format, use directly
          this.lists = data.lists;
        } else {
          // Old format, convert
          const convertedLists = {};
          
          Object.keys(data.lists).forEach(listName => {
            convertedLists[listName] = {
              meta: {
                description: "",
                created: new Date().toISOString()
              },
              categories: data.lists[listName]
            };
          });
          
          this.lists = convertedLists;
        }
        
        // Set active list if none
        if (!this.activeList || !this.lists[this.activeList]) {
          this.activeList = Object.keys(this.lists)[0] || null;
        }
      }
      
      // If no lists exist, create a default one
      if (Object.keys(this.lists).length === 0) {
        this.createList("Main Kit", "Primary equipment for this event");
      }
      
      return {
        checkOutDate: data.checkOutDate,
        checkInDate: data.checkInDate
      };
    } catch (err) {
      console.error("Error loading gear:", err.message);
      
      // Create a default list if failed to load
      if (Object.keys(this.lists).length === 0) {
        this.createList("Main Kit", "Primary equipment for this event");
      }
      
      return { checkOutDate: '', checkInDate: '' };
    }
  },
  
  // Update gear data from DOM
  updateFromDOM() {
    if (!this.activeList || !this.lists[this.activeList]) return;
    
    document.querySelectorAll(".category").forEach(section => {
      const categoryName = section.querySelector("h3").textContent;
      
      if (!categories.includes(categoryName)) return;
      
      const items = Array.from(section.querySelectorAll(".item:not([data-new-row='true'])")).map(row => {
        const text = row.querySelector("input[type='text']").value.trim();
        const checked = row.querySelector("input[type='checkbox']").checked;
        return text ? { label: text, checked } : null;
      }).filter(Boolean);
      
      this.lists[this.activeList].categories[categoryName] = items;
    });
  }
};

let saveTimeout = null;
let filterSetting = 'all';
let gearInventory = [];
let isOwner = false;
let pendingProceed = false;

console.log("Using API_BASE:", window.API_BASE);

// Fail-safe for missing config
if (!window.API_BASE || !token) {
  alert("Missing configuration: API_BASE or token is not set.");
  throw new Error("Missing API_BASE or token");
}

function goBack() {
  window.location.href = `event.html?id=${eventContext.tableId}`;
}

async function loadGear() {
  console.log("Token:", token);
  console.log("Table ID:", eventContext.tableId);
  console.log("API_BASE:", window.API_BASE);

  try {
    // Initialize event context
    if (!eventContext.init(tableId)) {
      console.error("Failed to initialize event context - missing tableId");
      return;
    }
    
    // Load gear data
    const dates = await eventContext.load();
    
    // Set date pickers if present
    console.log("Check out date from API:", dates.checkOutDate);
    console.log("Check in date from API:", dates.checkInDate);

    const checkoutDateEl = document.getElementById('checkoutDate');
    const checkinDateEl = document.getElementById('checkinDate');
    
    if (checkoutDateEl && dates.checkOutDate) {
      checkoutDateEl.value = dates.checkOutDate;
    }
    
    if (checkinDateEl && dates.checkInDate) {
      checkinDateEl.value = dates.checkInDate;
    }

    // --- Ensure isOwner is set before rendering gear ---
    await loadEventTitle();
    // Now render lists dropdown and gear
    populateGearListDropdown();
    renderGear();

    loadEventTitle();
  } catch (err) {
    console.error("Error loading gear:", err);
    document.getElementById('gearContainer').innerHTML =
      "<h3 style='color:red;'>Failed to load gear. Check console for details.</h3>";
  }
}

function deleteGearList() {
  if (!eventContext.activeList) return;
  
  if (Object.keys(eventContext.lists).length <= 1) {
      alert("You must keep at least one gear list.");
      return;
    }
  
  const confirmed = confirm(`Are you sure you want to delete the list "${eventContext.activeList}"?`);
    if (!confirmed) return;
  
  if (eventContext.deleteList(eventContext.activeList)) {
    populateGearListDropdown();
    renderGear();
    triggerAutosave();
  }
  }

async function loadEventTitle() {
    try {
    const res = await fetch(`${window.API_BASE}/api/tables/${eventContext.tableId}`, {
        headers: { Authorization: token }
      });
  
      if (!res.ok) throw new Error("Failed to fetch table");
  
      const table = await res.json();
    const userId = getUserIdFromToken();
    isOwner = Array.isArray(table.owners) && table.owners.includes(userId);
    
    // Update all UI elements based on permission level
    updatePermissionBasedUI();
    
      document.getElementById('eventTitle').textContent = table.title || 'Untitled Event';
    } catch (err) {
      console.error("Failed to load event title:", err);
      document.getElementById('eventTitle').textContent = "Untitled Event";
    }
  }
  
// Helper function to update list controls visibility
function updateListControlsVisibility() {
  const listControls = document.querySelectorAll('.list-controls');
  listControls.forEach(control => {
    control.style.display = isOwner ? 'flex' : 'none';
  });
  }

function getUserIdFromToken() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id;
  } catch {
    return null;
  }
}

function populateGearListDropdown() {
  const select = document.getElementById("gearListSelect");
  select.innerHTML = '';

  // Add list options
  Object.keys(eventContext.lists).forEach(listName => {
    const option = document.createElement("option");
    option.value = listName;
    option.textContent = listName;
    if (listName === eventContext.activeList) option.selected = true;
    select.appendChild(option);
  });

  // Add rename option - only for owners
  if (isOwner) {
    const renameOption = document.createElement("option");
    renameOption.value = "__rename__";
    renameOption.textContent = "✏️ Rename Current List";
    renameOption.style.fontStyle = "italic";
    renameOption.style.borderTop = "1px solid #ddd";
    select.appendChild(renameOption);
  }

  // For non-owners, disable the select to prevent changing lists
  select.disabled = !isOwner && Object.keys(eventContext.lists).length <= 1;

  select.onchange = () => {
    if (select.value === "__rename__") {
      // Reset selection first
      select.value = eventContext.activeList;
      
      // Show rename prompt
      const newName = prompt("Enter new name for the list:", eventContext.activeList);
      if (!newName || newName.trim() === "" || newName === eventContext.activeList) {
        return; // Cancelled or unchanged
      }
      
      // Check if name exists
      if (eventContext.lists[newName]) {
        alert("A list with this name already exists.");
        return;
      }
      
      // Rename list (create new with same content and delete old)
      eventContext.lists[newName] = JSON.parse(JSON.stringify(eventContext.lists[eventContext.activeList]));
      eventContext.deleteList(eventContext.activeList);
      eventContext.activeList = newName;
      
      // Update UI
      populateGearListDropdown();
      triggerAutosave();
    } else {
      // Normal list selection
      eventContext.switchList(select.value);
    renderGear();
    }
  };
  
  // Update all permission-based UI elements
  updatePermissionBasedUI();
}

function renderGear() {
  const container = document.getElementById("gearContainer");
  container.innerHTML = "";
  categories.forEach(createCategory);
  
  // Show active list description if available
  const listInfo = document.getElementById("listInfo");
  if (listInfo) {
    const currentList = eventContext.lists[eventContext.activeList];
    if (currentList && currentList.meta && currentList.meta.description) {
      listInfo.innerHTML = `<i>${currentList.meta.description}</i>`;
      listInfo.style.display = 'block';
    } else {
      listInfo.innerHTML = '';
      listInfo.style.display = 'none';
    }
  }
}

function getSelectedDates() {
  const checkOut = document.getElementById('checkoutDate').value;
  const checkIn = document.getElementById('checkinDate').value;
  return { checkOut, checkIn };
}

function isUnitAvailableForDates(unit, checkOut, checkIn) {
  // Must have both dates to check availability
  if (!checkOut || !checkIn) return false;
  
  // Add debug information
  console.log("Checking availability for: ", unit.label);
  console.log("Requested dates:", { checkOut, checkIn });
  console.log("Unit status:", unit.status);
  console.log("Unit history:", JSON.stringify(unit.history, null, 2));
  console.log("Current event ID:", eventContext.tableId);
  
  // Normalize dates to midnight for consistent comparison
  const normalizeDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    // Reset time part to midnight
    date.setUTCHours(0, 0, 0, 0);
    return date;
  };
  
  // Create normalized dates for the requested period
  const reqStart = normalizeDate(checkOut);
  const reqEnd = normalizeDate(checkIn);
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  
  // First check status - if already checked out, only consider it available
  // if it's checked out to THIS event
  if (unit.status === 'checked_out') {
    // IMPORTANT: Compare as strings since MongoDB IDs are objects
    const unitEventId = unit.checkedOutEvent ? unit.checkedOutEvent.toString() : unit.checkedOutEvent;
    
    // If the item is checked out to this event, it's available for use
    if (unitEventId === eventContext.tableId) {
      console.log("✅ Available: checked out to this event");
      return true;
    }
    
    // If it's checked out to another event, we need to check dates
    // Get current reservation dates
    const existingCheckOut = normalizeDate(unit.checkOutDate);
    const existingCheckIn = normalizeDate(unit.checkInDate);
    
    if (existingCheckOut && existingCheckIn) {
      // Case 1: Our requested dates end BEFORE the existing checkout starts
      if (reqEnd < existingCheckOut) {
        console.log("✅ Available: requested dates end before existing reservation starts");
        console.log(`Requested: ${reqStart.toISOString()} to ${reqEnd.toISOString()}`);
        console.log(`Existing: ${existingCheckOut.toISOString()} to ${existingCheckIn.toISOString()}`);
        return true;
      }
      
      // Case 2: Our requested dates start AFTER the existing checkin ends
      if (reqStart > existingCheckIn) {
        console.log("✅ Available: requested dates start after existing reservation ends");
        console.log(`Requested: ${reqStart.toISOString()} to ${reqEnd.toISOString()}`);
        console.log(`Existing: ${existingCheckOut.toISOString()} to ${existingCheckIn.toISOString()}`);
        return true;
      }
      
      console.log("❌ Not available: dates overlap with existing reservation");
      console.log(`Requested: ${reqStart.toISOString()} to ${reqEnd.toISOString()}`);
      console.log(`Existing: ${existingCheckOut.toISOString()} to ${existingCheckIn.toISOString()}`);
      return false;
    }
    
    // No valid dates on the current checkout, so it's not available
    console.log("❌ Not available: checked out to another event");
    return false;
  }
  
  // For available items, check history for conflicts
  console.log("Looking for conflicts in history entries...");
  
  // Check if there are any conflicting future reservations
  const hasConflict = (unit.history || []).some((entry, index) => {
    console.log(`Examining history entry ${index}:`, entry);
    
    // IMPORTANT: Compare event IDs properly, ensuring both are strings
    const entryEventId = entry.event ? entry.event.toString() : null;
    
    // Skip entries for this event - they've been cancelled/checked in
    if (entryEventId === eventContext.tableId) {
      console.log(`Entry ${index}: Skipping - belongs to this event (${entryEventId} === ${eventContext.tableId})`);
      return false;
    }
    
    if (!entry.checkOutDate || !entry.checkInDate) {
      console.log(`Entry ${index}: Skipping - missing dates`);
      return false;
    }
    
    const entryStart = normalizeDate(entry.checkOutDate);
    const entryEnd = normalizeDate(entry.checkInDate);
    
    // Skip if the reservation is in the past
    if (entryEnd < now) {
      console.log(`Entry ${index}: Skipping - past reservation (end: ${entryEnd.toISOString()}, now: ${now.toISOString()})`);
      return false;
    }
    
    // Check if the requested dates are completely before this reservation
    if (reqEnd < entryStart) {
      console.log(`Entry ${index}: No conflict - requested dates end before reservation starts`);
      console.log(`Requested: ${reqStart.toISOString()} to ${reqEnd.toISOString()}`);
      console.log(`Entry: ${entryStart.toISOString()} to ${entryEnd.toISOString()}`);
      return false;
    }
    
    // Check if the requested dates are completely after this reservation
    if (reqStart > entryEnd) {
      console.log(`Entry ${index}: No conflict - requested dates start after reservation ends`);
      console.log(`Requested: ${reqStart.toISOString()} to ${reqEnd.toISOString()}`);
      console.log(`Entry: ${entryStart.toISOString()} to ${entryEnd.toISOString()}`);
      return false;
    }
    
    // If neither of the above, there is an overlap
    console.log(`❌ Entry ${index}: CONFLICT FOUND!`);
    console.log("Conflict details:", { 
      reqStart: reqStart.toISOString(),
      reqEnd: reqEnd.toISOString(),
      entryStart: entryStart.toISOString(),
      entryEnd: entryEnd.toISOString()
    });
    return true;
  });
  
  // No conflicts means it's available
  if (!hasConflict) {
    console.log("✅ Available: No conflicts found in history");
  }
  return !hasConflict;
}

function createRow(item, isNewRow = false) {
  const safeLabel = item.label.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const el = document.createElement("div");
  el.className = "item";
  
  // Mark new blank rows for special handling
  if (isNewRow) {
    el.setAttribute('data-new-row', 'true');
  }
  
  // Create the checkbox and text input
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = item.checked;
  checkbox.disabled = false; // Allow all users to toggle checkboxes
  el.appendChild(checkbox);
  
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.value = safeLabel;
  textInput.readOnly = !isOwner; // Make read-only for non-owners
  
  // Add focus and blur handlers to track editing state for Socket.IO protection
  textInput.addEventListener('focus', () => {
    window.isActiveEditing = true;
    console.log('User started editing, pausing Socket.IO updates');
  });
  
  textInput.addEventListener('blur', () => {
    // Don't immediately clear editing flag on blur - give time for save operations
    setTimeout(() => {
      window.isActiveEditing = false;
      console.log('User finished editing, resuming Socket.IO updates');
    }, 500);
  });
  
  el.appendChild(textInput);
  
  // Set up checkbox change handler for all users, not just non-owners
  checkbox.addEventListener('change', () => {
    // Update the item in memory
    const items = eventContext.getItems(el.closest('.category').querySelector('h3').textContent);
    const itemIndex = items.findIndex(i => i.label === item.label);
    
    if (itemIndex !== -1) {
      items[itemIndex].checked = checkbox.checked;
      
      // Trigger save to update the server - this ensures real-time updates
      triggerAutosave();
    }
  });
  
  // Only add delete button for owners
  if (isOwner) {
    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Delete item';
    deleteBtn.className = 'delete-btn';
    deleteBtn.style.marginLeft = '8px';
    deleteBtn.style.color = '#CC0007'; // Add red color for visibility
    deleteBtn.style.fontSize = '18px'; // Increase font size
    deleteBtn.style.background = '#f8f8f8'; // Light background for contrast
    deleteBtn.style.border = '1px solid #ddd'; // Add border
    deleteBtn.style.borderRadius = '4px'; // Rounded corners
    deleteBtn.style.padding = '2px 6px'; // Add padding
    deleteBtn.style.cursor = 'pointer'; // Show pointer cursor on hover
    deleteBtn.style.opacity = '1'; // Ensure full opacity
    deleteBtn.style.flexShrink = '0'; // Prevent button from shrinking
    
    // Add hover effect
    deleteBtn.onmouseover = () => {
      deleteBtn.style.background = '#ffeeee';
      deleteBtn.style.borderColor = '#CC0007';
    };
    deleteBtn.onmouseout = () => {
      deleteBtn.style.background = '#f8f8f8';
      deleteBtn.style.borderColor = '#ddd';
    };
    
    deleteBtn.onclick = async () => {
      // If this item is a reserved inventory item, check it in
      const reserved = gearInventory.find(g => g.label === item.label && g.checkedOutEvent === eventContext.tableId);
      if (reserved && reserved.status === 'checked_out') {
        try {
          await fetch(`${window.API_BASE}/api/gear-inventory/checkin`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: token
            },
            body: JSON.stringify({
              gearId: reserved._id,
              eventId: eventContext.tableId,
              checkOutDate: reserved.checkOutDate,
              checkInDate: reserved.checkInDate
            })
          });
          await loadGearInventory();
        } catch (err) {
          console.error('Failed to check in gear:', err);
        }
      }
      
      // Remove the row from the DOM
      el.remove();
      
      // Trigger save unless it's a new blank row
      if (!isNewRow) {
        triggerAutosave();
      }
    };
    
    el.appendChild(deleteBtn);
  }
  
  // Only set up editing handlers for owners
  if (isOwner) {
    // Save changes when input is modified
    textInput.addEventListener('input', (e) => {
      // For new rows, we'll handle saving in the blur event
      if (!isNewRow) {
        // Add a data attribute to indicate this element has unsaved changes
        el.setAttribute('data-has-changes', 'true');
        
        // When a user is actively typing, don't trigger saves immediately
        // This prevents navigation issues during typing
        clearTimeout(el.saveTimer);
        el.saveTimer = setTimeout(() => {
          // Only save if element is still in the DOM
          if (el.isConnected && document.contains(el)) {
            triggerAutosave();
          }
        }, 2000); // Wait 2 seconds after typing stops before saving
      }
    });
    
    // Add Enter key handler for all text inputs
    textInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        
        if (isNewRow) {
          // For new blank rows, first validate the current one
          textInput.blur(); // This will trigger the blur validation
          
          // If validation passed, the data-new-row attribute will be removed
          if (!el.hasAttribute('data-new-row')) {
            // Find the parent list and add another blank row
            const parentList = el.closest('.item-list');
            if (parentList) {
              // Find the add button and click it to add another row
              const category = el.closest('.category');
              if (category) {
                const addBtn = category.querySelector('.add-btn');
                if (addBtn) {
                  addBtn.click();
                }
              }
            }
          }
        } else {
          // For existing rows, save the current item first
          eventContext.updateFromDOM();
          const checkOutDate = document.getElementById('checkoutDate')?.value || '';
          const checkInDate = document.getElementById('checkinDate')?.value || '';
          eventContext.save(checkOutDate, checkInDate);
          
          // Then add a new row
          const parentList = el.closest('.item-list');
          if (parentList) {
            const category = el.closest('.category');
            if (category) {
              const addBtn = category.querySelector('.add-btn');
              if (addBtn) {
                addBtn.click();
              }
            }
          }
        }
      }
    });

    // Add tab key handling to improve navigation
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey) {
        // Find the next row's input to focus on
        const parentList = el.closest('.item-list');
        if (!parentList) return;
        
        const allRows = Array.from(parentList.querySelectorAll('.item'));
        const currentIndex = allRows.indexOf(el);
        
        // If there's no next row and we're not pressing shift, add a new one
        if (currentIndex === allRows.length - 1) {
          // Find the category and add button
          const category = el.closest('.category');
          if (category) {
            e.preventDefault(); // Prevent normal tab behavior
            const addBtn = category.querySelector('.add-btn');
            if (addBtn) {
              addBtn.click();
            }
          }
        }
      }
    });
  }
  
  // Focus on the input field for immediate editing
  const input = textInput;
  if (input) {
    input.focus();
    
    // Add validation on blur to ensure the field isn't empty
    input.addEventListener('blur', async (e) => {
      try {
        // Don't process this event if we're blurring due to page navigation or reload
        if (document.visibilityState === 'hidden' || document.readyState !== 'complete') {
          return;
        }
        
        if (input.value.trim() === '') {
          // If left empty and user moves away, remove the row
          el.remove();
        } else {
          // Valid input, trigger IMMEDIATE save and remove the new row marker
          el.removeAttribute('data-new-row');
          
          // IMMEDIATELY save to database to prevent data loss on refresh
          eventContext.updateFromDOM();
          const checkOutDate = document.getElementById('checkoutDate')?.value || '';
          const checkInDate = document.getElementById('checkinDate')?.value || '';
          await eventContext.save(checkOutDate, checkInDate);
          
          // Now allow refreshes to resume after successful save
          setTimeout(() => {
            window.isActiveEditing = false;
            console.log('Item saved and editing completed');
          }, 200);
        }
      } catch (err) {
        console.error('Error saving new item:', err);
      }
    });
  }
  
  return el;
}

function createCategory(name) {
  const container = document.getElementById("gearContainer");
  
  const section = document.createElement("div");
  section.className = "category";
  
  const header = document.createElement("h3");
  header.textContent = name;
  section.appendChild(header);
  
  const list = document.createElement("div");
  list.className = "item-list";
  section.appendChild(list);
  
  // Get current items or empty array
  const items = eventContext.getItems(name) || [];
  
  // Only show buttons for owners
  if (isOwner) {
    // Add inventory button for checkouts
    const checkoutBtn = document.createElement("button");
    checkoutBtn.className = "checkout-btn";
    checkoutBtn.textContent = "📋 Use Inventory";
    checkoutBtn.title = "Check out from inventory";

    const dates = getSelectedDates();
    
    checkoutBtn.onclick = async () => {
      try {
        // Check for dates
        if (!dates.checkOut || !dates.checkIn) {
          alert("Please set the check-out and check-in dates first.");
          return;
        }
        
        // Get available units from inventory
        const availableUnits = gearInventory
          .filter(unit => {
            // Check category match
            if (!checkByCategory(unit, name)) {
              return false;
            }
            // Only show if available for the selected dates
            return isUnitAvailableForDates(unit, dates.checkOut, dates.checkIn);
          });
        
        openCheckoutModal(name, availableUnits, dates.checkOut, dates.checkIn, list);
      } catch (err) {
        console.error("Error opening checkout modal:", err);
      }
    };

    // Add + Add Item button for manual row addition
    const addRowBtn = document.createElement("button");
    addRowBtn.className = "add-btn";
    addRowBtn.textContent = "+ Add Item";
    addRowBtn.title = "Add a custom row";
    addRowBtn.onclick = () => {
      // Set active editing flag to prevent Socket.IO updates
      window.isActiveEditing = true;
      
      // Create a blank row instead of showing a prompt
      const newItem = { label: "", checked: false };
      const row = createRow(newItem, true); // Add true parameter to indicate it's a new blank row
      list.appendChild(row);
      
      // Focus on the input field for immediate editing
      const input = row.querySelector('input[type="text"]');
      if (input) {
        input.focus();
        
        // Add validation on blur to ensure the field isn't empty
        input.addEventListener('blur', async (e) => {
          try {
            // Don't process this event if we're blurring due to page navigation or reload
            if (document.visibilityState === 'hidden' || document.readyState !== 'complete') {
              return;
            }
            
            if (input.value.trim() === '') {
              // If left empty and user moves away, remove the row
              row.remove();
            } else {
              // Valid input, trigger IMMEDIATE save and remove the new row marker
              row.removeAttribute('data-new-row');
                
              // IMMEDIATELY save to database to prevent data loss on refresh
              eventContext.updateFromDOM();
              const checkOutDate = document.getElementById('checkoutDate')?.value || '';
              const checkInDate = document.getElementById('checkinDate')?.value || '';
              await eventContext.save(checkOutDate, checkInDate);
              
              // Now allow refreshes to resume after successful save
              setTimeout(() => {
                window.isActiveEditing = false;
                console.log('Item saved and editing completed');
              }, 200);
            }
          } catch (err) {
            console.error('Error saving new item:', err);
          }
        });
      }
    };
    
    // Add buttons in button row
    const buttonRow = document.createElement("div");
    buttonRow.className = "button-row";
    
    buttonRow.appendChild(checkoutBtn);
    buttonRow.appendChild(addRowBtn);
    
    section.appendChild(buttonRow);
  }
  
  // Add items to the list, filtering based on filterSetting
  items.forEach(item => {
    if (item && item.label) { // Only add if the item has a label
      // Apply filter based on user selection
      if ((filterSetting === "checked" && !item.checked) || 
          (filterSetting === "unchecked" && item.checked)) {
        return; // Skip this item if it doesn't match filter
      }
      
      const row = createRow(item);
      list.appendChild(row);
    }
  });
  
  container.appendChild(section);
  
  return section;
}

function collectGearData() {
  const data = {};
  categories.forEach(cat => {
    const categorySection = document.querySelector(`.category h3:contains('${cat}')`).closest('.category');
    if (!categorySection) {
      data[cat] = [];
      return;
    }
    
    const items = Array.from(categorySection.querySelectorAll('.item')).map(row => {
      const text = row.querySelector('input[type="text"]').value.trim();
      const checked = row.querySelector('input[type="checkbox"]').checked;
      return text ? { label: text, checked } : null;
    }).filter(Boolean);
    
    data[cat] = items;
  });
  return data;
}

// Utility to check if a gear item is available for selected dates
function isGearItemAvailable(label, checkOut, checkIn) {
  const gear = gearInventory.find(g => g.label === label);
  if (!gear) return true; // custom/manual item
  if (!checkOut || !checkIn) return true;
  
  // Use the same function for consistency
  return isUnitAvailableForDates(gear, checkOut, checkIn);
}

// Highlight unavailable items
function highlightUnavailableItems(unavailableLabels) {
  document.querySelectorAll('.item').forEach(row => {
    const input = row.querySelector("input[type='text']");
    if (input && unavailableLabels.includes(input.value.trim())) {
      row.style.background = '#fff3cd';
      row.style.border = '2px solid #cc0007';
    } else {
      row.style.background = '';
      row.style.border = '';
    }
  });
}

// Show/hide unavailable warning modal
function showUnavailableWarningModal(unavailable, onProceed) {
  const modal = document.getElementById('unavailableWarningModal');
  const content = document.getElementById('unavailableWarningContent');
  content.innerHTML = `⚠️ The following items will be removed if you proceed with these dates:<br><b>${unavailable.join(', ')}</b>`;
  modal.style.display = 'flex';
  modal.classList.add('show');
  document.getElementById('unavailableProceedBtn').onclick = () => {
    modal.style.display = 'none';
    modal.classList.remove('show');
    onProceed();
  };
  document.getElementById('unavailableCancelBtn').onclick = () => {
    modal.style.display = 'none';
    modal.classList.remove('show');
  };
}

// Update checkUnavailableItemsAndWarn to use modal
function checkUnavailableItemsAndWarn() {
  // Validate date range first
  if (!validateDateRange()) {
    return; // Don't proceed if dates are invalid
  }
  
  const { checkOut, checkIn } = getSelectedDates();
  const unavailable = [];
  document.querySelectorAll('.item input[type="text"]').forEach(input => {
    const label = input.value.trim();
    if (!isGearItemAvailable(label, checkOut, checkIn)) {
      unavailable.push(label);
    }
  });
  highlightUnavailableItems(unavailable);
  if (unavailable.length) {
    showUnavailableWarningModal(unavailable, () => {
      pendingProceed = true;
      saveGear();
      pendingProceed = false;
    });
  } else {
    document.getElementById('gearStatusMessage').textContent = '';
  }
}

async function saveGear() {
  try {
    // Update data from DOM
    eventContext.updateFromDOM();
    
    // Get date fields
    const checkOutDate = document.getElementById('checkoutDate')?.value || '';
    const checkInDate = document.getElementById('checkinDate')?.value || '';
    
    // Save to server
    const success = await eventContext.save(checkOutDate, checkInDate);
    
    if (!success) {
      throw new Error("Save failed");
    }
  } catch (err) {
    console.error("Error saving gear:", err.message);
    alert("Failed to save checklist. See console for details.");
  }
}

// Patch saveGear to respect confirmation (must run after saveGear is defined)
if (typeof saveGear === 'function') {
  const originalSaveGear = saveGear;
  saveGear = function() {
    const { checkOut, checkIn } = getSelectedDates();
    const unavailable = [];
    document.querySelectorAll('.item input[type="text"]').forEach(input => {
      const label = input.value.trim();
      if (!isGearItemAvailable(label, checkOut, checkIn)) {
        unavailable.push(label);
      }
    });
    if (unavailable.length && !pendingProceed) {
      checkUnavailableItemsAndWarn();
      return; // Wait for user confirmation
    }
    // Remove unavailable items before saving
    document.querySelectorAll('.item').forEach(row => {
      const input = row.querySelector("input[type='text']");
      if (input && unavailable.includes(input.value.trim())) {
        row.remove();
      }
    });
    originalSaveGear();
  };
}

// Listen for date changes to trigger warning logic
['checkoutDate', 'checkinDate'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('change', checkUnavailableItemsAndWarn);
  }
});

function triggerAutosave() {
  // Set flag to indicate editing
  window.isActiveEditing = true;
  
  // Set a delay before triggering save to avoid excessive requests
  if (saveTimeout) clearTimeout(saveTimeout);
  
  saveTimeout = setTimeout(async () => {
    try {
      // Don't load from eventContext.update until this timeout because
      // it needs time for data to enter DOM
      eventContext.updateFromDOM();
      await saveGear();
      
      // Clear the editing flag when save completes
      window.isActiveEditing = false;
      
      // If there's a pending reload from Socket.IO updates, do it now
      if (window.pendingReload) {
        console.log('Processing pending reload after edit completion');
        window.pendingReload = false;
        loadGear();
      }
    } catch (err) {
      console.error('Error in autosave:', err);
      // Still clear the editing flag even if there's an error
      window.isActiveEditing = false;
    }
  }, 2000);
}

function createNewGearList() {
  // Get name from prompt
  const name = prompt("Enter a name for the new gear list:")?.trim();
  if (!name) return;
  
  // Check if name already exists
  if (eventContext.lists[name]) {
    alert("A list with this name already exists.");
    return;
  }
  
  // Get optional description
  const description = prompt("Enter an optional description for this list:")?.trim() || "";
  
  // Create the new list
  if (eventContext.createList(name, description)) {
    eventContext.switchList(name);
  populateGearListDropdown();
  renderGear();
  triggerAutosave();
  }
}

async function loadGearInventory() {
  try {
    console.log('[gear.js] Loading gear inventory from API');
    const res = await fetch(`${window.API_BASE}/api/gear-inventory`, {
      headers: { Authorization: token }
    });
    
    if (!res.ok) throw new Error(`Status ${res.status}`);
    gearInventory = await res.json();
    console.log(`[gear.js] Loaded ${gearInventory.length} inventory items`);
    renderInventoryStatus();
  } catch (err) {
    console.error('Failed to load gear inventory:', err);
  }
}

// Remove inventory status display
function renderInventoryStatus() {
  // No-op: inventory status is no longer shown
  const container = document.getElementById('gearStatusMessage');
  if (container) container.style.display = 'none';
}

// Modal logic
function openCheckoutModal(category, availableUnits, checkOut, checkIn, list) {
  const modal = document.getElementById('checkoutModal');
  const modalList = document.getElementById('modalItemList');
  const modalTitle = document.getElementById('modalTitle');
  
  // Get all items already in the list
  const existingItems = Array.from(list.querySelectorAll('.item input[type=\"text\"]'))
    .map(input => input.value.trim());
  
  console.log("Existing items in this list:", existingItems);
  
  // Filter out units that are:
  // 1. Already in any list for this event
  // 2. Not available for the selected dates
  const availableUnitsFiltered = availableUnits.filter(unit => {
    // Skip if already in any list
    if (eventContext.isItemInAnyList(unit.label)) {
      return false;
    }
    // Only show if available for the selected dates
    return isUnitAvailableForDates(unit, checkOut, checkIn);
  });
  
  console.log(`Original available units: ${availableUnits.length}, after filtering: ${availableUnitsFiltered.length}`);
  
  // Sort the filtered units alphabetically by label
  availableUnitsFiltered.sort((a, b) => a.label.localeCompare(b.label));
  
  modalTitle.textContent = `Select ${category} Item to Check Out`;
  
  let modalContent = '';
  
  // Add an explanatory note
  if (availableUnits.length > availableUnitsFiltered.length) {
    const filteredOut = availableUnits.length - availableUnitsFiltered.length;
    modalContent += `<p style="color: #666; font-size: 14px; margin-bottom: 16px;">
      Note: ${filteredOut} item(s) already in use have been hidden.
    </p>`;
  }
  
  if (availableUnitsFiltered.length === 0) {
    modalContent += `<p>No available items found.</p>`;
    modalList.innerHTML = modalContent;
  } else {
    modalContent += availableUnitsFiltered
      .map(unit => {
        let statusLabel = '';
        if (isUnitAvailableForDates(unit, checkOut, checkIn)) {
          statusLabel = '<span style="color: green">Available</span>';
        } else if (unit.status === 'checked_out' && unit.checkedOutEvent === eventContext.tableId) {
          statusLabel = '<span style="color: blue">Already checked out to this event</span>';
        } else {
          statusLabel = '<span style="color: red">Checked Out</span>';
        }
        return `<button class="modal-item-btn" data-id="${unit._id}">${unit.label} (${statusLabel})</button>`;
      })
      .join('');
    
    modalList.innerHTML = modalContent;
  }
  
  // Add event listeners for item buttons
  modalList.querySelectorAll('.modal-item-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const unitId = btn.dataset.id;
      const unit = availableUnitsFiltered.find(u => u._id === unitId);
      
      if (!unit) return;
      
      try {
        console.log(`Checking out: ${unit.label} for event: ${eventContext.tableId}`);
        console.log(`Dates: ${checkOut} to ${checkIn}`);
        
        if (!checkOut || !checkIn) {
          alert("Please set check-out and check-in dates first");
          modal.style.display = 'none';
          return;
        }
        
        // Call the API to check out this item
        const res = await fetch(`${window.API_BASE}/api/gear-inventory/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token
          },
          body: JSON.stringify({
            gearId: unit._id,
            eventId: eventContext.tableId,
            checkOutDate: checkOut,
            checkInDate: checkIn
          })
        });
        
        if (!res.ok) {
          const error = await res.text();
          throw new Error(error);
        }
        
        // Close the modal
        modal.style.display = 'none';
        
        // Add to the gear list
        const row = createRow({ label: unit.label, checked: false });
        list.appendChild(row);
        
        // Track that this was successfully added
        unit.checkedOutEvent = eventContext.tableId;
        unit.status = 'checked_out';
        
        // Refresh inventory status & highlights
        await loadGearInventory();
        checkUnavailableItemsAndWarn();
        
        // Save changes to the list and dates
        triggerAutosave();
        
        document.getElementById('gearStatusMessage').innerHTML = `
          <div style="background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
            <strong>Success:</strong> ${unit.label} has been checked out for your event.
          </div>
        `;
        setTimeout(() => {
          document.getElementById('gearStatusMessage').innerHTML = '';
        }, 5000);
        
      } catch (err) {
        console.error("Error checking out item:", err);
        document.getElementById('gearStatusMessage').innerHTML = `
          <div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
            <strong>Error:</strong> ${err.message}
          </div>
        `;
      }
    });
  });
  
  // Set up cancel button
  document.getElementById('closeModalBtn').onclick = () => {
    modal.style.display = 'none';
  };
  
  // Show the modal
  modal.style.display = 'flex';
  
  // Ensure the modal is centered within the viewport
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  
  // Add a small timeout to make sure styles are applied
  setTimeout(() => {
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      // Get viewport height
      const viewportHeight = window.innerHeight;
      // Set max height to 80% of viewport
      modalContent.style.maxHeight = `${viewportHeight * 0.8}px`;
    }
  }, 10);
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModal');
  modal.style.display = 'none';
  modal.classList.remove('show');
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadGear();
    
    // loadEventTitle will update list controls visibility
    await loadEventTitle();
    
    await loadGearInventory();
    
    document.getElementById('gearContainer').addEventListener('input', triggerAutosave);
    document.getElementById('gearContainer').addEventListener('change', triggerAutosave);
    document.getElementById("filterCheckbox").addEventListener("change", e => {
      filterSetting = e.target.value;
      renderGear();
    });
    document.getElementById('checkoutDate').addEventListener('change', triggerAutosave);
    document.getElementById('checkinDate').addEventListener('change', triggerAutosave);
  } catch (err) {
    console.error("Error initializing gear page:", err);
  }
  });
  
  function initPage(id) {
    try {
      // Initialize event context
      if (!eventContext.init(id)) {
        alert("Missing configuration: tableId is not set.");
      throw new Error("Missing configuration");
    }
  
      // Load data
    loadGear();
      
      // Just call loadEventTitle directly - it will update list controls visibility
    loadEventTitle();
  
      loadGearInventory();
  
      // Set up event listeners
    document.getElementById('gearContainer').addEventListener('input', triggerAutosave);
    document.getElementById('gearContainer').addEventListener('change', triggerAutosave);
    document.getElementById("filterCheckbox").addEventListener("change", e => {
      filterSetting = e.target.value;
      renderGear();
    });
      document.getElementById('checkoutDate').addEventListener('change', triggerAutosave);
      document.getElementById('checkinDate').addEventListener('change', triggerAutosave);
    } catch (err) {
      console.error("Error initializing gear page:", err);
    }
  }
  
  // ✅ Important: make initPage visible to app.js
  window.initPage = initPage;
  
  // Expose functions on window
  window.goBack = goBack;
  window.deleteGearList = deleteGearList;
  window.createNewGearList = createNewGearList;
  window.saveGear = saveGear;
  window.saveGearList = saveGearList;
  window.triggerAutosave = triggerAutosave;
  // Expose loadGear to allow Socket.IO to refresh the page when changes occur
  window.loadGear = loadGear;

  // Add listeners to re-render inventory status on date change
  ['checkoutDate', 'checkinDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', renderInventoryStatus);
    }
  });
  
  // Validate date range and show warning if invalid
  function validateDateRange() {
    const checkOut = document.getElementById('checkoutDate')?.value;
    const checkIn = document.getElementById('checkinDate')?.value;
    const statusMessage = document.getElementById('gearStatusMessage');
    
    // Clear any existing validation error styles
    const outField = document.getElementById('checkoutDate');
    const inField = document.getElementById('checkinDate');
    outField.style.borderColor = '';
    inField.style.borderColor = '';
    
    // Check if both dates are selected
    if (!checkOut || !checkIn) {
      return true; // No validation needed yet
    }
    
    // Create Date objects from selected dates
    const checkOutDate = new Date(checkOut);
    const checkInDate = new Date(checkIn);
    
    // Check if check-out date is after check-in date
    if (checkOutDate > checkInDate) {
      // Show error and highlight fields
      statusMessage.innerHTML = `<div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
        <strong>Invalid date range:</strong> Check-in date must be after check-out date
      </div>`;
      
      outField.style.borderColor = 'red';
      inField.style.borderColor = 'red';
      
      // Disable action buttons while invalid
      document.querySelectorAll('.add-btn').forEach(btn => {
        if (btn.textContent.includes('Checkout Item')) {
          btn.disabled = true;
          btn.title = 'Fix date range first';
        }
      });
      
      return false;
    }
    
    // Re-enable checkout buttons
    document.querySelectorAll('.add-btn').forEach(btn => {
      if (btn.textContent.includes('Checkout Item')) {
        btn.disabled = false;
        btn.title = 'Reserve available inventory unit';
      }
    });
    
    return true; // Valid date range
  }
  
  // Call validation on date changes
  ['checkoutDate', 'checkinDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        const isValid = validateDateRange();
        if (isValid) {
          checkUnavailableItemsAndWarn();
        }
      });
    }
  });

  // Save gear list to server
  function saveGearList() {
    saveGear().then(() => {
      document.getElementById('gearStatusMessage').innerHTML = `
        <div style="background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
          <strong>Success:</strong> Gear list saved.
        </div>
      `;
      setTimeout(() => {
        document.getElementById('gearStatusMessage').innerHTML = '';
      }, 3000);
    }).catch(err => {
      document.getElementById('gearStatusMessage').innerHTML = `
        <div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
          <strong>Error:</strong> Failed to save gear list: ${err.message}
        </div>
      `;
    });
  }

  // Helper to check if unit belongs to the category
  function checkByCategory(unit, category) {
    if (!unit || !unit.category) return false;
    
    // Direct category match (exact match)
    if (unit.category === category) return true;
    
    // Handle subcategories based on common rules:
    
    // Cameras and related items
    if (category === "Cameras") {
      return /camera|body|dslr|mirrorless/i.test(unit.category);
    }
    
    // Lenses and optics
    if (category === "Lenses") {
      return /lens|zoom|prime|telephoto|wide|macro/i.test(unit.category);
    }
    
    // Lighting equipment
    if (category === "Lighting") {
      return /light|flash|strobe|softbox|umbrella|modifier|diffuser/i.test(unit.category);
    }
    
    // Support equipment
    if (category === "Support") {
      return /tripod|monopod|gimbal|stabilizer|rig|stand|mount/i.test(unit.category);
    }
    
    // Accessories (catch-all for remaining items)
    if (category === "Accessories") {
      return !/camera|lens|light|tripod|monopod|gimbal/i.test(unit.category);
    }
    
    return false;
  }

  // Helper function to update permissions-based UI elements
  function updatePermissionBasedUI() {
    // Update list controls visibility
    const listControls = document.querySelectorAll('.list-controls');
    listControls.forEach(control => {
      control.style.display = isOwner ? 'flex' : 'none';
    });
    
    // Control editability of date fields
    const dateFields = ['checkoutDate', 'checkinDate'];
    dateFields.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.disabled = !isOwner;
        // Add visual indication for non-owners
        el.style.opacity = isOwner ? '1' : '0.7';
        el.title = isOwner ? '' : 'Only owners can change dates';
      }
    });
    
    // Control visibility of save button
    const saveBtn = document.querySelector('button[onclick="saveGearList()"]');
    if (saveBtn) {
      saveBtn.style.display = isOwner ? 'inline-block' : 'none';
    }
    
    // Add admin link to manage gear inventory if user is admin
    const isAdmin = checkAdminRole();
    if (isAdmin) {
      // Check if admin link already exists to avoid duplicates
      let adminLink = document.getElementById('adminGearLink');
      if (!adminLink) {
        const controlsDiv = document.querySelector('.gear-controls');
        adminLink = document.createElement('a');
        adminLink.id = 'adminGearLink';
        adminLink.href = '/pages/add-gear.html';
        adminLink.className = 'admin-gear-link';
        adminLink.innerHTML = '⚙️ Manage Gear Inventory';
        adminLink.style.display = 'inline-block';
        adminLink.style.backgroundColor = '#444';
        adminLink.style.color = 'white';
        adminLink.style.padding = '8px 16px';
        adminLink.style.borderRadius = '8px';
        adminLink.style.textDecoration = 'none';
        adminLink.style.fontWeight = 'bold';
        adminLink.style.marginTop = '10px';
        adminLink.style.marginBottom = '10px';
        adminLink.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        
        // Add to DOM
        if (controlsDiv) {
          controlsDiv.appendChild(adminLink);
        }
      }
    }
    
    // Make gear container read-only mode for non-owners (but allow checkbox toggling)
    const gearContainer = document.getElementById('gearContainer');
    if (gearContainer) {
      gearContainer.classList.toggle('read-only-mode', !isOwner);

      // For non-owners, make sure checkboxes remain interactive
      if (!isOwner) {
        // Remove 'not-allowed' cursor from checkboxes in read-only mode
        const style = document.createElement('style');
        style.id = 'checkbox-override-style';
        style.textContent = `
          .read-only-mode .item input[type="checkbox"] {
            cursor: pointer !important;
          }
        `;
        
        // Remove any existing style first to avoid duplicates
        const existingStyle = document.getElementById('checkbox-override-style');
        if (existingStyle) {
          existingStyle.remove();
        }
        
        document.head.appendChild(style);
      }
    }
  }

  // Check if the current user has admin role
  function checkAdminRole() {
    try {
      const token = localStorage.getItem('token');
      if (!token) return false;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.role === 'admin';
    } catch {
      return false;
    }
  }
})();
  
  
