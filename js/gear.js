(function() {
const categories = ["Cameras", "Lenses", "Lighting", "Support", "Accessories"];

const token = window.token || (window.token = localStorage.getItem('token'));

const params = new URLSearchParams(window.location.search);
let tableId = params.get('id') || localStorage.getItem('eventId');

// Socket.IO real-time updates - IMPROVED IMPLEMENTATION
if (window.socket) {
  // Track if the user is currently editing a field
  window.isActiveEditing = false;
  // Track pending reloads with their tableId
  window.pendingReload = false;
  window.pendingReloadTableId = null;
  
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
      window.pendingReloadTableId = data?.tableId || currentTableId;
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
      window.pendingReloadTableId = data?.tableId || currentTableId;
    }
  });
  
  // Log connection status changes
  window.socket.on('connect', () => {
    console.log('Socket.IO connected - Gear page will receive live updates');
  });
  
  window.socket.on('disconnect', () => {
    console.log('Socket.IO disconnected - Gear page live updates paused');
  });

  // --- Granular gear list events ---
  window.socket.on('gearListAdded', (data) => {
    const currentTableId = localStorage.getItem('eventId');
    if (!data || data.tableId !== currentTableId || !data.listName || !data.list) return;
    // Add the new list to eventContext and update UI
    eventContext.lists[data.listName] = data.list;
    populateGearListDropdown();
    renderGear();
  });
  window.socket.on('gearListUpdated', (data) => {
    const currentTableId = localStorage.getItem('eventId');
    if (!data || data.tableId !== currentTableId || !data.listName || !data.list) return;
    // Update the list in eventContext and update UI
    eventContext.lists[data.listName] = data.list;
    // If the updated list is active, re-render gear
    if (eventContext.activeList === data.listName) {
      renderGear();
    }
  });
  window.socket.on('gearListDeleted', (data) => {
    const currentTableId = localStorage.getItem('eventId');
    if (!data || data.tableId !== currentTableId || !data.listName) return;
    // Remove the list from eventContext and update UI
    delete eventContext.lists[data.listName];
    // If the deleted list was active, switch to another
    if (eventContext.activeList === data.listName) {
      eventContext.activeList = Object.keys(eventContext.lists)[0] || null;
    }
    populateGearListDropdown();
    renderGear();
  });
  // Remove old gearChanged event listener
  // window.socket.on('gearChanged', ...); // Remove or comment out
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
          Authorization: localStorage.getItem('token')
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
        headers: { Authorization: localStorage.getItem('token') }
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
        // Preserve inventoryId if present
        const inventoryId = row.getAttribute('data-inventory-id');
        if (!text) return null;
        const item = { label: text, checked };
        if (inventoryId) item.inventoryId = inventoryId;
        
        // Find existing item to preserve checkout dates
        const existingItems = this.lists[this.activeList].categories[categoryName] || [];
        const existingItem = existingItems.find(existing => existing.label === text);
        if (existingItem) {
          // Preserve checkout dates if they exist
          if (existingItem.checkOutDate) item.checkOutDate = existingItem.checkOutDate;
          if (existingItem.checkInDate) item.checkInDate = existingItem.checkInDate;
          if (existingItem.quantity) item.quantity = existingItem.quantity;
        }
        
        return item;
      }).filter(Boolean);
      
      this.lists[this.activeList].categories[categoryName] = items;
    });
  },
  
  // NEW: Get current gear list data for saving as a package
  getCurrentGearData() {
    this.updateFromDOM(); // Make sure data is up to date
    
    // Create package data with inventory info
    const packageData = {
      name: "",
      description: "",
      categories: {},
      inventoryIds: [] // Store inventory item IDs for re-loading
    };
    
    // For each category, get items and check if they're inventory items
    categories.forEach(category => {
      packageData.categories[category] = [];
      
      const items = this.getItems(category) || [];
      items.forEach(item => {
        // Check if this is an inventory item
        const inventoryItem = gearInventory.find(g => g.label === item.label);
        if (inventoryItem) {
          // Store as inventory item
          packageData.categories[category].push({
            label: item.label,
            checked: item.checked,
            isInventory: true,
            inventoryId: inventoryItem._id,
            serial: inventoryItem.serial // Add serial number
          });
          
          // Also add to flat list of inventory IDs
          packageData.inventoryIds.push(inventoryItem._id);
        } else {
          // Store as custom item
          packageData.categories[category].push({
            label: item.label,
            checked: item.checked,
            isInventory: false
          });
        }
      });
    });
    
    return packageData;
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
        headers: { Authorization: localStorage.getItem('token') }
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
  if (!checkOut || !checkIn) return unit.status === 'available';
  
  const normalizeDate = (dateStr) => {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  };
  
  const reqStart = normalizeDate(checkOut);
  const reqEnd = normalizeDate(checkIn);
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  
  // Debug logging for items that might have issues
  if (unit.label && unit.label.includes('Sony A7IV-D')) {
    console.log(`[AVAILABILITY DEBUG] Checking ${unit.label} for dates ${checkOut} to ${checkIn}`);
    console.log(`[AVAILABILITY DEBUG] Unit data:`, {
      status: unit.status,
      quantity: unit.quantity,
      reservations: unit.reservations,
      history: unit.history
    });
  }
  
  // For quantity items, check if any units are available
  if (unit.quantity > 1) {
    return calculateAvailableQuantity(unit, checkOut, checkIn) > 0;
  }
  
  // For single items, check actual conflicts in reservations/history, not just status
  // Check reservations array first (this is where active reservations are stored)
  if (unit.reservations && unit.reservations.length > 0) {
    for (const reservation of unit.reservations) {
      if (!reservation.checkOutDate || !reservation.checkInDate) continue;
      
      const resStart = normalizeDate(reservation.checkOutDate);
      const resEnd = normalizeDate(reservation.checkInDate);
      
      // Skip if the reservation is in the past
      if (resEnd < now) continue;
      
      // Check for overlap: (startA <= endB) && (endA >= startB)
      if (reqStart <= resEnd && reqEnd >= resStart) {
        if (unit.label && unit.label.includes('Sony A7IV-D')) {
          console.log(`[AVAILABILITY DEBUG] ${unit.label} conflicts with reservation:`, {
            requestedStart: checkOut,
            requestedEnd: checkIn,
            reservationStart: reservation.checkOutDate,
            reservationEnd: reservation.checkInDate,
            overlap: true
          });
        }
        return false; // Overlap found
      }
    }
  }
  
  // Also check history array for any additional conflicts
  if (unit.history && unit.history.length > 0) {
    for (const entry of unit.history) {
      if (!entry.checkOutDate || !entry.checkInDate) continue;
      
      const entryStart = normalizeDate(entry.checkOutDate);
      const entryEnd = normalizeDate(entry.checkInDate);
      
      // Skip if the reservation is in the past
      if (entryEnd < now) continue;
      
      // Check for overlap: (startA <= endB) && (endA >= startB)
      if (reqStart <= entryEnd && reqEnd >= entryStart) {
        if (unit.label && unit.label.includes('Sony A7IV-D')) {
          console.log(`[AVAILABILITY DEBUG] ${unit.label} conflicts with history entry:`, {
            requestedStart: checkOut,
            requestedEnd: checkIn,
            historyStart: entry.checkOutDate,
            historyEnd: entry.checkInDate,
            overlap: true
          });
        }
        return false; // Overlap found
      }
    }
  }
  
  if (unit.label && unit.label.includes('Sony A7IV-D')) {
    console.log(`[AVAILABILITY DEBUG] ${unit.label} is available for ${checkOut} to ${checkIn} (ignoring status: ${unit.status})`);
  }
  
  return true;
}

// Calculate available quantity for multi-unit items
function calculateAvailableQuantity(unit, checkOutDate, checkInDate) {
  // Debug logging for Sony A7IV-D
  if (unit.label && unit.label.includes('Sony A7IV-D')) {
    console.log(`[CALC AVAILABILITY DEBUG] calculateAvailableQuantity for ${unit.label}`);
    console.log(`[CALC AVAILABILITY DEBUG] Requested dates: ${checkOutDate} to ${checkInDate}`);
    console.log(`[CALC AVAILABILITY DEBUG] Unit quantity: ${unit.quantity}`);
  }
  
  if (unit.quantity === 1) {
    // For single items, check actual conflicts in history/reservations, not just status
    const normalizeDate = (dateStr) => {
      const date = new Date(dateStr);
      date.setUTCHours(0, 0, 0, 0);
      return date;
    };

    const reqStart = normalizeDate(checkOutDate);
    const reqEnd = normalizeDate(checkInDate);
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    // Check reservations array first
    if (unit.reservations && unit.reservations.length > 0) {
      for (const reservation of unit.reservations) {
        if (!reservation.checkOutDate || !reservation.checkInDate) continue;
        
        const resStart = normalizeDate(reservation.checkOutDate);
        const resEnd = normalizeDate(reservation.checkInDate);
        
        // Skip if the reservation is in the past
        if (resEnd < now) continue;
        
        // Check for overlap: (startA <= endB) && (endA >= startB)
        if (reqStart <= resEnd && reqEnd >= resStart) {
          if (unit.label && unit.label.includes('Sony A7IV-D')) {
            console.log(`[CALC AVAILABILITY DEBUG] Single item blocked by reservation overlap`);
          }
          return 0; // Overlap found
        }
      }
    }

    // Also check history array
    if (unit.history && unit.history.length > 0) {
      for (const entry of unit.history) {
        if (!entry.checkOutDate || !entry.checkInDate) continue;
        
        const entryStart = normalizeDate(entry.checkOutDate);
        const entryEnd = normalizeDate(entry.checkInDate);
        
        // Skip if the reservation is in the past
        if (entryEnd < now) continue;
        
        // Check for overlap: (startA <= endB) && (endA >= startB)
        if (reqStart <= entryEnd && reqEnd >= entryStart) {
          if (unit.label && unit.label.includes('Sony A7IV-D')) {
            console.log(`[CALC AVAILABILITY DEBUG] Single item blocked by history overlap:`, {
              requestedStart: checkOutDate,
              requestedEnd: checkInDate,
              historyStart: entry.checkOutDate,
              historyEnd: entry.checkInDate
            });
          }
          return 0; // Overlap found
        }
      }
    }

    const result = 1; // Available if no conflicts found
    if (unit.label && unit.label.includes('Sony A7IV-D')) {
      console.log(`[CALC AVAILABILITY DEBUG] Single item result: ${result} (no conflicts found, ignoring status: ${unit.status})`);
    }
    return result;
  }
  
  const normalizeDate = (dateStr) => {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  };
  
  const reqStart = normalizeDate(checkOutDate);
  const reqEnd = normalizeDate(checkInDate);
  
  let reservedQuantity = 0;
  
  // Only check reservations array for quantity items (matches backend logic)
  if (unit.reservations && unit.reservations.length > 0) {
    unit.reservations.forEach(reservation => {
      const resStart = normalizeDate(reservation.checkOutDate);
      const resEnd = normalizeDate(reservation.checkInDate);
      
      // Check for overlap: (startA <= endB) && (endA >= startB)
      if (reqStart <= resEnd && reqEnd >= resStart) {
        reservedQuantity += reservation.quantity || 1;
      }
    });
  }
  
  // Note: We don't check history for quantity items to avoid double-counting
  // since reservations are already tracked in the reservations array
  
  return Math.max(0, unit.quantity - reservedQuantity);
}

