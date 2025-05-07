(function() {
const categories = ["Cameras", "Lenses", "Lighting", "Support", "Accessories"];

const token = window.token || (window.token = localStorage.getItem('token'));


const params = new URLSearchParams(window.location.search);
let tableId = params.get('id');

let savedGearLists = {};
let activeList = '';
let saveTimeout;
let filterSetting = 'all';
let gearInventory = [];

console.log("Using API_BASE:", API_BASE);

// Fail-safe for missing config
if (!API_BASE || !token) {
  alert("Missing configuration: API_BASE or token is not set.");
  throw new Error("Missing API_BASE or token");
}


function goBack() {
  window.location.href = `event.html?id=${tableId}`;
}

async function loadGear() {
  console.log("Token:", token);
  console.log("Table ID:", tableId);
  console.log("API_BASE:", API_BASE);

  try {
    const res = await fetch(`${API_BASE}/api/tables/${tableId}/gear`, {
      headers: { Authorization: token }
    });
    console.log("Gear Fetch Status:", res.status);
    const text = await res.text();
    console.log("Gear Fetch Response:", text);

    if (!res.ok) throw new Error(`Status ${res.status}: ${text}`);

    const data = JSON.parse(text);
    savedGearLists = JSON.parse(JSON.stringify(data.lists || {})); // clean plain object
    activeList = Object.keys(savedGearLists)[0] || 'Default';

    // Set date pickers if present
    console.log("Check out date from API:", data.checkOutDate);
    console.log("Check in date from API:", data.checkInDate);
    
    const checkoutDateEl = document.getElementById('checkoutDate');
    const checkinDateEl = document.getElementById('checkinDate');
    
    if (checkoutDateEl && data.checkOutDate) {
      checkoutDateEl.value = data.checkOutDate;
    }
    
    if (checkinDateEl && data.checkInDate) {
      checkinDateEl.value = data.checkInDate;
    }

    ensureAllCategoriesExist();
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
    if (!activeList) return;
  
    if (Object.keys(savedGearLists).length === 1) {
      alert("You must keep at least one gear list.");
      return;
    }
  
    const confirmed = confirm(`Are you sure you want to delete the list "${activeList}"?`);
    if (!confirmed) return;
  
    delete savedGearLists[activeList];
  
    // Switch to the first remaining list
    activeList = Object.keys(savedGearLists)[0];
    ensureAllCategoriesExist();
    populateGearListDropdown();
    renderGear();
    triggerAutosave();
  }
  

async function loadEventTitle() {
    try {
      const res = await fetch(`${API_BASE}/api/tables/${tableId}`, {
        headers: { Authorization: token }
      });
  
      if (!res.ok) throw new Error("Failed to fetch table");
  
      const table = await res.json();
      document.getElementById('eventTitle').textContent = table.title || 'Untitled Event';
    } catch (err) {
      console.error("Failed to load event title:", err);
      document.getElementById('eventTitle').textContent = "Untitled Event";
    }
  }
  

function ensureAllCategoriesExist() {
  if (!savedGearLists[activeList]) {
    savedGearLists[activeList] = {};
  }
  for (const category of categories) {
    if (!savedGearLists[activeList][category]) {
      savedGearLists[activeList][category] = [];
    }
  }
}

function populateGearListDropdown() {
  const select = document.getElementById("gearListSelect");
  select.innerHTML = '';

  for (const listName of Object.keys(savedGearLists)) {
    const option = document.createElement("option");
    option.value = listName;
    option.textContent = listName;
    if (listName === activeList) option.selected = true;
    select.appendChild(option);
  }

  select.onchange = () => {
    activeList = select.value;
    ensureAllCategoriesExist();
    renderGear();
  };
}

function renderGear() {
  const container = document.getElementById("gearContainer");
  container.innerHTML = "";
  categories.forEach(createCategory);
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
  console.log("Current event ID:", tableId);
  if (unit.status === 'checked_out') {
    console.log("Unit is checked out to:", unit.checkedOutEvent);
    console.log("CheckIn date:", unit.checkInDate);
  }
  
  // Normalize dates to midnight for consistent comparison
  const normalizeDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    // Reset time part to midnight
    date.setUTCHours(0, 0, 0, 0);
    return date;
  };
  
  // First check status - if already checked out, only consider it available
  // if it's checked out to THIS event
  if (unit.status === 'checked_out') {
    // IMPORTANT: Compare as strings since MongoDB IDs are objects
    const unitEventId = unit.checkedOutEvent ? unit.checkedOutEvent.toString() : unit.checkedOutEvent;
    
    // If the item is checked out to this event, it's available for use
    if (unitEventId === tableId) {
      console.log("✅ Available: checked out to this event");
      return true;
    }
    
    // If it's checked out to another event, check if it will be available by our start date
    if (unit.checkInDate) {
      const checkInDate = normalizeDate(unit.checkInDate);
      const requestedStart = normalizeDate(checkOut);
      
      // If it will be checked in before or on our requested start date, it's available
      if (checkInDate && requestedStart && checkInDate <= requestedStart) {
        console.log("✅ Will be available: checkInDate <= requestedStart", 
                   checkInDate.toISOString(), "<=", requestedStart.toISOString());
        return true;
      } else {
        console.log("❌ Won't be available in time: checkInDate > requestedStart", 
                   checkInDate?.toISOString(), ">", requestedStart?.toISOString());
      }
    }
    
    // Otherwise, it's not available
    console.log("❌ Not available: checked out to another event");
    return false;
  }
  
  // For available items, check history for conflicts
  // Not considering entries for this event (which have been checked in)
  const reqStart = normalizeDate(checkOut);
  const reqEnd = normalizeDate(checkIn);
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  
  console.log("Looking for conflicts in history entries...");
  // Check if there are any conflicting future reservations
  const hasConflict = (unit.history || []).some((entry, index) => {
    console.log(`Examining history entry ${index}:`, entry);
    
    // IMPORTANT: Compare event IDs properly, ensuring both are strings
    const entryEventId = entry.event ? entry.event.toString() : null;
    
    // Skip entries for this event - they've been cancelled/checked in
    if (entryEventId === tableId) {
      console.log(`Entry ${index}: Skipping - belongs to this event (${entryEventId} === ${tableId})`);
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
    
    // Overlap if: (startA <= endB) && (endA >= startB)
    const overlap = reqStart <= entryEnd && reqEnd >= entryStart;
    
    if (overlap) {
      console.log(`❌ Entry ${index}: CONFLICT FOUND!`);
      console.log("Conflict details:", { 
        reqStart: reqStart.toISOString(),
        reqEnd: reqEnd.toISOString(),
        entryStart: entryStart.toISOString(),
        entryEnd: entryEnd.toISOString()
      });
    } else {
      console.log(`Entry ${index}: No conflict`);
    }
    
    return overlap;
  });
  
  // No conflicts means it's available
  if (!hasConflict) {
    console.log("✅ Available: No conflicts found in history");
  }
  return !hasConflict;
}

function createRow(item) {
  const safeLabel = item.label.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const el = document.createElement("div");
  el.className = "item";
  el.innerHTML = `<input type='checkbox' ${item.checked ? 'checked' : ''}><input type='text' value="${safeLabel}" />`;
  // Add delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '🗑';
  deleteBtn.title = 'Delete item';
  deleteBtn.style.marginLeft = '8px';
  deleteBtn.onclick = async () => {
    // If this item is a reserved inventory item, check it in
    const reserved = gearInventory.find(g => g.label === item.label && g.checkedOutEvent === tableId);
    if (reserved && reserved.status === 'checked_out') {
      try {
        await fetch(`${API_BASE}/api/gear-inventory/checkin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token
          },
          body: JSON.stringify({
            gearId: reserved._id,
            eventId: tableId,
            checkOutDate: reserved.checkOutDate,
            checkInDate: reserved.checkInDate
          })
        });
        await loadGearInventory();
      } catch (err) {
        console.error('Failed to check in gear:', err);
      }
    }
    el.remove();
    triggerAutosave();
  };
  el.appendChild(deleteBtn);
  return el;
}

function createCategory(name) {
  const container = document.getElementById("gearContainer");
  const section = document.createElement("div");
  section.className = "category";
  section.innerHTML = `<h3>${name}</h3><div class="item-list"></div>`;
  const list = section.querySelector(".item-list");

  const items = savedGearLists[activeList][name] || [];

  items.forEach(item => {
    if ((filterSetting === "checked" && !item.checked) || (filterSetting === "unchecked" && item.checked)) return;
    list.appendChild(createRow(item));
  });

  // Add + Add Item button for manual row addition
  const addRowBtn = document.createElement("button");
  addRowBtn.className = "add-btn";
  addRowBtn.textContent = "+ Add Item";
  addRowBtn.title = "Add a custom row";
  addRowBtn.onclick = () => {
    const newItem = { label: '', checked: false };
    list.appendChild(createRow(newItem));
    triggerAutosave();
  };

  // Add + button for reserving available inventory unit
  const reserveBtn = document.createElement("button");
  reserveBtn.className = "add-btn";
  reserveBtn.textContent = "+ Checkout Item";
  reserveBtn.title = "Reserve available inventory unit";
  reserveBtn.style.marginLeft = '8px';
  reserveBtn.onclick = async () => {
    const { checkOut, checkIn } = getSelectedDates();
    // Validate date range first
    if (!validateDateRange()) {
      return; // Don't proceed if dates are invalid
    }
    
    if (!checkOut || !checkIn) {
      document.getElementById('gearStatusMessage').textContent = 'Please select both check-out and check-in dates before checking out items.';
      // Highlight the date fields
      const outField = document.getElementById('checkoutDate');
      const inField = document.getElementById('checkinDate');
      if (outField) outField.style.borderColor = 'red';
      if (inField) inField.style.borderColor = 'red';
      setTimeout(() => {
        if (outField) outField.style.borderColor = '';
        if (inField) inField.style.borderColor = '';
      }, 2000);
      return;
    }
    // Show a list of available units for this category and dates
    const availableUnits = gearInventory.filter(g => g.category === name && isUnitAvailableForDates(g, checkOut, checkIn));
    if (!availableUnits.length) {
      document.getElementById('gearStatusMessage').textContent = `No available units in inventory for ${name} for the selected dates.`;
      return;
    }
    // Open modal
    openCheckoutModal(name, availableUnits, checkOut, checkIn, list);
  };

  // Wrap both buttons in a flex container
  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '10px';
  btnRow.style.justifyContent = 'center';
  btnRow.appendChild(addRowBtn);
  btnRow.appendChild(reserveBtn);
  section.appendChild(btnRow);

  container.appendChild(section);
}

function collectGearData() {
  const data = {};
  for (const category of categories) {
    data[category] = [];
  }

  document.querySelectorAll(".category").forEach(section => {
    const name = section.querySelector("h3").textContent;
    const items = Array.from(section.querySelectorAll(".item")).map(row => {
      const text = row.querySelector("input[type='text']").value.trim();
      const checked = row.querySelector("input[type='checkbox']").checked;
      return text ? { label: text, checked } : null;
    }).filter(Boolean);
    if (categories.includes(name)) {
      data[name] = items;
    }
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
    savedGearLists[activeList] = collectGearData();

    // Get date fields
    const checkOutDate = document.getElementById('checkoutDate')?.value || '';
    const checkInDate = document.getElementById('checkinDate')?.value || '';

    console.log("Saving gear to:", `${API_BASE}/api/tables/${tableId}/gear`);
    console.log("Token being used:", token);
    console.log("Payload:", JSON.stringify({ lists: savedGearLists, checkOutDate, checkInDate }, null, 2));

    const res = await fetch(`${API_BASE}/api/tables/${tableId}/gear`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token
      },
      body: JSON.stringify({ lists: savedGearLists, checkOutDate, checkInDate })
    });

    const responseText = await res.text();
    if (!res.ok) {
      throw new Error(`Status ${res.status}: ${responseText}`);
    }

    console.log("Save successful:", responseText);
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
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveGear, 500);
}

function createNewGearList() {
  const name = prompt("Enter a name for the new gear list:")?.trim();
  if (!name || savedGearLists[name]) return;

  savedGearLists[name] = {
    Cameras: [],
    Lenses: [],
    Lighting: [],
    Support: [],
    Accessories: []
  };

  activeList = name;
  populateGearListDropdown();
  renderGear();
  triggerAutosave();
}

async function loadGearInventory() {
  try {
    const res = await fetch(`${API_BASE}/api/gear-inventory`, {
      headers: { Authorization: token }
    });
    if (!res.ok) throw new Error('Failed to fetch gear inventory');
    gearInventory = await res.json();
    renderInventoryStatus();
  } catch (err) {
    document.getElementById('gearStatusMessage').textContent = 'Failed to load gear inventory.';
    console.error(err);
  }
}

function renderInventoryStatus() {
  const container = document.getElementById('gearStatusMessage');
  if (!gearInventory.length) {
    container.textContent = 'No gear inventory loaded.';
    return;
  }
  
  // Get selected dates
  const checkOut = document.getElementById('checkoutDate')?.value;
  const checkIn = document.getElementById('checkinDate')?.value;
  
  // Format date nicely
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      timeZone: 'UTC' // Prevent timezone shifts
    });
  };
  
  container.innerHTML = '<b>Inventory Status:</b><br>' + gearInventory.map(item => {
    // When dates are selected, use the same function as in the checkout modal
    // to determine availability
    const available = isUnitAvailableForDates(item, checkOut, checkIn);
    
    let status;
    if (available) {
      status = `<span style="color:green">Available</span>`;
    } else if (item.status === 'checked_out' && item.checkInDate) {
      // Show when it will be available
      status = `<span style="color:orange">Available after ${formatDate(item.checkInDate)}</span>`;
    } else {
      status = `<span style="color:red">Unavailable</span>`;
    }
    
    // Add more info for checked out items
    if (item.status === 'checked_out') {
      status += ` (Checked out ${item.checkedOutEvent === tableId ? 'to this event' : 'to another event'})`;
    }
    
    return `${item.label} (${item.category}): ${status}`;
  }).join('<br>');
}

// Modal logic
function openCheckoutModal(category, availableUnits, checkOut, checkIn, list) {
  const modal = document.getElementById('checkoutModal');
  const modalList = document.getElementById('modalItemList');
  const modalTitle = document.getElementById('modalTitle');
  modalTitle.textContent = `Select ${category} to Check Out`;
  modalList.innerHTML = '';
  
  // Double-check availability once more right before showing modal
  const trueAvailableUnits = availableUnits.filter(unit => isUnitAvailableForDates(unit, checkOut, checkIn));
  
  if (trueAvailableUnits.length === 0) {
    document.getElementById('gearStatusMessage').innerHTML = `
      <div style="background: #fff3cd; color: #856404; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
        <strong>No available units:</strong> All ${category} items are now reserved for the selected dates.
        This could be due to another user making a reservation at the same time.
        <br><br>
        <a href="repair-gear.html" target="_blank">Click here to run the repair tool</a> if you believe this is an error.
      </div>`;
    return;
  }
  
  trueAvailableUnits.forEach(unit => {
    const btn = document.createElement('button');
    btn.className = 'modal-item-btn';
    btn.textContent = `${unit.label}${unit.serial ? ' (S/N: ' + unit.serial + ')' : ''}`;
    btn.onclick = async () => {
      // Reserve the unit via API
      try {
        btn.disabled = true;
        btn.textContent = 'Checking out...';
        const res = await fetch(`${API_BASE}/api/gear-inventory/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token
          },
          body: JSON.stringify({
            gearId: unit._id,
            eventId: tableId,
            checkOutDate: checkOut,
            checkInDate: checkIn
          })
        });
        const data = await res.json();
        if (!res.ok) {
          let msg = data.error || 'Failed to reserve gear.';
          if (res.status === 409) {
            msg = "⚠️ This gear is already reserved for the selected dates. Please choose different dates or another item.";
            // Show repair tool link if conflict detected
            msg += '<br><br><a href="repair-gear.html" target="_blank">Click here to run the repair tool</a> if you believe this is an error.';
            
            document.getElementById('gearStatusMessage').innerHTML = `
              <div style="background: #fff3cd; color: #856404; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                ${msg}
              </div>`;
          } else {
            document.getElementById('gearStatusMessage').innerHTML = `
              <div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                ${msg}
              </div>`;
          }
          btn.disabled = false;
          btn.textContent = `${unit.label}${unit.serial ? ' (S/N: ' + unit.serial + ')' : ''}`;
          closeCheckoutModal();
          return;
        }
        
        // Track that this was successfully added
        unit.checkedOutEvent = tableId;
        unit.status = 'checked_out';
        
        // Add to list
        const row = createRow({ label: unit.label, checked: false });
        list.appendChild(row);
        
        // Close modal
        closeCheckoutModal();
        
        // Refresh inventory status & highlights
        await loadGearInventory();
        checkUnavailableItemsAndWarn();
        
        // Show success message
        document.getElementById('gearStatusMessage').innerHTML = `
          <div style="background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
            <strong>Success:</strong> ${unit.label} has been checked out for your event.
          </div>`;
        
        triggerAutosave();
      } catch (err) {
        console.error('Error checking out gear:', err);
        btn.disabled = false;
        btn.textContent = `${unit.label}${unit.serial ? ' (S/N: ' + unit.serial + ')' : ''}`;
        document.getElementById('gearStatusMessage').innerHTML = `
          <div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
            <strong>Error:</strong> ${err.message}
          </div>`;
      }
    };
    modalList.appendChild(btn);
  });
  
  // Update the existing Cancel button's click handler
  document.getElementById('closeModalBtn').onclick = closeCheckoutModal;
  
  modal.style.display = 'flex';
  modal.classList.add('show');
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModal');
  modal.style.display = 'none';
  modal.classList.remove('show');
}

window.addEventListener("DOMContentLoaded", async () => {
    await loadGear();
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
  });
  
  function initPage(id) {
    tableId = id || tableId;
    if (!API_BASE || !token || !tableId) {
      alert("Missing configuration: API_BASE, token, or tableId is not set.");
      throw new Error("Missing configuration");
    }
  
    loadGear();
    loadEventTitle();
    loadGearInventory();
  
    document.getElementById('gearContainer').addEventListener('input', triggerAutosave);
    document.getElementById('gearContainer').addEventListener('change', triggerAutosave);
    document.getElementById("filterCheckbox").addEventListener("change", e => {
      filterSetting = e.target.value;
      renderGear();
    });
    document.getElementById('checkoutDate').addEventListener('change', triggerAutosave);
    document.getElementById('checkinDate').addEventListener('change', triggerAutosave);
  }
  
  // ✅ Important: make initPage visible to app.js
  window.initPage = initPage;

  // Expose functions on window
  window.goBack = goBack;
  window.deleteGearList = deleteGearList;
  window.createNewGearList = createNewGearList;
  window.saveGear = saveGear;
  window.triggerAutosave = triggerAutosave;

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
})();
  
  