function createRow(item, isNewRow = false) {
  const safeLabel = item.label.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const el = document.createElement("div");
  el.className = "item";
  
  // Mark new blank rows for special handling
  if (isNewRow) {
    el.setAttribute('data-new-row', 'true');
  }
  
  // Always set data-inventory-id for inventory items
  let inventoryId = item.inventoryId;
  if (!inventoryId) {
    // Try to find by label in gearInventory
    const inv = gearInventory.find(g => g.label === item.label);
    if (inv) inventoryId = inv._id;
  }
  if (inventoryId) {
    el.setAttribute('data-inventory-id', inventoryId);
    item.inventoryId = inventoryId; // Ensure it's set in memory too
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
    deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
    deleteBtn.title = 'Delete item';
    deleteBtn.className = 'delete-btn';
    deleteBtn.style.marginLeft = '8px';
    deleteBtn.style.background = 'transparent';
    deleteBtn.style.border = 'none';
    deleteBtn.style.padding = '0';
    deleteBtn.style.lineHeight = '1';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.opacity = '1';
    deleteBtn.style.flexShrink = '0';
    
    // Remove hover effect that changes background
    deleteBtn.onmouseover = null;
    deleteBtn.onmouseout = null;
    
    deleteBtn.onclick = async () => {
      // Get current dates for checking reservations
      const checkOutDate = document.getElementById('checkoutDate')?.value;
      const checkInDate = document.getElementById('checkinDate')?.value;
      
      console.log(`[DELETE DEBUG] Starting delete process for item:`, item);
      console.log(`[DELETE DEBUG] Current form dates: ${checkOutDate} to ${checkInDate}`);
      
      // Find the inventory item by inventoryId (preferred) or label as fallback
      let inventoryItem = null;
      if (item.inventoryId) {
        inventoryItem = gearInventory.find(g => g._id === item.inventoryId);
        console.log(`[DELETE DEBUG] Found inventory item by ID:`, inventoryItem);
      } else {
        // Fallback: try to find by label, but strip quantity info first
        const baseLabel = item.label.replace(/\s*\(\d+\s*units?\)$/, '');
        inventoryItem = gearInventory.find(g => g.label === baseLabel);
        console.log(`[DELETE DEBUG] Found inventory item by base label "${baseLabel}":`, inventoryItem);
      }
      
      // If this is an inventory item, check it in
      if (inventoryItem && checkOutDate && checkInDate) {
        try {
          // For quantity items (quantity > 1), extract quantity from label or use default
          if (inventoryItem.quantity > 1) {
            // Use the actual quantity stored in the item object, or extract from label
            let quantityToRelease = item.quantity;
            
            // If not available, try to extract from the label
            if (!quantityToRelease || quantityToRelease === 1) {
              const labelMatch = item.label.match(/\((\d+)\s*units?\)$/);
              if (labelMatch) {
                quantityToRelease = parseInt(labelMatch[1]);
              } else {
                quantityToRelease = 1; // Default fallback
              }
            }
            
            console.log(`[DELETE DEBUG] Item data:`, item);
            console.log(`[DELETE DEBUG] Inventory item:`, inventoryItem);
            console.log(`[DELETE DEBUG] Quantity extraction: item.quantity=${item.quantity}, label="${item.label}", final=${quantityToRelease}`);
            console.log(`[DELETE DEBUG] Attempting to release ${quantityToRelease} units of ${inventoryItem.label}`);
            
            // Use the stored checkout dates from the item, not the current form dates
            const itemCheckOutDate = item.checkOutDate || checkOutDate;
            const itemCheckInDate = item.checkInDate || checkInDate;
            
            // Debug the reservation matching
            console.log(`[DELETE DEBUG] Current event ID: ${eventContext.tableId}`);
            console.log(`[DELETE DEBUG] Item stored dates: ${item.checkOutDate} to ${item.checkInDate}`);
            console.log(`[DELETE DEBUG] Current form dates: ${checkOutDate} to ${checkInDate}`);
            console.log(`[DELETE DEBUG] Using dates for API call: ${itemCheckOutDate} to ${itemCheckInDate}`);
            
            // If we don't have stored dates, we need to use the form dates
            if (!item.checkOutDate || !item.checkInDate) {
              console.log(`[DELETE DEBUG] ⚠️  Item missing stored dates - using form dates as fallback`);
              console.log(`[DELETE DEBUG] This typically happens after page refresh`);
            }
            
            // Make the API call to release the quantity
            console.log(`[DELETE DEBUG] Making API call to /api/gear-inventory/checkin with:`, {
              gearId: inventoryItem._id,
              eventId: eventContext.tableId,
              checkOutDate: itemCheckOutDate,
              checkInDate: itemCheckInDate,
              quantity: quantityToRelease
            });
            
            console.log(`[DELETE DEBUG] API_BASE:`, window.API_BASE);
            console.log(`[DELETE DEBUG] Full URL:`, `${window.API_BASE}/api/gear-inventory/checkin`);
            console.log(`[DELETE DEBUG] Authorization token:`, localStorage.getItem('token') ? 'Present' : 'Missing');
            
            try {
              const res = await fetch(`${window.API_BASE}/api/gear-inventory/checkin`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: localStorage.getItem('token')
                },
                body: JSON.stringify({
                  gearId: inventoryItem._id,
                  eventId: eventContext.tableId,
                  checkOutDate: itemCheckOutDate,
                  checkInDate: itemCheckInDate,
                  quantity: quantityToRelease
                })
              });
              
              console.log(`[DELETE DEBUG] API response status:`, res.status);
              console.log(`[DELETE DEBUG] API response headers:`, res.headers);
              
              if (res.ok) {
                const result = await res.json();
                console.log(`[DELETE DEBUG] Successfully released ${quantityToRelease} units:`, result);
              } else {
                const errorText = await res.text();
                console.error(`[DELETE DEBUG] Failed to release reservation: ${errorText}`);
                console.error(`[DELETE DEBUG] Response status: ${res.status}`);
              }
            } catch (fetchError) {
              console.error(`[DELETE DEBUG] Network error during fetch:`, fetchError);
              console.error(`[DELETE DEBUG] Error details:`, {
                message: fetchError.message,
                stack: fetchError.stack,
                name: fetchError.name
              });
            }
          } else {
            // For single items, use the existing logic
            console.log(`[DELETE DEBUG] Processing single item deletion`);
            if (inventoryItem.status === 'checked_out' && inventoryItem.checkedOutEvent === eventContext.tableId) {
              console.log(`[DELETE DEBUG] Making API call for single item checkin`);
              await fetch(`${window.API_BASE}/api/gear-inventory/checkin`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: localStorage.getItem('token')
                },
                body: JSON.stringify({
                  gearId: inventoryItem._id,
                  eventId: eventContext.tableId,
                  checkOutDate: inventoryItem.checkOutDate,
                  checkInDate: inventoryItem.checkInDate
                })
              });
              await loadGearInventory();
            }
          }
        } catch (err) {
          console.error('[DELETE DEBUG] Failed to check in gear:', err);
        }
      } else {
        console.log(`[DELETE DEBUG] Skipping API call - missing data:`, {
          hasInventoryItem: !!inventoryItem,
          hasCheckOutDate: !!checkOutDate,
          hasCheckInDate: !!checkInDate
        });
      }
      
      // Remove the row from the DOM
      console.log(`[DELETE DEBUG] Removing item from DOM`);
      el.remove();
      
      // Use direct save that bypasses all validation unless it's a new blank row
      if (!isNewRow) {
        console.log(`[DELETE DEBUG] Saving gear data`);
        await saveGearDirect();
      }
      
      console.log(`[DELETE DEBUG] Delete process completed`);
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
    if (isNewRow) {
      // Only attach the custom blur handler for new rows
      input.addEventListener('blur', async (e) => {
        try {
          if (document.visibilityState === 'hidden' || document.readyState !== 'complete') {
            return;
          }
          if (input.value.trim() === '') {
            el.remove();
          } else {
            // No availability check for custom items
            el.removeAttribute('data-new-row');
            eventContext.updateFromDOM();
            const checkOutDate = document.getElementById('checkoutDate')?.value || '';
            const checkInDate = document.getElementById('checkinDate')?.value || '';
            await eventContext.save(checkOutDate, checkInDate);
            setTimeout(() => {
              window.isActiveEditing = false;
              console.log('Item saved and editing completed');
            }, 200);
          }
        } catch (err) {
          console.error('Error saving new item:', err);
        }
      });
    } else {
      // Existing row: keep the original blur handler
      input.addEventListener('blur', async (e) => {
        try {
          if (document.visibilityState === 'hidden' || document.readyState !== 'complete') {
            return;
          }
          if (input.value.trim() === '') {
            el.remove();
          } else {
            el.removeAttribute('data-new-row');
            eventContext.updateFromDOM();
            const checkOutDate = document.getElementById('checkoutDate')?.value || '';
            const checkInDate = document.getElementById('checkinDate')?.value || '';
            await eventContext.save(checkOutDate, checkInDate);
            setTimeout(() => {
              window.isActiveEditing = false;
              console.log('Item saved and editing completed');
            }, 200);
          }
        } catch (err) {
          console.error('Error saving item:', err);
        }
      });
    }
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
    checkoutBtn.innerHTML = '<span class="material-symbols-outlined">list_alt</span> Use Inventory'; // Changed textContent to innerHTML and added icon
    checkoutBtn.title = "Check out from inventory";

    const dates = getSelectedDates();
    
    checkoutBtn.onclick = async () => {
      try {
        // Check for dates
        if (!dates.checkOut || !dates.checkIn) {
          alert("Please set the check-out and check-in dates first.");
          return;
        }
        
        // Show immediate feedback that we're loading fresh data
        checkoutBtn.disabled = true;
        checkoutBtn.innerHTML = '<span class="material-symbols-outlined">refresh</span> Loading...';
        
        // Force refresh inventory data to ensure maximum accuracy
        console.log('[Checkout Button] Force refreshing inventory before opening modal...');
        
        // Use a stronger cache-busting mechanism with timestamp + random component
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        
        try {
          console.log(`[Checkout Button] Attempting to fetch from: ${window.API_BASE}/api/gear-inventory`);
          console.log(`[Checkout Button] Token available: ${!!localStorage.getItem('token')}`);
          
          const res = await fetch(`${window.API_BASE}/api/gear-inventory?_t=${timestamp}&_r=${random}`, {
            headers: { 
              Authorization: localStorage.getItem('token')
            }
          });
          
          console.log(`[Checkout Button] Response status: ${res.status}`);
          console.log(`[Checkout Button] Response ok: ${res.ok}`);
          
          if (!res.ok) {
            const errorText = await res.text();
            console.error(`[Checkout Button] Error response: ${errorText}`);
            throw new Error(`Status ${res.status}: ${errorText}`);
          }
          
          gearInventory = await res.json();
          console.log(`[Checkout Button] Successfully loaded ${gearInventory.length} fresh inventory items`);
        } catch (err) {
          console.error('Failed to refresh gear inventory:', err);
          console.error('Error details:', {
            message: err.message,
            stack: err.stack,
            name: err.name
          });
          
          // More specific error messages
          if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
            console.warn('Network error occurred, checking for existing inventory data...');
            
            // If we have existing inventory data, use it as fallback
            if (gearInventory && gearInventory.length > 0) {
              console.log(`[Checkout Button] Using existing inventory data (${gearInventory.length} items) as fallback`);
              // Show a warning but continue with existing data
              alert('Warning: Unable to refresh inventory data. Using cached data which may not be current.');
            } else {
              alert('Network error: Unable to connect to the server and no cached inventory data available. Please check your internet connection and try again.');
              return;
            }
          } else if (err.message.includes('401')) {
            alert('Authentication error: Please log out and log back in.');
            return;
          } else if (err.message.includes('403')) {
            alert('Permission error: You do not have access to this resource.');
            return;
          } else {
            alert(`Failed to load inventory data: ${err.message}. Please try again.`);
            return;
          }
        } finally {
          // Restore button state
          checkoutBtn.disabled = false;
          checkoutBtn.innerHTML = '<span class="material-symbols-outlined">list_alt</span> Use Inventory';
        }
        
        // Get available units from inventory with fresh data
        const availableUnits = gearInventory
          .filter(unit => {
            // Check category match
            if (!checkByCategory(unit, name)) {
              return false;
            }
            // Only show if available for the selected dates
            return isUnitAvailableForDates(unit, dates.checkOut, dates.checkIn);
          });
        
        console.log(`[Checkout Button] Found ${availableUnits.length} available units for category ${name}`);
        
        await openCheckoutModal(name, availableUnits, dates.checkOut, dates.checkIn, list);
      } catch (err) {
        console.error("Error opening checkout modal:", err);
        alert('Error loading inventory. Please try again.');
        
        // Restore button state in case of error
        checkoutBtn.disabled = false;
        checkoutBtn.innerHTML = '<span class="material-symbols-outlined">list_alt</span> Use Inventory';
      }
    };

    // Add + Add Item button for manual row addition
    const addRowBtn = document.createElement("button");
    addRowBtn.className = "add-btn";
    addRowBtn.textContent = "Add Item";
    addRowBtn.title = "Add a custom row";
    addRowBtn.onclick = async () => {
      // Create a new row for custom item
      const row = createRow({ label: "", checked: false }, true);
      list.appendChild(row);
      const input = row.querySelector("input[type='text']");
      if (input) {
        input.focus();
        // Patch: Only check the new item for availability on blur
        input.addEventListener('blur', async (e) => {
          const label = input.value.trim();
          if (!label) return;
          const { checkOut, checkIn } = getSelectedDates();
          if (!isGearItemAvailable(label, checkOut, checkIn)) {
            // Show warning for this item only
            showUnavailableWarningModal([label], () => {
              // Proceed: allow adding, but highlight as unavailable
              highlightUnavailableItems([label]);
            });
          }
        }, { once: true });
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
  modal.style.display = 'block';
  document.getElementById('unavailableProceedBtn').onclick = () => {
    modal.style.display = 'none';
    onProceed();
  };
  document.getElementById('unavailableCancelBtn').onclick = () => {
    modal.style.display = 'none';
  };
}

// Update checkUnavailableItemsAndWarn to use modal
function checkUnavailableItemsAndWarn(itemsToCheck = null) {
  // Validate date range first
  if (!validateDateRange()) {
    return; // Don't proceed if dates are invalid
  }
  
  const { checkOut, checkIn } = getSelectedDates();
  const unavailable = [];
  
  // If specific items are provided, only check those
  if (itemsToCheck) {
    itemsToCheck.forEach(item => {
      if (!isGearItemAvailable(item, checkOut, checkIn)) {
        unavailable.push(item);
      }
    });
  } else {
    // Only check all items when explicitly requested (e.g., date changes)
    document.querySelectorAll('.item input[type="text"]').forEach(input => {
      const label = input.value.trim();
      if (!isGearItemAvailable(label, checkOut, checkIn)) {
        unavailable.push(label);
      }
    });
  }
  
  highlightUnavailableItems(unavailable);
  if (unavailable.length) {
    showUnavailableWarningModal(unavailable, async () => {
      // Get current dates
      const currentDates = getSelectedDates();
      
      // First, release inventory reservations for items that will be removed
      console.log('Releasing inventory reservations for unavailable items:', unavailable);
      
      const itemsToRelease = [];
      
      // Find and collect items that need reservation release
      document.querySelectorAll('.item input[type="text"]').forEach(input => {
        const label = input.value.trim();
        if (unavailable.includes(label)) {
          const row = input.closest('.item');
          if (row) {
            // Get the item data from the current list
            const categoryElement = row.closest('.category');
            const categoryName = categoryElement.querySelector('h3').textContent;
            const items = eventContext.getItems(categoryName);
            const item = items.find(i => i.label === label);
            
            if (item) {
              itemsToRelease.push(item);
            }
          }
        }
      });
      
      // Release reservations for all items
      const releasePromises = itemsToRelease.map(item => 
        releaseInventoryReservation(item, currentDates.checkOut, currentDates.checkIn)
      );
      
      try {
        const releaseResults = await Promise.all(releasePromises);
        const failedReleases = releaseResults.filter(result => !result).length;
        
        if (failedReleases > 0) {
          console.warn(`Failed to release ${failedReleases} inventory reservations`);
        } else {
          console.log('All inventory reservations released successfully');
        }
        
        // Refresh inventory data after releasing reservations
        await loadGearInventory();
        
      } catch (err) {
        console.error('Error releasing inventory reservations:', err);
      }
      
      // Now remove the unavailable items from the DOM
      console.log('Removing unavailable items from DOM:', unavailable);
      
      document.querySelectorAll('.item input[type="text"]').forEach(input => {
        const label = input.value.trim();
        if (unavailable.includes(label)) {
          // Find the parent row and remove it
          const row = input.closest('.item');
          if (row) {
            console.log('Removing row for item:', label);
            row.remove();
          }
        }
      });
      
      // Clear the highlighting since items are removed
      highlightUnavailableItems([]);
      
      // Now save the updated state
      pendingProceed = true;
      saveGear();
      pendingProceed = false;
      
      // Show success message
      const statusMessage = document.getElementById('gearStatusMessage');
      if (statusMessage) {
        statusMessage.innerHTML = `
          <div style="background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
            <strong>Items Removed:</strong> ${unavailable.join(', ')} were removed due to date conflicts and their reservations have been released.
          </div>
        `;
        
        // Clear message after 5 seconds
        setTimeout(() => {
          statusMessage.innerHTML = '';
        }, 5000);
      }
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

// Direct save function that bypasses all validation - used for delete operations
async function saveGearDirect() {
  try {
    // Update data from DOM
    eventContext.updateFromDOM();
    
    // Get date fields
    const checkOutDate = document.getElementById('checkoutDate')?.value || '';
    const checkInDate = document.getElementById('checkinDate')?.value || '';
    
    // Save to server directly without any validation
    const success = await eventContext.save(checkOutDate, checkInDate);
    
    if (!success) {
      throw new Error("Save failed");
    }
  } catch (err) {
    console.error("Error saving gear:", err.message);
  }
}

// Listen for date changes to trigger warning logic for ALL items
['checkoutDate', 'checkinDate'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('change', () => checkUnavailableItemsAndWarn()); // Check all items when dates change
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
      
      // If there's a pending reload from Socket.IO updates, verify it's for the current event
      if (window.pendingReload) {
        const currentTableId = localStorage.getItem('eventId');
        console.log('Processing pending reload after edit completion');
        
        // Only reload if the pending reload is for the current event
        if (!window.pendingReloadTableId || window.pendingReloadTableId === currentTableId) {
          console.log('Reload is for current event, proceeding with reload');
          window.pendingReload = false;
          window.pendingReloadTableId = null;
          loadGear();
        } else {
          console.log('Reload was for a different event, ignoring');
          window.pendingReload = false;
          window.pendingReloadTableId = null;
        }
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
    // Add cache-busting parameter to ensure fresh data
    const timestamp = Date.now();
    const res = await fetch(`${window.API_BASE}/api/gear-inventory?_t=${timestamp}`, {
      headers: { Authorization: localStorage.getItem('token') }
    });
    
    if (!res.ok) throw new Error(`Status ${res.status}`);
    gearInventory = await res.json();
    console.log(`[gear.js] Loaded ${gearInventory.length} inventory items at ${new Date().toISOString()}`);
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
async function openCheckoutModal(category, availableUnits, checkOut, checkIn, list) {
  console.log('*** DEBUG: openCheckoutModal called with dates:', checkOut, 'to', checkIn, 'TIMESTAMP:', Date.now());
  
  const modal = document.getElementById('checkoutModal');
  const modalList = document.getElementById('modalItemList');
  const modalTitle = document.getElementById('modalTitle');

  // Show loading state
  modalTitle.textContent = `Loading ${category} Items...`;
  modalList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">🔄 Loading inventory data...</p>';
  modal.style.display = 'block';

  // The inventory should already be fresh from the button click, but re-filter to be safe
  const freshAvailableUnits = gearInventory.filter(unit => {
    return unit.category === category && isUnitAvailableForDates(unit, checkOut, checkIn);
  });
  
  console.log(`[openCheckoutModal] Category: ${category}, Total inventory items: ${gearInventory.length}`);
  console.log(`[openCheckoutModal] Items in category: ${gearInventory.filter(u => u.category === category).length}`);
  console.log(`[openCheckoutModal] Available items after date filtering: ${freshAvailableUnits.length}`);
  
  // Debug each item in the category
  gearInventory.filter(u => u.category === category).forEach(unit => {
    const availableQty = calculateAvailableQuantity(unit, checkOut, checkIn);
    const isAvailable = isUnitAvailableForDates(unit, checkOut, checkIn);
    console.log(`[openCheckoutModal] ${unit.label}: total=${unit.quantity}, available=${availableQty}, passes date check=${isAvailable}`);
    
    // Extra debug for Sony A7IV-D
    if (unit.label && unit.label.includes('Sony A7IV-D')) {
      console.log(`[SONY DEBUG] Full unit data for ${unit.label}:`, {
        _id: unit._id,
        status: unit.status,
        quantity: unit.quantity,
        reservations: unit.reservations,
        history: unit.history
      });
      console.log(`[SONY DEBUG] Requested dates: ${checkOut} to ${checkIn}`);
    }
    
    if (unit.reservations && unit.reservations.length > 0) {
      console.log(`[openCheckoutModal] ${unit.label} reservations:`, unit.reservations);
    }
  });
  
  // Update modal title
  modalTitle.textContent = `Select ${category} Item to Check Out`;

  // Get all inventory IDs already in ANY list for this event
  const allUsedIds = [];
  Object.values(eventContext.lists).forEach(listObj => {
    Object.values(listObj.categories).forEach(items => {
      items.forEach(item => {
        if (item.inventoryId) allUsedIds.push(item.inventoryId);
      });
    });
  });

  console.log(`[openCheckoutModal] All used inventory IDs for this event:`, allUsedIds);

  // Filter out units that are already in ANY list for this event (by _id)
  // BUT: For multi-quantity items, only filter if NO quantity is available
  const availableUnitsFiltered = freshAvailableUnits.filter(unit => {
    const isAlreadyUsed = allUsedIds.includes(unit._id);
    const availableQty = calculateAvailableQuantity(unit, checkOut, checkIn);
    
    console.log(`[openCheckoutModal] ${unit.label}: isAlreadyUsed=${isAlreadyUsed}, availableQty=${availableQty}`);
    
    // For multi-quantity items, show if there's available quantity even if some units are used
    if (unit.quantity > 1) {
      return availableQty > 0;
    }
    
    // For single items, hide if already used
    if (isAlreadyUsed) {
      return false;
    }
    
    return isUnitAvailableForDates(unit, checkOut, checkIn);
  });

  // Calculate how many items are hidden
  const hiddenCount = freshAvailableUnits.length - availableUnitsFiltered.length;

  let modalContent = '';

  // Add an explanatory note if any items are hidden
  if (hiddenCount > 0) {
    modalContent += `<p style="color: #666; font-size: 14px; margin-bottom: 16px;">
      Note: ${hiddenCount} item(s) already in use have been hidden.
    </p>`;
  }

  if (availableUnitsFiltered.length === 0) {
    modalContent += `<p style="text-align: center; color: #666;">No available items found.</p>`;
    modalList.innerHTML = modalContent;
  } else {
    modalContent += availableUnitsFiltered
      .map(unit => {
        // Calculate available quantity for this unit
        const availableQty = calculateAvailableQuantity(unit, checkOut, checkIn);
        
        // Create quantity input for multi-unit items with availability info
        let quantityInput = '';
        let availabilityInfo = '';
        
        if (unit.quantity > 1) {
          availabilityInfo = `
            <div style="margin-top: 4px; font-size: 12px; color: #666;">
              <strong>${availableQty}/${unit.quantity}</strong> units available
            </div>
          `;
          
          quantityInput = `
            <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
              <label style="font-size: 14px; color: #666;">Quantity:</label>
              <input type="number" 
                     id="quantity-${unit._id}" 
                     min="1" 
                     max="${availableQty}"
                     value="1" 
                     style="width: 60px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
              <small style="color: #666;">max: ${availableQty}</small>
            </div>
          `;
        } else {
          // For single items, just show "Available"
          availabilityInfo = `
            <div style="margin-top: 4px; font-size: 12px; color: #28a745;">
              <strong>Available</strong>
            </div>
          `;
        }
        
        return `
          <div class="modal-item-container" style="background: #f7f7f7; border: 1px solid #eaeaea; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
            <button class="modal-item-btn" style="background: none; border: none; color: #333; width: 100%; text-align: left; cursor: pointer; padding: 0;" data-id="${unit._id}">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <span style="color: #333; font-weight: 500;">${unit.label}</span>
                  ${availabilityInfo}
                </div>
              </div>
            </button>
            ${quantityInput}
          </div>
        `;
      })
      .join('');
    modalList.innerHTML = modalContent;
  }

  // Add event listeners for item buttons
  modalList.querySelectorAll('.modal-item-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      // Declare these variables ONCE at the top
      const checkOutDate = document.getElementById('checkoutDate')?.value;
      const checkInDate = document.getElementById('checkinDate')?.value;
      if (!checkOutDate || !checkInDate) {
        alert('Please select both check-out and check-in dates before checking out items.');
        return;
      }
      const unitId = btn.dataset.id;
      const unit = availableUnitsFiltered.find(u => u._id === unitId);
      if (!unit) return;
      
      // Get quantity for multi-unit items
      let quantity = 1;
      if (unit.quantity > 1) {
        const quantityInput = document.getElementById(`quantity-${unitId}`);
        if (quantityInput) {
          quantity = parseInt(quantityInput.value) || 1;
        }
      }
      
      // Double-check: prevent adding if already in any list (race condition safety)
      const allUsedIdsNow = [];
      Object.values(eventContext.lists).forEach(listObj => {
        Object.values(listObj.categories).forEach(items => {
          items.forEach(item => {
            if (item.inventoryId) allUsedIdsNow.push(item.inventoryId);
          });
        });
      });
      if (allUsedIdsNow.includes(unit._id)) {
        showNotification(`${unit.label} is already on a list for this event and cannot be added again.`, 'warning');
        return;
      }
      try {
        // Do NOT redeclare checkOutDate/checkInDate here
        // Call the API to check out this item
        const res = await fetch(`${window.API_BASE}/api/gear-inventory/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: localStorage.getItem('token')
          },
          body: JSON.stringify({
            gearId: unit._id,
            eventId: eventContext.tableId,
            checkOutDate: checkOutDate,
            checkInDate: checkInDate,
            quantity: quantity
          })
        });
        if (!res.ok) {
          const errorText = await res.text();
          if (res.status === 409) {
            // Backend rejected due to overlap
            showNotification(`Cannot check out ${unit.label}: ${errorText}`, 'warning');
          } else {
            showNotification(`Error checking out ${unit.label}: ${errorText}`, 'error');
          }
          return;
        }
        
        const responseData = await res.json();
        
        // Only add the checked-out item to the current gear list if checkout succeeded
        const currentListName = eventContext.activeList;
        if (eventContext.lists[currentListName] && eventContext.lists[currentListName].categories[category]) {
          // For multi-unit items, show quantity in the label
          const itemLabel = unit.quantity > 1 ? `${unit.label} (${quantity} units)` : unit.label;
          
          eventContext.lists[currentListName].categories[category].push({
            label: itemLabel,
            checked: false,
            inventoryId: unit._id,
            quantity: quantity,
            checkOutDate: checkOutDate,
            checkInDate: checkInDate
          });
        }
        // Save the updated gear list to the server
        await eventContext.save(checkOutDate, checkInDate);
        // Reload gear and inventory, then close the modal
        await loadGearInventory();
        // Don't call loadGear() here as it overwrites the stored checkout dates
        // Instead, just re-render the gear to show the new item
        renderGear();
        modal.style.display = 'none';
        
        // Force a fresh inventory reload after a short delay to ensure backend has processed
        setTimeout(async () => {
          console.log('[Checkout] Force refreshing inventory after checkout to ensure fresh data...');
          await loadGearInventory();
        }, 500);
        
        // Show appropriate success message
        const successMessage = unit.quantity > 1 
          ? `${quantity} units of ${unit.label} have been reserved for your event.`
          : `${unit.label} has been checked out for your event.`;
        showNotification(successMessage, 'success');
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

  // Add refresh button functionality
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '🔄 Refresh';
  refreshBtn.className = 'refresh-btn';
  refreshBtn.style.marginRight = '10px';
  refreshBtn.title = 'Refresh inventory data';
  refreshBtn.onclick = async () => {
    // Show loading state
    modalTitle.textContent = `Refreshing ${category} Items...`;
    modalList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">🔄 Refreshing inventory data...</p>';
    
    // Refresh inventory data
    await loadGearInventory();
    
    // Re-filter the available units with the fresh inventory data for the SAME category
    const refreshedAvailableUnits = gearInventory.filter(unit => {
      return unit.category === category && isUnitAvailableForDates(unit, checkOut, checkIn);
    });
    
    // Get all inventory IDs already in ANY list for this event
    const allUsedIds = [];
    Object.values(eventContext.lists).forEach(listObj => {
      Object.values(listObj.categories).forEach(items => {
        items.forEach(item => {
          if (item.inventoryId) allUsedIds.push(item.inventoryId);
        });
      });
    });

    // Filter out units that are already in ANY list for this event (by _id)
    const availableUnitsFiltered = refreshedAvailableUnits.filter(unit => {
      if (allUsedIds.includes(unit._id)) {
        return false;
      }
      return isUnitAvailableForDates(unit, checkOut, checkIn);
    });

    // Calculate how many items are hidden
    const hiddenCount = refreshedAvailableUnits.length - availableUnitsFiltered.length;

    // Update modal title back to normal
    modalTitle.textContent = `Select ${category} Item to Check Out`;

    let modalContent = '';

    // Add an explanatory note if any items are hidden
    if (hiddenCount > 0) {
      modalContent += `<p style="color: #666; font-size: 14px; margin-bottom: 16px;">
        Note: ${hiddenCount} item(s) already in use have been hidden.
      </p>`;
    }

    if (availableUnitsFiltered.length === 0) {
      modalContent += `<p style="text-align: center; color: #666;">No available items found.</p>`;
    } else {
      modalContent += availableUnitsFiltered
        .map(unit => {
          // Calculate available quantity for this unit
          const availableQty = calculateAvailableQuantity(unit, checkOut, checkIn);
          
          // Create quantity input for multi-unit items with availability info
          let quantityInput = '';
          let availabilityInfo = '';
          
          if (unit.quantity > 1) {
            availabilityInfo = `
              <div style="margin-top: 4px; font-size: 12px; color: #666;">
                <strong>${availableQty}/${unit.quantity}</strong> units available
              </div>
            `;
            
            quantityInput = `
              <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
                <label style="font-size: 14px; color: #666;">Quantity:</label>
                <input type="number" 
                       id="quantity-${unit._id}" 
                       min="1" 
                       max="${availableQty}"
                       value="1" 
                       style="width: 60px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
            <small style="color: #666;">max: ${availableQty}</small>
          </div>
        `;
          } else {
            // For single items, just show "Available"
            availabilityInfo = `
              <div style="margin-top: 4px; font-size: 12px; color: #28a745;">
                <strong>Available</strong>
              </div>
            `;
          }
          
          return `
            <div class="modal-item-container" style="background: #f7f7f7; border: 1px solid #eaeaea; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
              <button class="modal-item-btn" style="background: none; border: none; color: #333; width: 100%; text-align: left; cursor: pointer; padding: 0;" data-id="${unit._id}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span style="color: #333; font-weight: 500;">${unit.label}</span>
                    ${availabilityInfo}
                  </div>
                </div>
              </button>
              ${quantityInput}
            </div>
          `;
        })
        .join('');
    }

    // Update the modal content
    modalList.innerHTML = modalContent;

    // Re-add event listeners for the new item buttons
    modalList.querySelectorAll('.modal-item-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const checkOutDate = document.getElementById('checkoutDate')?.value;
        const checkInDate = document.getElementById('checkinDate')?.value;
        if (!checkOutDate || !checkInDate) {
          alert('Please select both check-out and check-in dates before checking out items.');
          return;
        }
        const unitId = btn.dataset.id;
        const unit = availableUnitsFiltered.find(u => u._id === unitId);
        if (!unit) return;
        
        // Get quantity for multi-unit items
        let quantity = 1;
        if (unit.quantity > 1) {
          const quantityInput = document.getElementById(`quantity-${unitId}`);
          if (quantityInput) {
            quantity = parseInt(quantityInput.value) || 1;
          }
        }
        
        // Double-check: prevent adding if already in any list (race condition safety)
        const allUsedIdsNow = [];
        Object.values(eventContext.lists).forEach(listObj => {
          Object.values(listObj.categories).forEach(items => {
            items.forEach(item => {
              if (item.inventoryId) allUsedIdsNow.push(item.inventoryId);
            });
          });
        });
        if (allUsedIdsNow.includes(unit._id)) {
          showNotification(`${unit.label} is already on a list for this event and cannot be added again.`, 'warning');
          return;
        }
        try {
          // Call the API to check out this item
          const res = await fetch(`${window.API_BASE}/api/gear-inventory/checkout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: localStorage.getItem('token')
            },
            body: JSON.stringify({
              gearId: unit._id,
              eventId: eventContext.tableId,
              checkOutDate: checkOutDate,
              checkInDate: checkInDate,
              quantity: quantity
            })
          });
          if (!res.ok) {
            const errorText = await res.text();
            if (res.status === 409) {
              // Backend rejected due to overlap
              showNotification(`Cannot check out ${unit.label}: ${errorText}`, 'warning');
            } else {
              showNotification(`Error checking out ${unit.label}: ${errorText}`, 'error');
            }
            return;
          }
          
          const responseData = await res.json();
          
          // Only add the checked-out item to the current gear list if checkout succeeded
          const currentListName = eventContext.activeList;
          if (eventContext.lists[currentListName] && eventContext.lists[currentListName].categories[category]) {
            // For multi-unit items, show quantity in the label
            const itemLabel = unit.quantity > 1 ? `${unit.label} (${quantity} units)` : unit.label;
            
            eventContext.lists[currentListName].categories[category].push({
              label: itemLabel,
              checked: false,
              inventoryId: unit._id,
              quantity: quantity,
              checkOutDate: checkOutDate,
              checkInDate: checkInDate
            });
          }
          // Save the updated gear list to the server
          await eventContext.save(checkOutDate, checkInDate);
          // Reload gear and inventory, then close the modal
          await loadGearInventory();
          // Don't call loadGear() here as it overwrites the stored checkout dates
          // Instead, just re-render the gear to show the new item
          renderGear();
          modal.style.display = 'none';
          
          // Force a fresh inventory reload after a short delay to ensure backend has processed
          setTimeout(async () => {
            console.log('[Checkout] Force refreshing inventory after checkout to ensure fresh data...');
            await loadGearInventory();
          }, 500);
          
          // Show appropriate success message
          const successMessage = unit.quantity > 1 
            ? `${quantity} units of ${unit.label} have been reserved for your event.`
            : `${unit.label} has been checked out for your event.`;
          showNotification(successMessage, 'success');
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
  };

  // Add refresh button to modal if it doesn't exist
  // const modalContentElement = modal.querySelector('.modal-content');
  // const existingRefreshBtn = modalContentElement.querySelector('.refresh-btn');
  // if (!existingRefreshBtn) {
  //   const closeBtn = document.getElementById('closeModalBtn');
  //   modalContentElement.insertBefore(refreshBtn, closeBtn);
  // }

  // Show the modal
  modal.style.display = 'block';

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
    // Only set eventContext.tableId and localStorage.eventId if not already set
    if (!eventContext.tableId) {
      const params = new URLSearchParams(window.location.search);
      let tableId = params.get('id') || localStorage.getItem('eventId');
      if (tableId) {
        eventContext.tableId = tableId;
        // CRITICAL FIX: Commented out to prevent interference with SPA navigation
        // localStorage.setItem('eventId', tableId);
      }
    }
    await loadGear();
    await loadEventTitle();
    await loadGearInventory();
    document.getElementById('gearContainer').addEventListener('input', triggerAutosave);
    document.getElementById('gearContainer').addEventListener('change', triggerAutosave);
    document.getElementById("filterCheckbox").addEventListener("change", e => {
      filterSetting = e.target.value;
      renderGear();
    });
    // Duplicate date listeners removed - handled by comprehensive listener below
    // document.getElementById('checkoutDate').addEventListener('change', triggerAutosave);
    // document.getElementById('checkinDate').addEventListener('change', triggerAutosave);
  } catch (err) {
    console.error("Error initializing gear page:", err);
  }
});
  
  function initPage(id) {
    try {
      // CRITICAL FIX: Only use the explicit id parameter from navigation
      // Don't fall back to URL params or localStorage which could be stale
      if (!id) {
        console.error('Gear page initPage called without event ID parameter');
        alert("Missing configuration: event ID is required.");
        throw new Error("Missing event ID");
      }
      
      // Initialize event context with the explicit ID
      if (!eventContext.init(id)) {
        alert("Missing configuration: tableId is not set.");
        throw new Error("Missing configuration");
      }

      // Load bottom navigation
      const navContainer = document.getElementById('bottomNav');
      if (navContainer) {
        fetch('../bottom-nav.html')
          .then(response => response.text())
          .then(html => {
            // Extract the inner content from the fetched HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const bottomNavContent = tempDiv.querySelector('.bottom-nav');
            
            if (bottomNavContent) {
              navContainer.innerHTML = bottomNavContent.innerHTML;
              
              // Set up navigation using the centralized function from app.js
              if (window.setupBottomNavigation) {
                window.setupBottomNavigation(navContainer, id, 'gear');
              }
            }
          })
          .catch(error => {
            console.error('Error loading bottom navigation:', error);
          });
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
      // document.getElementById('checkoutDate').addEventListener('change', triggerAutosave);
      // document.getElementById('checkinDate').addEventListener('change', triggerAutosave);
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
      el.addEventListener('change', async () => {
        console.log(`[Date Change] ${id} changed - validating dates and updating inventory...`);
        
        // Validate and adjust dates to ensure check-in is never before check-out
        const checkoutEl = document.getElementById('checkoutDate');
        const checkinEl = document.getElementById('checkinDate');
        
        if (checkoutEl.value && checkinEl.value) {
          const checkoutDate = new Date(checkoutEl.value);
          const checkinDate = new Date(checkinEl.value);
          
          // If check-in date is before check-out date, adjust it
          if (checkinDate < checkoutDate) {
            console.log('Check-in date is before check-out date, adjusting...');
            checkinEl.value = checkoutEl.value; // Set check-in to same day as check-out
            
            // Show user-friendly message
            const statusMessage = document.getElementById('gearStatusMessage');
            if (statusMessage) {
              statusMessage.innerHTML = `
                <div style="background: #fff3cd; color: #856404; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                  <strong>Date Adjusted:</strong> Check-in date cannot be before check-out date. Set to same day.
                </div>
              `;
              
              // Clear message after 3 seconds
              setTimeout(() => {
                statusMessage.innerHTML = '';
              }, 3000);
            }
          }
        }
        
        // Save the date change to the server
        try {
          eventContext.updateFromDOM();
          const checkOutDate = document.getElementById('checkoutDate')?.value || '';
          const checkInDate = document.getElementById('checkinDate')?.value || '';
          await eventContext.save(checkOutDate, checkInDate);
          console.log('Date saved successfully');
        } catch (err) {
          console.error('Error saving date:', err);
        }
        
        // Update inventory status without refreshing the page
        await loadGearInventory();
        renderInventoryStatus();
        
        // Validate dates and check for unavailable items
        const isValid = validateDateRange();
        if (isValid) {
          checkUnavailableItemsAndWarn();
        }
      });
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
  
  // Call validation on date changes - now handled in comprehensive listener above
  // ['checkoutDate', 'checkinDate'].forEach(id => {
  //   const el = document.getElementById(id);
  //   if (el) {
  //     el.addEventListener('change', () => {
  //       const isValid = validateDateRange();
  //       if (isValid) {
  //         checkUnavailableItemsAndWarn();
  //       }
  //     });
  //   }
  // });

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
    
    // Add package management buttons for owners
    const packageButtonsContainer = document.querySelector('.gear-controls');
    if (packageButtonsContainer && isOwner) {
      // Check if buttons already exist to avoid duplication
      if (!document.getElementById('savePackageBtn')) {
        const savePackageBtn = document.createElement('button');
        savePackageBtn.id = 'savePackageBtn';
        savePackageBtn.className = 'gear-control-btn save-package-btn';
        savePackageBtn.innerHTML = '💾 Save Package';
        savePackageBtn.title = 'Save current list as a reusable package';
        savePackageBtn.onclick = saveGearPackage;
        
        const loadPackageBtn = document.createElement('button');
        loadPackageBtn.id = 'loadPackageBtn';
        loadPackageBtn.className = 'gear-control-btn load-package-btn';
        loadPackageBtn.innerHTML = '📦 Load Package';
        loadPackageBtn.title = 'Load a saved gear package';
        loadPackageBtn.onclick = openPackagesModal;
        
        // Create a package controls container
        const packageControls = document.createElement('div');
        packageControls.className = 'package-controls-row';
        
        // Add buttons to the container
        packageControls.appendChild(savePackageBtn);
        packageControls.appendChild(loadPackageBtn);
        
        // Insert after list controls and before date controls
        const dateControls = packageButtonsContainer.querySelector('.date-controls');
        if (dateControls) {
          packageButtonsContainer.insertBefore(packageControls, dateControls);
        } else {
          // Fallback - add after list info
          const listInfo = packageButtonsContainer.querySelector('#listInfo');
          if (listInfo) {
            packageButtonsContainer.insertBefore(packageControls, listInfo.nextSibling);
          } else {
            // Last resort - just prepend
            packageButtonsContainer.prepend(packageControls);
          }
        }
      }
    } else if (!isOwner) {
      // Remove package buttons for non-owners
      const packageButtons = document.querySelectorAll('.save-package-btn, .load-package-btn');
      packageButtons.forEach(btn => btn.remove());
      
      const packageControls = document.querySelector('.package-controls-row');
      if (packageControls) {
        packageControls.remove();
      }
    }
    
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
        adminLink = document.createElement('a');
        adminLink.id = 'adminGearLink';
        adminLink.href = '/pages/add-gear.html';
        adminLink.className = 'admin-gear-link btn-text'; // Add .btn-text for Material styling
        adminLink.innerHTML = '<span class="material-symbols-outlined">settings</span> Manage Inventory'; // Changed icon and text
        // Remove most inline styles, rely on CSS classes
        adminLink.style.display = 'inline-block'; 
        adminLink.style.textDecoration = 'none';
        adminLink.style.margin = '0'; // Keep essential layout styles if needed
        
        const adminRow = document.querySelector('.admin-row');
        if (adminRow) {
          adminRow.appendChild(adminLink);
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

    // Hide new list and delete buttons for non-owners
    document.querySelectorAll('.new-list-btn, .delete-btn').forEach(btn => {
      btn.style.display = isOwner ? 'inline-block' : 'none';
    });

    // Add/remove 'owner' class on body for CSS fallback
    document.body.classList.toggle('owner', isOwner);

    // Hide and disable Delete List button for non-owners
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.style.display = isOwner ? 'inline-block' : 'none';
      btn.disabled = !isOwner;
    });
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

  // ========= PACKAGE MANAGEMENT =========

  // Save current gear list as a package
  async function saveGearPackage() {
    try {
      const packageData = eventContext.getCurrentGearData();
      
      // First, make sure we have items to save
      let itemCount = 0;
      for (const category in packageData.categories) {
        itemCount += packageData.categories[category].length;
      }
      
      if (itemCount === 0) {
        alert("Cannot save empty package. Please add some items to your list first.");
        return;
      }
      
      // Get name and description with clear instructions
      packageData.name = prompt(
        "Enter a name for this gear package.\n\n" +
        "This will save your current list as a reusable package that you can load in the future."
      )?.trim();
      
      if (!packageData.name) return;
      
      packageData.description = prompt(
        "Enter a description for this package (optional):\n\n" +
        "This helps identify what the package is for (e.g., 'Basic interview kit', 'Full production setup')"
      )?.trim() || "";
      
      // Log the data we're about to send
      console.debug("Saving package data:", JSON.stringify(packageData, null, 2));
      console.debug("API endpoint:", `${window.API_BASE}/api/gear-packages`);
      console.debug("Token available:", !!token);
      
      // Save package to server
      const res = await fetch(`${window.API_BASE}/api/gear-packages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: localStorage.getItem('token')
        },
        body: JSON.stringify(packageData)
      });
      
      // Log the response status
      console.debug("API response status:", res.status);
      
      if (!res.ok) {
        const text = await res.text();
        console.error("API error response:", text);
        throw new Error(`Status ${res.status}: ${text}`);
      }
      
      const savedPackage = await res.json();
      console.debug("Package saved successfully:", savedPackage);
      
      // Show a more detailed success message with counts
      let inventoryCount = packageData.inventoryIds.length;
      let customCount = itemCount - inventoryCount;
      
      showNotification(`
        Package "${packageData.name}" has been saved!<br>
        ${inventoryCount} inventory items and ${customCount} custom items included.
      `, 'success');
    } catch (err) {
      console.error("Error saving gear package:", err);
      
      // Show more detailed error in the console
      if (err.message) console.error("Error message:", err.message);
      if (err.stack) console.error("Stack trace:", err.stack);
      
      // Show user-friendly error notification
      showNotification(`Failed to save package: ${err.message || 'Unknown error'}`, 'error');
      
      // Alert to make sure they see the error
      alert(`Failed to save package: ${err.message || 'Unknown error'}\nCheck the console for more details.`);
    }
  }

  // Helper to normalize user ID format - MongoDB may store IDs in different formats
  function normalizeUserId(id) {
    if (!id) return null;
    // Convert to string to ensure consistent comparison
    return String(id);
  }

  // Load packages from server
  async function loadGearPackages() {
    try {
      console.debug("Loading gear packages from API...");
      const userId = normalizeUserId(getUserIdFromToken());
      console.debug("Current user ID:", userId);
      
      try {
        // Try the primary endpoint first
        const res = await fetch(`${window.API_BASE}/api/gear-packages`, {
          headers: { 'Authorization': localStorage.getItem('token') }
        });
        
        console.debug("API response status:", res.status);
        
        if (!res.ok) {
          const text = await res.text();
          console.error("Error from primary endpoint:", text);
          throw new Error(`Status ${res.status}: ${text}`);
        }
        
        const packages = await res.json();
        console.debug("Packages retrieved:", packages.length);
        console.debug("Package data:", JSON.stringify(packages, null, 2));
        
        return packages;
      } catch (primaryErr) {
        // If primary endpoint fails, try the fallback
        console.warn("Primary endpoint failed. Trying fallback...", primaryErr);
        
        const fallbackRes = await fetch(`${window.API_BASE}/api/gear-packages-fallback`, {
          headers: { 'Authorization': localStorage.getItem('token') }
        });
        
        console.debug("Fallback API response status:", fallbackRes.status);
        
        if (!fallbackRes.ok) {
          const text = await fallbackRes.text();
          console.error("Fallback endpoint also failed:", text);
          throw new Error(`Status ${fallbackRes.status}: ${text}`);
        }
        
        const packages = await fallbackRes.json();
        console.debug("Packages retrieved from fallback:", packages.length);
        return packages;
      }
    } catch (err) {
      console.error("Error loading gear packages:", err);
      return [];
    }
  }

  // COMPLETELY REWRITTEN: Load packages directly from MongoDB
  async function loadGearPackages() {
    try {
      console.debug("Loading ALL gear packages from MongoDB...");
      
      // Use our simple endpoint that gets all packages without filtering
      const res = await fetch(`${window.API_BASE}/api/gear-packages-all`, {
        headers: { 'Authorization': localStorage.getItem('token') }
      });
      
      if (!res.ok) {
        const text = await res.text();
        console.error("Error loading packages:", text);
        throw new Error(`Status ${res.status}: ${text}`);
      }
      
      const data = await res.json();
      console.debug(`Found ${data.count} packages in database`);
      
      // Get current user ID for highlighting packages
      const currentUserId = normalizeUserId(getUserIdFromToken());
      
      // Extract just the packages array
      const packages = data.packages || [];
      
      // Add a flag to indicate if the package belongs to the current user
      const processedPackages = packages.map(pkg => ({
        ...pkg,
        isCurrentUser: normalizeUserId(pkg.userId) === currentUserId
      }));
      
      console.debug(`Processed ${processedPackages.length} packages`);
      return processedPackages;
    } catch (err) {
      console.error("Error loading gear packages:", err);
      return [];
    }
  }

  // Open package selection modal
  async function openPackagesModal() {
    try {
      // Create modal if it doesn't exist
      let modal = document.getElementById('packagesModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'packagesModal';
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content">
            <h3 id="packagesModalTitle">Select Package to Load</h3>
            <div id="packagesModalList"></div>
            <div class="modal-buttons" style="text-align:center; margin-top:18px;">
              <button id="closePackagesModalBtn" class="cancel-btn" style="background:#f5f5f5; color:#333; border:1px solid #ddd; border-radius:6px; padding:10px 28px; font-size:16px; font-weight:500; box-shadow:none; margin:0 auto; display:inline-block;">Cancel</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
      }
      
      // Show loading state
      const modalList = document.getElementById('packagesModalList');
      modalList.innerHTML = '<p style="text-align: center; color: #666;">Loading packages...</p>';
      modal.style.display = 'block';
      
      // Load packages from server
      try {
        const packages = (await loadGearPackages()).filter(pkg => pkg.isCurrentUser);
        let modalContent = '';
        if (packages.length === 0) {
          modalContent = `<p style="text-align: center; color: #666;">No packages found.</p>`;
        } else {
          modalContent = packages.map(pkg => `
            <div class="modal-item-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <button class="modal-item-btn" data-id="${pkg._id}" style="flex: 1; text-align: left;">
                <span style="font-weight: 600;">${pkg.name}</span><br>
                <span style="font-size: 13px; color: #888;">${pkg.description || 'No description'}</span>
                <div style="float: right; color: #aaa; font-size: 12px;">${new Date(pkg.createdAt).toLocaleString()}</div>
              </button>
              <button class="delete-package-btn" data-id="${pkg._id}" title="Delete package" style="margin-left: 10px; background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; border-radius: 5px; padding: 6px 12px; font-size: 15px; cursor: pointer;">🗑️</button>
            </div>
          `).join('');
        }
        modalList.innerHTML = modalContent;
        
        // Add event listeners for package buttons
        modalList.querySelectorAll('.modal-item-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const checkOutDate = document.getElementById('checkoutDate')?.value;
            const checkInDate = document.getElementById('checkinDate')?.value;
            if (!checkOutDate || !checkInDate) {
              alert('Please select both check-out and check-in dates before loading a package.');
              return;
            }
            const packageId = btn.dataset.id;
            const packageName = btn.querySelector('span').textContent;
            const confirmLoad = confirm(`Add items from package "${packageName}" to your current list?`);
            if (confirmLoad) {
              loadGearPackage(packageId);
              modal.style.display = 'none';
            }
          });
        });
        // Add event listeners for delete buttons
        modalList.querySelectorAll('.delete-package-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent triggering the load handler
            const packageId = btn.dataset.id;
            const row = btn.closest('.modal-item-row');
            const confirmDelete = confirm('Are you sure you want to permanently delete this package? This cannot be undone.');
            if (!confirmDelete) return;
            try {
              const res = await fetch(`${window.API_BASE}/api/gear-packages/${packageId}`, {
                method: 'DELETE',
                headers: { 'Authorization': localStorage.getItem('token') }
              });
              if (!res.ok) {
                const text = await res.text();
                alert(`Failed to delete package: ${text}`);
                return;
              }
              // Remove the row from the modal
              if (row) row.remove();
              showNotification('Package deleted successfully.', 'success');
            } catch (err) {
              alert('Error deleting package: ' + err.message);
            }
          });
        });
      } catch (loadErr) {
        modalList.innerHTML = `<p style="text-align: center; color: #cc0007; margin: 20px 0;">Error loading packages. Please try again.</p>`;
        console.error("Error loading packages for modal:", loadErr);
      }
      
      // Cancel button
      document.getElementById('closePackagesModalBtn').onclick = () => {
        modal.style.display = 'none';
      };
      
      // Add a small timeout to make sure styles are applied
      setTimeout(() => {
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
          // Get viewport height
          const viewportHeight = window.innerHeight;
          // Set max height to 80% of viewport
          modalContent.style.maxHeight = `${viewportHeight * 0.8}px`;
          modalContent.style.overflowY = 'auto';
        }
      }, 10);
    } catch (err) {
      console.error("Error opening packages modal:", err);
      showNotification("Failed to load packages. Check console for details.", 'error');
    }
  }

  // Direct bypass function for testing
  window.testGearPackageAPI = async function() {
    try {
      const userId = getUserIdFromToken();
      console.log("Testing direct access with user ID:", userId);
      
      // Try direct fetch to each endpoint
      console.log("Testing primary endpoint...");
      try {
        const res1 = await fetch(`${window.API_BASE}/api/gear-packages`, {
          headers: { 'Authorization': localStorage.getItem('token') }
        });
        const data1 = await res1.json();
        console.log("Primary endpoint result:", res1.status, data1);
      } catch (err1) {
        console.error("Primary endpoint error:", err1);
      }
      
      console.log("Testing fallback endpoint...");
      try {
        const res2 = await fetch(`${window.API_BASE}/api/gear-packages-fallback`, {
          headers: { 'Authorization': localStorage.getItem('token') }
        });
        const data2 = await res2.json();
        console.log("Fallback endpoint result:", res2.status, data2);
      } catch (err2) {
        console.error("Fallback endpoint error:", err2);
      }
      
      console.log("Test complete - check console for results");
      alert("API test complete. Check the browser console for results.");
    } catch (err) {
      console.error("Test failed:", err);
      alert("Test failed: " + err.message);
    }
  };

  // Load a specific package by ID
  async function loadGearPackage(packageId) {
    try {
      console.log("Loading package with ID:", packageId);
      
      // First try normal endpoint
      try {
        const res = await fetch(`${window.API_BASE}/api/gear-packages/${packageId}`, {
          headers: { 'Authorization': localStorage.getItem('token') }
        });
        
        if (!res.ok) {
          const text = await res.text();
          console.error("Error from primary endpoint:", text);
          throw new Error(`Status ${res.status}: ${text}`);
        }
        
        const packageData = await res.json();
        console.log("Package data retrieved:", packageData);
        
        // Process the package data as before
        await processPackageData(packageData);
        return;
      } catch (err) {
        console.error("Error from main package endpoint:", err);
        console.log("Trying alternative direct access method...");
        
        // Fallback to direct database query (using our new endpoint)
        const allRes = await fetch(`${window.API_BASE}/api/gear-packages-all`, {
          headers: { 'Authorization': localStorage.getItem('token') }
        });
        
        if (!allRes.ok) {
          throw new Error(`Failed to get packages: ${allRes.status}`);
        }
        
        const allData = await allRes.json();
        const packageData = allData.packages.find(p => p._id === packageId);
        
        if (!packageData) {
          throw new Error("Package not found in database");
        }
        
        console.log("Found package via direct query:", packageData);
        
        // Process the package data
        await processPackageData(packageData);
      }
    } catch (err) {
      console.error("Error loading gear package:", err);
      alert(`Failed to load package: ${err.message}`);
    }
  }

  // --- PATCH 1: Robustly skip unavailable inventory items when loading packages ---
  async function processPackageData(packageData) {
    // Enforce date selection
    const { checkOut, checkIn } = getSelectedDates();
    if (!checkOut || !checkIn) {
      alert('Please select both check-out and check-in dates before loading a package.');
      return;
    }
    // Track unavailable inventory items
    const unavailableItems = [];
    // Track custom items that match unavailable inventory items
    const customConflicts = [];
    // Ensure we have the current list data updated from DOM
    eventContext.updateFromDOM();
    const currentListName = eventContext.activeList;
    // First pass: collect unavailable items
    for (const category in packageData.categories) {
      if (!eventContext.lists[currentListName].categories[category]) {
        eventContext.lists[currentListName].categories[category] = [];
      }
      packageData.categories[category].forEach(item => {
        if (item.isInventory) {
          let inventoryItem = null;
          if (item.inventoryId) {
            inventoryItem = gearInventory.find(g => g._id === item.inventoryId);
          }
          if (!inventoryItem) {
            inventoryItem = gearInventory.find(g => g.label === item.label);
          }
          if (!(inventoryItem && isUnitAvailableForDates(inventoryItem, checkOut, checkIn))) {
            if (inventoryItem) {
              unavailableItems.push(`${inventoryItem.label} (Serial: ${inventoryItem.serial || 'N/A'})`);
            } else {
              unavailableItems.push(item.label + " (not found in inventory)");
            }
          }
        }
      });
    }
    // If there are unavailable items, warn the user and require confirmation
    if (unavailableItems.length > 0) {
      return new Promise(resolve => {
        showUnavailableWarningModal(unavailableItems, () => {
          // User confirmed, proceed to add available items
          actuallyAddPackageItems(packageData, checkOut, checkIn, currentListName, customConflicts);
          resolve();
        });
      });
    } else {
      // No unavailable items, proceed directly
      actuallyAddPackageItems(packageData, checkOut, checkIn, currentListName, customConflicts);
    }
  }

  // Helper to actually add available items from the package after confirmation
  function actuallyAddPackageItems(packageData, checkOut, checkIn, currentListName, customConflicts) {
    for (const category in packageData.categories) {
      packageData.categories[category].forEach(item => {
        // Skip if this exact item is already in the list (by inventoryId, serial, or label)
        const isDuplicate = eventContext.lists[currentListName].categories[category].some(
          existingItem =>
            (item.inventoryId && existingItem.inventoryId === item.inventoryId) ||
            (item.serial && existingItem.serial && item.serial === existingItem.serial) ||
            existingItem.label === item.label
        );
        if (isDuplicate) return;
        if (item.isInventory) {
          let inventoryItem = null;
          if (item.inventoryId) {
            inventoryItem = gearInventory.find(g => g._id === item.inventoryId);
          }
          if (!inventoryItem) {
            inventoryItem = gearInventory.find(g => g.label === item.label);
          }
          if (inventoryItem && isUnitAvailableForDates(inventoryItem, checkOut, checkIn)) {
            eventContext.lists[currentListName].categories[category].push({
              label: inventoryItem.label,
              checked: item.checked,
              inventoryId: inventoryItem._id,
              checkOutDate: checkOut,
              checkInDate: checkIn
            });
            if (checkOut && checkIn) {
              checkOutInventoryItem(inventoryItem._id, checkOut, checkIn);
            }
          }
        } else {
          const unavailableMatch = gearInventory.find(g => g.label === item.label && !isUnitAvailableForDates(g, checkOut, checkIn));
          if (unavailableMatch) {
            customConflicts.push(`${item.label} (matches unavailable inventory)`);
            return;
          }
          eventContext.lists[currentListName].categories[category].push({
            label: item.label,
            checked: item.checked
          });
        }
      });
    }
    renderGear();
    triggerAutosave();
    // Show warning for custom conflicts
    let warnMsg = '';
    if (customConflicts.length > 0) {
      warnMsg += `<span style="color: #dc3545;">The following custom items match unavailable inventory and may not be reservable:</span><br><strong>${customConflicts.join(', ')}</strong>`;
    }
    if (warnMsg) {
      showNotification(`Package items were added to your list "<strong>${currentListName}</strong>".<br>${warnMsg}`, 'warning');
    } else {
      showNotification(`Package items were successfully added to your list "<strong>${currentListName}</strong>"!`, 'success');
    }
  }

  // --- PATCH 2: Ensure eventContext.tableId is always set correctly on page load ---
  // REMOVED: This DOMContentLoaded listener was interfering with SPA navigation
  // by overriding localStorage with potentially stale event IDs.
  // Event context is now properly set via the initPage function called by the navigation system.

  // Helper function to check out an inventory item
  async function checkOutInventoryItem(gearId, checkOut, checkIn) {
    try {
      await fetch(`${window.API_BASE}/api/gear-inventory/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: localStorage.getItem('token')
        },
        body: JSON.stringify({
          gearId: gearId,
          eventId: eventContext.tableId,
          checkOutDate: checkOut,
          checkInDate: checkIn
        })
      });
      
      // Refresh inventory
      await loadGearInventory();
    } catch (err) {
      console.error('Error checking out item for package:', err);
    }
  }

  // Helper function to show notifications
  function showNotification(message, type = 'success') {
    const statusMessage = document.getElementById('gearStatusMessage');
    
    let bgColor, textColor;
    switch (type) {
      case 'success':
        bgColor = '#d4edda';
        textColor = '#155724';
        break;
      case 'warning':
        bgColor = '#fff3cd';
        textColor = '#856404';
        break;
      case 'error':
        bgColor = '#f8d7da';
        textColor = '#721c24';
        break;
      default:
        bgColor = '#d1ecf1';
        textColor = '#0c5460';
    }
    
    statusMessage.innerHTML = `
      <div style="background: ${bgColor}; color: ${textColor}; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
        ${message}
      </div>
    `;
    
    // Auto-hide after 10 seconds for non-errors
    if (type !== 'error') {
      setTimeout(() => {
        if (statusMessage.innerHTML.includes(message)) {
          statusMessage.innerHTML = '';
        }
      }, 10000);
    }
  }

  // ========= END PACKAGE MANAGEMENT =========

  // Expose new functions on window
  window.saveGearPackage = saveGearPackage;
  window.openPackagesModal = openPackagesModal;
  
  // Add a fix utility for gear packages
  window.fixGearPackages = async function() {
    try {
      // Create a status display
      let statusDiv = document.getElementById('packageFixStatus');
      if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'packageFixStatus';
        statusDiv.style.position = 'fixed';
        statusDiv.style.top = '10px';
        statusDiv.style.right = '10px';
        statusDiv.style.padding = '15px';
        statusDiv.style.background = '#f8f9fa';
        statusDiv.style.border = '1px solid #ddd';
        statusDiv.style.borderRadius = '5px';
        statusDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        statusDiv.style.zIndex = '9999';
        statusDiv.style.maxWidth = '400px';
        document.body.appendChild(statusDiv);
      }
      
      const updateStatus = (message, isError = false) => {
        statusDiv.innerHTML += `<div style="margin-bottom: 8px; color: ${isError ? '#cc0007' : '#212529'}">${message}</div>`;
        statusDiv.scrollTop = statusDiv.scrollHeight;
      };
      
      statusDiv.innerHTML = '<h3>Package Fix Utility</h3>';
      
      // 1. Get current user ID
      const userId = getUserIdFromToken();
      updateStatus(`User ID from token: ${userId}`);
      
      // 2. Check if packages exist in the database
      updateStatus('Testing direct database access...');
      try {
        const testRes = await fetch(`${window.API_BASE}/api/gear-packages-test/${userId}`, {
          headers: { 'Authorization': localStorage.getItem('token') }
        });
        
        const testData = await testRes.json();
        updateStatus(`Direct test found ${testData.count || 0} packages`);
        
        if (testData.count > 0) {
          updateStatus('✅ Packages found in database!');
        } else {
          updateStatus('⚠️ No packages found in database', true);
        }
      } catch (testErr) {
        updateStatus(`Error in direct test: ${testErr.message}`, true);
      }
      
      // 3. Try normal API endpoint
      updateStatus('Testing primary API endpoint...');
      try {
        const apiRes = await fetch(`${window.API_BASE}/api/gear-packages`, {
          headers: { 'Authorization': localStorage.getItem('token') }
        });
        
        if (!apiRes.ok) {
          updateStatus(`Primary API error: ${apiRes.status}`, true);
          throw new Error(`Status ${apiRes.status}`);
        }
        
        const apiData = await apiRes.json();
        updateStatus(`Primary API found ${apiData.length || 0} packages`);
        
        if (apiData.length > 0) {
          updateStatus('✅ API endpoint working correctly!');
          updateStatus('Try loading packages again');
          return;
        } else {
          updateStatus('⚠️ API returned empty result', true);
        }
      } catch (apiErr) {
        updateStatus(`Primary API error: ${apiErr.message}`, true);
      }
      
      // 4. Try fallback endpoint
      updateStatus('Testing fallback API endpoint...');
      try {
        const fallbackRes = await fetch(`${window.API_BASE}/api/gear-packages-fallback`, {
          headers: { 'Authorization': localStorage.getItem('token') }
        });
        
        if (!fallbackRes.ok) {
          updateStatus(`Fallback API error: ${fallbackRes.status}`, true);
          throw new Error(`Status ${fallbackRes.status}`);
        }
        
        const fallbackData = await fallbackRes.json();
        updateStatus(`Fallback API found ${fallbackData.length || 0} packages`);
        
        if (fallbackData.length > 0) {
          updateStatus('✅ Fallback endpoint working!');
          updateStatus('Try loading packages again');
          return;
        } else {
          updateStatus('⚠️ Fallback also returned empty result', true);
        }
      } catch (fallbackErr) {
        updateStatus(`Fallback API error: ${fallbackErr.message}`, true);
      }
      
      // 5. Try to add test endpoint
      updateStatus('Adding test endpoint for package retrieval...');
      
      // Create a small test package to verify saving works
      const testPackage = {
        name: "Test Package " + new Date().toISOString().substring(0, 10),
        description: "Created by fix utility",
        categories: {
          "Cameras": [
            { label: "Test Camera", checked: false, isInventory: false }
          ]
        },
        inventoryIds: []
      };
      
      try {
        const saveRes = await fetch(`${window.API_BASE}/api/gear-packages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: localStorage.getItem('token')
          },
          body: JSON.stringify(testPackage)
        });
        
        if (!saveRes.ok) {
          updateStatus(`Error saving test package: ${saveRes.status}`, true);
        } else {
          const savedData = await saveRes.json();
          updateStatus(`✅ Test package created: ${savedData._id}`);
          updateStatus('Try loading packages again');
        }
      } catch (saveErr) {
        updateStatus(`Error creating test package: ${saveErr.message}`, true);
      }
      
      updateStatus('Diagnostic complete. Check console for more details.');
    } catch (err) {
      console.error('Fix utility error:', err);
      alert('Error in fix utility: ' + err.message);
    }
  };

  // Diagnostic function to check token and user ID
  function diagnoseTokenAndUserId() {
    try {
      const token = localStorage.getItem('token');
      console.log("Token available:", !!token);
      
      if (!token) {
        alert("No token found. You may need to log in again.");
        return;
      }
      
      // Try to decode token
      try {
        const parts = token.split('.');
        console.log("Token has correct format (3 parts):", parts.length === 3);
        
        if (parts.length !== 3) {
          alert("Token format is invalid. Try logging out and back in.");
          return;
        }
        
        // Decode the payload (middle part)
        const payload = JSON.parse(atob(parts[1]));
        console.log("Token payload:", payload);
        console.log("User ID from token:", payload.id);
        console.log("User ID type:", typeof payload.id);
        
        // Compare with package data
        const userId = normalizeUserId(payload.id);
        console.log("Normalized user ID:", userId);
        console.log("This is the ID that should match MongoDB documents");
        
        // Check packages from server
        fetch(`${window.API_BASE}/api/gear-packages`, {
          headers: { 'Authorization': localStorage.getItem('token') }
        })
        .then(res => res.json())
        .then(packages => {
          console.log("Packages from API:", packages);
          console.log("Number of packages:", packages.length);
          
          if (packages.length > 0) {
            alert(`Found ${packages.length} packages for your account.`);
          } else {
            alert("No packages found. This suggests a data mismatch between saved packages and your current user ID.");
          }
        })
        .catch(err => {
          console.error("Error fetching packages:", err);
          alert("Error fetching packages: " + err.message);
        });
        
      } catch (decodeErr) {
        console.error("Error decoding token:", decodeErr);
        alert("Error decoding JWT token: " + decodeErr.message);
        return;
      }
    } catch (err) {
      console.error("Diagnostic error:", err);
      alert("Diagnostic error: " + err.message);
    }
  }

  // Expose diagnostic function to window for debugging
  window.diagnoseTokenAndUserId = diagnoseTokenAndUserId;

  // These duplicate listeners are removed - handled by comprehensive listener above
  // document.getElementById('checkoutDate').addEventListener('change', async () => {
  //   console.log('[Date Change] Checkout date changed, refreshing inventory...');
  //   await loadGearInventory();
  //   renderInventoryStatus();
  //   triggerAutosave();
  // });
  // document.getElementById('checkinDate').addEventListener('change', async () => {
  //   console.log('[Date Change] Checkin date changed, refreshing inventory...');
  //   await loadGearInventory();
  //   renderInventoryStatus();
  //   triggerAutosave();
  // });

  // Temporary debug function to inspect gear data
  window.debugGearData = function() {
    console.log('=== GEAR DATA DEBUG ===');
    console.log('Active list:', eventContext.activeList);
    console.log('All lists:', eventContext.lists);
    
    if (eventContext.activeList && eventContext.lists[eventContext.activeList]) {
      const activeList = eventContext.lists[eventContext.activeList];
      console.log('Active list categories:', activeList.categories);
      
      Object.keys(activeList.categories).forEach(category => {
        const items = activeList.categories[category];
        console.log(`Category "${category}":`, items);
        
        items.forEach((item, index) => {
          console.log(`  Item ${index + 1}:`, {
            label: item.label,
            checked: item.checked,
            inventoryId: item.inventoryId,
            checkOutDate: item.checkOutDate,
            checkInDate: item.checkInDate
          });
        });
      });
    }
    
    console.log('=== INVENTORY DATA DEBUG ===');
    if (window.gearInventory) {
      const batteries = window.gearInventory.filter(item => item.label.toLowerCase().includes('battery') || item.label.toLowerCase().includes('np-fz100'));
      console.log('Battery items in inventory:', batteries);
      
      batteries.forEach(battery => {
        console.log(`Battery: ${battery.label}`);
        console.log(`  Total quantity: ${battery.quantity}`);
        console.log(`  Reservations: ${battery.reservations?.length || 0}`);
        if (battery.reservations) {
          battery.reservations.forEach((res, i) => {
            console.log(`    Reservation ${i + 1}: ${res.quantity} units from ${res.checkOutDate} to ${res.checkInDate} for event ${res.eventId}`);
          });
        }
        console.log(`  History entries: ${battery.history?.length || 0}`);
        if (battery.history) {
          battery.history.forEach((hist, i) => {
            console.log(`    History ${i + 1}: ${hist.quantity || 1} units from ${hist.checkOutDate} to ${hist.checkInDate} for event ${hist.event}`);
          });
        }
      });
    }
  };
  
  // Debug function to test deletion
  window.debugDeleteItem = function(itemLabel) {
    console.log('=== DELETE DEBUG ===');
    const activeList = eventContext.lists[eventContext.activeList];
    if (!activeList) {
      console.log('No active list');
      return;
    }
    
    let foundItem = null;
    let foundCategory = null;
    
    Object.keys(activeList.categories).forEach(category => {
      const items = activeList.categories[category];
      const item = items.find(i => i.label === itemLabel);
      if (item) {
        foundItem = item;
        foundCategory = category;
      }
    });
    
    if (foundItem) {
      console.log('Found item to delete:', foundItem);
      console.log('In category:', foundCategory);
      
      const inventoryItem = gearInventory.find(g => g._id === foundItem.inventoryId || g.label === foundItem.label);
      if (inventoryItem) {
        console.log('Matching inventory item:', inventoryItem);
      } else {
        console.log('No matching inventory item found');
      }
    } else {
      console.log('Item not found:', itemLabel);
    }
  };

  // Helper function to release inventory reservation for an item
  async function releaseInventoryReservation(item, checkOutDate, checkInDate) {
    console.log(`[RELEASE] Starting release process for item:`, item);
    
    // Find the inventory item by inventoryId (preferred) or label as fallback
    let inventoryItem = null;
    if (item.inventoryId) {
      inventoryItem = gearInventory.find(g => g._id === item.inventoryId);
      console.log(`[RELEASE] Found inventory item by ID:`, inventoryItem);
    } else {
      // Fallback: try to find by label, but strip quantity info first
      const baseLabel = item.label.replace(/\s*\(\d+\s*units?\)$/, '');
      inventoryItem = gearInventory.find(g => g.label === baseLabel);
      console.log(`[RELEASE] Found inventory item by base label "${baseLabel}":`, inventoryItem);
    }
    
    // If this is an inventory item, check it in
    if (inventoryItem && checkOutDate && checkInDate) {
      try {
        // For quantity items (quantity > 1), extract quantity from label or use default
        if (inventoryItem.quantity > 1) {
          // Use the actual quantity stored in the item object, or extract from label
          let quantityToRelease = item.quantity;
          
          // If not available, try to extract from the label
          if (!quantityToRelease || quantityToRelease === 1) {
            const labelMatch = item.label.match(/\((\d+)\s*units?\)$/);
            if (labelMatch) {
              quantityToRelease = parseInt(labelMatch[1]);
            } else {
              quantityToRelease = 1; // Default fallback
            }
          }
          
          console.log(`[RELEASE] Attempting to release ${quantityToRelease} units of ${inventoryItem.label}`);
          
          // Use the stored checkout dates from the item, not the current form dates
          const itemCheckOutDate = item.checkOutDate || checkOutDate;
          const itemCheckInDate = item.checkInDate || checkInDate;
          
          console.log(`[RELEASE] Using dates for API call: ${itemCheckOutDate} to ${itemCheckInDate}`);
          
          // Make the API call to release the quantity
          const res = await fetch(`${window.API_BASE}/api/gear-inventory/checkin`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: localStorage.getItem('token')
            },
            body: JSON.stringify({
              gearId: inventoryItem._id,
              eventId: eventContext.tableId,
              checkOutDate: itemCheckOutDate,
              checkInDate: itemCheckInDate,
              quantity: quantityToRelease
            })
          });
          
          if (res.ok) {
            const result = await res.json();
            console.log(`[RELEASE] Successfully released ${quantityToRelease} units:`, result);
            return true;
          } else {
            const errorText = await res.text();
            console.error(`[RELEASE] Failed to release reservation: ${errorText}`);
            return false;
          }
        } else {
          // For single items
          console.log(`[RELEASE] Processing single item release`);
          
          const res = await fetch(`${window.API_BASE}/api/gear-inventory/checkin`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: localStorage.getItem('token')
            },
            body: JSON.stringify({
              gearId: inventoryItem._id,
              eventId: eventContext.tableId,
              checkOutDate: item.checkOutDate || checkOutDate,
              checkInDate: item.checkInDate || checkInDate
            })
          });
          
          if (res.ok) {
            console.log(`[RELEASE] Successfully released single item`);
            return true;
          } else {
            const errorText = await res.text();
            console.error(`[RELEASE] Failed to release single item: ${errorText}`);
            return false;
          }
        }
      } catch (err) {
        console.error(`[RELEASE] Error releasing inventory reservation:`, err);
        return false;
      }
    } else {
      console.log(`[RELEASE] Item is not an inventory item or missing dates - no release needed`);
      return true; // Not an error, just nothing to release
    }
  }
})();
  
  
