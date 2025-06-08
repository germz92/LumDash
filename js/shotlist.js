// ===== SHOTLIST FUNCTIONALITY =====

// Use IIFE to prevent variable conflicts and create a clean scope
(function() {
  
// Get API base URL
const API_BASE = window.API_BASE || 'https://spa-lumdash-backend.onrender.com';
  
// Prevent multiple script loading conflicts
if (window.shotlistModule) {
  console.log('🎯 SHOTLIST: Module already loaded, cleaning up...');
  if (window.cleanupShotlist) {
    window.cleanupShotlist();
  }
}

// Reset module completely
window.shotlistModule = {
  shotlists: [],
  currentUserRole: null,
  isUserEditing: false,
  isInitialized: false
};

// Direct references to module variables to avoid sync issues
let shotlists = window.shotlistModule.shotlists;
let currentUserRole = window.shotlistModule.currentUserRole;
let isUserEditing = window.shotlistModule.isUserEditing;
let isInitialized = window.shotlistModule.isInitialized;
let selectedListId = null; // Track which list is currently selected

// Helper to sync local variables with module
const syncToModule = () => {
  window.shotlistModule.shotlists = shotlists;
  window.shotlistModule.currentUserRole = currentUserRole;
  window.shotlistModule.isUserEditing = isUserEditing;
  window.shotlistModule.isInitialized = isInitialized;
};

// Debug logging with prefix
const debugLog = (message, data = null) => {
  console.log(`🎯 SHOTLIST: ${message}`, data || '');
};

// Initialize shotlist page
async function initializeShotlist() {
  debugLog('Starting initialization...');
  
  try {
    // Setup event listeners
    setupEventListeners();
    debugLog('Event listeners set up');
    
    // Setup list event delegation
    setupListEventDelegation();
    debugLog('List event delegation set up');

    // Load initial data (this will also determine user role)
    await loadShotlists();
    debugLog('Initial data loaded');

    // Setup socket listeners
    setupSocketListeners();
    debugLog('Socket listeners set up');

    isInitialized = true;
    syncToModule();
    debugLog('Initialization complete');

  } catch (error) {
    console.error('🎯 SHOTLIST: Initialization failed:', error);
  }
}

// Get user role for permission checking based on table data
function getUserRole(tableData) {
  try {
    const userId = localStorage.getItem('userId');
    if (!userId || !tableData) {
      currentUserRole = 'viewer';
      syncToModule();
      return 'viewer';
    }

    const isOwner = Array.isArray(tableData.owners) && tableData.owners.includes(userId);
    const isLead = Array.isArray(tableData.leads) && tableData.leads.includes(userId);
    
    let role = 'viewer';
    if (isOwner) {
      role = 'owner';
    } else if (isLead) {
      role = 'lead';
    }
    
    currentUserRole = role;
    syncToModule();
    debugLog('User role determined', { userId, role, isOwner, isLead });
    return role;
  } catch (error) {
    console.error('🎯 SHOTLIST: Error getting user role:', error);
    currentUserRole = 'viewer';
    syncToModule();
    return 'viewer';
  }
}

// Check if user can edit (owners and leads only)
function canUserEdit() {
  return currentUserRole === 'owner' || currentUserRole === 'lead';
}

// Setup event listeners
function setupEventListeners() {
  debugLog('Setting up event listeners...');

  // Add new list - use event delegation to avoid issues with re-rendering
  document.addEventListener('click', (e) => {
    if (e.target.id === 'add-list-btn' || e.target.closest('#add-list-btn')) {
      e.preventDefault();
      e.stopPropagation();
      handleAddList();
    }
  });
  
  document.addEventListener('keypress', (e) => {
    if (e.target.id === 'new-list-input' && e.key === 'Enter') {
      e.preventDefault();
      handleAddList();
    }
  });
  
  document.addEventListener('focus', (e) => {
    if (e.target.id === 'new-list-input') {
      isUserEditing = true;
      syncToModule();
      debugLog('User started editing list input');
    }
  }, true);
  
  document.addEventListener('blur', (e) => {
    if (e.target.id === 'new-list-input') {
      setTimeout(() => {
        isUserEditing = false;
        syncToModule();
        debugLog('User stopped editing list input');
      }, 100);
    }
  }, true);
  
  // List selector dropdown is now handled in setupListEventDelegation
}

// Setup socket listeners
function setupSocketListeners() {
  debugLog('Setting up socket listeners...');
  
  if (typeof socket !== 'undefined' && socket) {
    socket.on('shotlistsUpdated', handleShotlistsUpdate);
    debugLog('Socket listeners registered');
  } else {
    debugLog('Socket not available');
  }
}

// Handle socket updates
function handleShotlistsUpdate(data) {
  debugLog('Received shotlists update from socket', data);
  debugLog('Socket shotlists data:', data.shotlists);
  
  if (isUserEditing) {
    debugLog('User is editing, deferring update');
    setTimeout(() => handleShotlistsUpdate(data), 500);
    return;
  }
  
  // Validate and ensure IDs are preserved
  const updatedShotlists = (data.shotlists || []).map(list => {
    if (!list._id) {
      debugLog('WARNING: List missing _id, generating new one:', list);
      list._id = generateId();
    }
    
    // Ensure items have IDs too
    if (list.items) {
      list.items = list.items.map(item => {
        if (!item._id) {
          debugLog('WARNING: Item missing _id, generating new one:', item);
          item._id = generateId();
        }
        return item;
      });
    }
    
    return list;
  });
  
  shotlists = updatedShotlists;
  syncToModule();
  renderShotlists();
}

// Load shotlists from server
async function loadShotlists() {
  debugLog('Loading shotlists from server...');
  
  try {
    const tableId = getCurrentTableId();
    if (!tableId) {
      debugLog('No table ID available');
      return;
    }

    const response = await fetch(`${API_BASE}/api/tables/${tableId}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load table: ${response.status}`);
    }

    const tableData = await response.json();
    shotlists = tableData.shotlists || [];
    
    // Determine user role based on table data
    getUserRole(tableData);
    
    // Important: sync after updating shotlists
    syncToModule();
    debugLog('Shotlists loaded', shotlists);
    
    renderShotlists();
    
  } catch (error) {
    console.error('🎯 SHOTLIST: Failed to load shotlists:', error);
    shotlists = [];
    // Set default role when we can't load table data
    currentUserRole = 'viewer';
    syncToModule();
    renderShotlists();
  }
}

// Get current table ID
function getCurrentTableId() {
  try {
    const tableId = localStorage.getItem('currentTable');
    debugLog('Current table ID', tableId);
    return tableId;
  } catch (error) {
    console.error('🎯 SHOTLIST: Error getting table ID:', error);
    return null;
  }
}

// Handle adding new list
async function handleAddList() {
  const input = document.getElementById('new-list-input');
  const listName = input.value.trim();
  
  if (!listName) {
    debugLog('Empty list name provided');
    return;
  }
  
  if (!canUserEdit()) {
    debugLog('User cannot edit');
    return;
  }
  
  debugLog('Adding new list', listName);
  
  try {
    const newList = {
      name: listName,
      items: [],
      createdAt: new Date().toISOString(),
      createdBy: localStorage.getItem('userId') || 'unknown'
    };
    
    shotlists.push(newList);
    syncToModule();
    await saveShotlists();
    
    // Select the newly created list
    const newListIndex = shotlists.length - 1;
    selectedListId = newList._id || `temp-list-${newListIndex}`;
    
    input.value = '';
    debugLog('List added successfully');
    
  } catch (error) {
    console.error('🎯 SHOTLIST: Failed to add list:', error);
  }
}

// Handle adding item to list
async function handleAddItem(listId, input) {
  const title = input.value.trim();
  
  if (!title) {
    debugLog('Empty item title provided');
    return;
  }
  
  debugLog('Adding item to list', { listId, title });
  
  try {
    // Try to find by ID first, then by index if it's a temp ID
    let list = shotlists.find(l => l._id === listId);
    
    if (!list && listId.startsWith('temp-list-')) {
      const tempIndex = parseInt(listId.replace('temp-list-', ''));
      if (!isNaN(tempIndex) && tempIndex < shotlists.length) {
        list = shotlists[tempIndex];
      }
    }
    
    if (!list) {
      debugLog('List not found', listId);
      return;
    }
    
    const newItem = {
      title: title,
      completed: false,
      createdAt: new Date().toISOString(),
      createdBy: localStorage.getItem('userId') || 'unknown'
    };
    
    list.items.push(newItem);
    
    // Clear input immediately and mark it as cleared
    input.value = '';
    input.dataset.shouldClear = 'true';
    
    await saveShotlists();
    debugLog('Item added successfully');
    
  } catch (error) {
    console.error('🎯 SHOTLIST: Failed to add item:', error);
  }
}

// Toggle item completion
async function toggleItemCompletion(listId, itemId) {
  debugLog('Toggling item completion', { listId, itemId });
  
  try {
    // Try to find by ID first, then by index if it's a temp ID
    let list = shotlists.find(l => l._id === listId);
    
    if (!list && listId.startsWith('temp-list-')) {
      const tempIndex = parseInt(listId.replace('temp-list-', ''));
      if (!isNaN(tempIndex) && tempIndex < shotlists.length) {
        list = shotlists[tempIndex];
      }
    }
    
    if (!list) {
      debugLog('List not found', listId);
      return;
    }
    
    // Try to find by ID first, then by index if it's a temp ID
    let item = list.items.find(i => i._id === itemId);
    
    if (!item && itemId.startsWith('temp-item-')) {
      const tempIndex = parseInt(itemId.replace('temp-item-', ''));
      if (!isNaN(tempIndex) && tempIndex < list.items.length) {
        item = list.items[tempIndex];
      }
    }
    
    if (!item) {
      debugLog('Item not found', itemId);
      return;
    }
    
    item.completed = !item.completed;
    
    if (item.completed) {
      // Item was just checked off - save completion info
      item.completedAt = new Date().toISOString();
      item.completedBy = localStorage.getItem('userId') || 'unknown';
      item.completedByName = localStorage.getItem('fullName') || 'Unknown User';
      console.log('🎯 SHOTLIST: Item completed by:', item.completedByName);
      console.log('🎯 SHOTLIST: User ID:', item.completedBy);
      console.log('🎯 SHOTLIST: Completed at:', item.completedAt);
      console.log('🎯 SHOTLIST: Full item data:', item);
      debugLog('Item completed by:', item.completedByName);
    } else {
      // Item was unchecked - clear completion info
      item.completedAt = null;
      item.completedBy = null;
      item.completedByName = null;
      console.log('🎯 SHOTLIST: Item unchecked, completion info cleared');
      debugLog('Item unchecked, completion info cleared');
    }
    
    await saveShotlists();
    debugLog('Item completion toggled successfully');
    
  } catch (error) {
    console.error('🎯 SHOTLIST: Failed to toggle item:', error);
  }
}

// Delete item
async function deleteItem(listId, itemId) {
  if (!canUserEdit()) {
    debugLog('User cannot edit');
    return;
  }
  
  debugLog('Deleting item', { listId, itemId });
  
  try {
    // Try to find by ID first, then by index if it's a temp ID
    let list = shotlists.find(l => l._id === listId);
    
    if (!list && listId.startsWith('temp-list-')) {
      const tempIndex = parseInt(listId.replace('temp-list-', ''));
      if (!isNaN(tempIndex) && tempIndex < shotlists.length) {
        list = shotlists[tempIndex];
      }
    }
    
    if (!list) {
      debugLog('List not found', listId);
      return;
    }
    
    // If it's a temp item ID, delete by index instead
    if (itemId.startsWith('temp-item-')) {
      const tempIndex = parseInt(itemId.replace('temp-item-', ''));
      if (!isNaN(tempIndex) && tempIndex < list.items.length) {
        list.items.splice(tempIndex, 1);
      }
    } else {
      list.items = list.items.filter(i => i._id !== itemId);
    }
    
    await saveShotlists();
    debugLog('Item deleted successfully');
    
  } catch (error) {
    console.error('🎯 SHOTLIST: Failed to delete item:', error);
  }
}

// Delete entire list
async function deleteList(listId) {
  if (!canUserEdit()) {
    debugLog('User cannot edit');
    return;
  }
  
  if (!confirm('Are you sure you want to delete this entire list?')) {
    return;
  }
  
  debugLog('Deleting list', listId);
  
  try {
    // If it's a temp list ID, delete by index instead
    if (listId.startsWith('temp-list-')) {
      const tempIndex = parseInt(listId.replace('temp-list-', ''));
      if (!isNaN(tempIndex) && tempIndex < shotlists.length) {
        shotlists.splice(tempIndex, 1);
      }
    } else {
      shotlists = shotlists.filter(l => l._id !== listId);
    }
    
    // If we deleted the currently selected list, select another one
    if (selectedListId === listId) {
      selectedListId = shotlists.length > 0 ? 
        (shotlists[0]._id || `temp-list-0`) : null;
    }
    
    syncToModule();
    await saveShotlists();
    debugLog('List deleted successfully');
    
  } catch (error) {
    console.error('🎯 SHOTLIST: Failed to delete list:', error);
  }
}

// Save shotlists to server
async function saveShotlists() {
  debugLog('Saving shotlists to server...');
  debugLog('Shotlists data being sent:', shotlists);
  
  try {
    const tableId = getCurrentTableId();
    if (!tableId) {
      debugLog('No table ID available for saving');
      return;
    }

    const response = await fetch(`${API_BASE}/api/tables/${tableId}/shotlists`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ shotlists })
    });

    if (!response.ok) {
      throw new Error(`Failed to save shotlists: ${response.status}`);
    }

    debugLog('Shotlists saved successfully');
    renderShotlists();
    
  } catch (error) {
    console.error('🎯 SHOTLIST: Failed to save shotlists:', error);
    throw error;
  }
}

// Render all shotlists
function renderShotlists() {
  debugLog('Rendering shotlists...', shotlists);
  
  const container = document.getElementById('lists-container');
  const emptyState = document.getElementById('empty-state');
  const listControls = document.getElementById('list-controls');
  const listSelectorSection = document.getElementById('list-selector-section');
  
  if (!container) {
    debugLog('Lists container not found');
    return;
  }
  
  // Show/hide controls based on permissions
  if (listControls) {
    listControls.style.display = canUserEdit() ? 'flex' : 'none';
  }
  
  // Update list selector dropdown
  updateListSelector();
  
  // Show/hide list selector based on whether there are lists
  if (listSelectorSection) {
    listSelectorSection.style.display = shotlists.length > 0 ? 'block' : 'none';
  }
  
  // Show/hide empty state
  if (shotlists.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    container.innerHTML = '';
    selectedListId = null;
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  
  // If no list is selected, select the first one
  if (!selectedListId && shotlists.length > 0) {
    selectedListId = shotlists[0]._id || `temp-list-0`;
  }
  
  // Find the selected list
  const selectedList = shotlists.find(list => {
    const listId = list._id || `temp-list-${shotlists.indexOf(list)}`;
    return listId === selectedListId;
  });
  
  if (!selectedList && shotlists.length > 0) {
    // If selected list no longer exists, select the first one
    selectedListId = shotlists[0]._id || `temp-list-0`;
    const selector = document.getElementById('list-selector');
    if (selector) selector.value = selectedListId;
    renderShotlists();
    return;
  }
  
  // Preserve input values before re-render (but not if they should be cleared)
  const inputValues = {};
  container.querySelectorAll('.shot-input').forEach(input => {
    if (input.value.trim() && !input.dataset.shouldClear) {
      const listId = input.dataset.listId;
      inputValues[listId] = input.value;
    }
  });
  
  // Remove all existing event listeners by cloning container
  const newContainer = container.cloneNode(false);
  container.parentNode.replaceChild(newContainer, container);
  
  // Render only the selected list
  if (selectedList) {
    const selectedIndex = shotlists.indexOf(selectedList);
    newContainer.innerHTML = renderShotlist(selectedList, selectedIndex);
    
    // Restore input values after re-render
    newContainer.querySelectorAll('.shot-input').forEach(input => {
      const listId = input.dataset.listId;
      if (inputValues[listId]) {
        input.value = inputValues[listId];
      }
      // Clean up the shouldClear flag
      delete input.dataset.shouldClear;
    });
    
    // Attach event listeners for the selected list
    attachListEventListeners(selectedList._id);
  } else {
    newContainer.innerHTML = '';
  }
  
  debugLog('Shotlists rendered successfully');
}

// Update the list selector dropdown
function updateListSelector() {
  const selector = document.getElementById('list-selector');
  if (!selector) return;
  
  // Clear existing options except the default
  selector.innerHTML = '<option value="">Choose a list...</option>';
  
  // Add options for each list
  shotlists.forEach((list, index) => {
    const listId = list._id || `temp-list-${index}`;
    const option = document.createElement('option');
    option.value = listId;
    option.textContent = list.name;
    if (listId === selectedListId) {
      option.selected = true;
    }
    selector.appendChild(option);
  });
  
  debugLog('List selector updated with', shotlists.length, 'options');
}

// Render a single shotlist
function renderShotlist(list, listIndex) {
  const completedCount = list.items.filter(item => item.completed).length;
  const totalCount = list.items.length;
  const progressText = `${completedCount}/${totalCount}`;
  
  const canEdit = canUserEdit();
  const listId = list._id || `temp-list-${listIndex}`;
  
  return `
    <div class="shot-list" data-list-id="${listId}" data-list-index="${listIndex}">
      <div class="list-header">
        <h3 class="list-title">${escapeHtml(list.name)}</h3>
        <div class="list-info">
          <span class="list-progress">${progressText}</span>
          ${canEdit ? `
            <div class="list-actions">
              <button class="btn-icon delete-list-btn" title="Delete List">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          ` : ''}
        </div>
      </div>
      
      <div class="list-content">
        ${list.items.map((item, itemIndex) => renderShotItem(item, itemIndex)).join('')}
        
        ${canEdit ? `
          <div class="add-shot-section">
            <div class="add-shot-input">
              <input type="text" class="shot-input" placeholder="Add new shot..." data-list-id="${listId}" data-list-index="${listIndex}">
              <button class="add-shot-btn" data-list-id="${listId}" data-list-index="${listIndex}">
                <span class="material-symbols-outlined">add</span>
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// Render a single shot item
function renderShotItem(item, itemIndex) {
  const canEdit = canUserEdit();
  const itemId = item._id || `temp-item-${itemIndex}`;
  
  // Format completion info if item is completed
  let completionInfo = '';
  if (item.completed && item.completedByName) {
    const completedDate = item.completedAt ? new Date(item.completedAt).toLocaleDateString() : '';
    console.log('🎯 SHOTLIST: Rendering completion info for:', item.title);
    console.log('🎯 SHOTLIST: Completed by:', item.completedByName);
    console.log('🎯 SHOTLIST: Completed date:', completedDate);
    completionInfo = `
      <div class="completion-info">
        <span class="completed-by">✓ ${escapeHtml(item.completedByName)}</span>
        ${completedDate ? `<span class="completed-date">${completedDate}</span>` : ''}
      </div>
    `;
  } else if (item.completed) {
    console.log('🎯 SHOTLIST: Item is completed but no completedByName:', item);
  }
  
  return `
    <div class="shot-item ${item.completed ? 'completed' : ''}" data-item-id="${itemId}" data-item-index="${itemIndex}">
      <input type="checkbox" class="shot-checkbox" ${item.completed ? 'checked' : ''}>
      <div class="shot-content">
        <div class="shot-title">${escapeHtml(item.title)}</div>
        ${completionInfo}
      </div>
      ${canEdit ? `
        <div class="shot-actions">
          <button class="btn-icon delete" title="Delete">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// Global event delegation for all list interactions
function setupListEventDelegation() {
  // Remove any existing delegation listeners
  document.removeEventListener('click', handleListClicks);
  document.removeEventListener('keypress', handleListKeypress);
  document.removeEventListener('change', handleListChanges);
  document.removeEventListener('focus', handleListFocus, true);
  document.removeEventListener('blur', handleListBlur, true);
  
  // Add fresh delegation listeners
  document.addEventListener('click', handleListClicks);
  document.addEventListener('keypress', handleListKeypress);
  document.addEventListener('change', handleListChanges);
  document.addEventListener('focus', handleListFocus, true);
  document.addEventListener('blur', handleListBlur, true);
}

function handleListClicks(e) {
  debugLog('Click detected on:', e.target);
  
  // Delete list button
  if (e.target.closest('.delete-list-btn')) {
    e.preventDefault();
    e.stopPropagation();
    const listElement = e.target.closest('.shot-list');
    if (listElement) {
      debugLog('Deleting list with ID:', listElement.dataset.listId);
      deleteList(listElement.dataset.listId);
    }
    return;
  }
  
  // Add shot button - check both the button and the span inside
  const addShotBtn = e.target.closest('.add-shot-btn');
  if (addShotBtn) {
    e.preventDefault();
    e.stopPropagation();
    debugLog('Add shot button clicked');
    
    // Find the actual list container (.shot-list), not just any element with data-list-id
    const listElement = addShotBtn.closest('.shot-list');
    debugLog('Found list element:', listElement);
    
    if (listElement) {
      const shotInput = listElement.querySelector('.shot-input');
      debugLog('Found shot input:', shotInput);
      debugLog('Shot input value:', shotInput?.value);
      
      if (shotInput) {
        const listId = listElement.dataset.listId;
        debugLog('Using list ID:', listId);
        handleAddItem(listId, shotInput);
      } else {
        debugLog('ERROR: Could not find shot input element');
      }
    } else {
      debugLog('ERROR: Could not find list element');
    }
    return;
  }
  
  // Delete item button
  if (e.target.closest('.shot-actions .btn-icon.delete')) {
    e.preventDefault();
    e.stopPropagation();
    const itemElement = e.target.closest('[data-item-id]');
    const listElement = e.target.closest('.shot-list');
    if (itemElement && listElement) {
      debugLog('Deleting item:', itemElement.dataset.itemId, 'from list:', listElement.dataset.listId);
      deleteItem(listElement.dataset.listId, itemElement.dataset.itemId);
    }
    return;
  }
}

function handleListKeypress(e) {
  if (e.target.classList.contains('shot-input') && e.key === 'Enter') {
    e.preventDefault();
    debugLog('Enter key pressed on shot input');
    const listElement = e.target.closest('.shot-list');
    if (listElement) {
      debugLog('Found list element for Enter key:', listElement.dataset.listId);
      handleAddItem(listElement.dataset.listId, e.target);
    } else {
      debugLog('ERROR: Could not find list element for Enter key');
    }
  }
}

function handleListChanges(e) {
  // Handle list selector dropdown
  if (e.target.id === 'list-selector') {
    selectedListId = e.target.value;
    debugLog('List selection changed:', selectedListId);
    renderShotlists();
    return;
  }
  
  // Handle shot checkboxes
  if (e.target.classList.contains('shot-checkbox')) {
    const itemElement = e.target.closest('[data-item-id]');
    const listElement = e.target.closest('.shot-list');
    if (itemElement && listElement) {
      toggleItemCompletion(listElement.dataset.listId, itemElement.dataset.itemId);
    }
  }
}

function handleListFocus(e) {
  if (e.target.classList.contains('shot-input')) {
    isUserEditing = true;
    syncToModule();
  }
}

function handleListBlur(e) {
  if (e.target.classList.contains('shot-input')) {
    setTimeout(() => {
      isUserEditing = false;
      syncToModule();
    }, 100);
  }
}

// Simplified function - no longer needs to attach individual listeners
function attachListEventListeners(listId) {
  // Event delegation handles everything now
  debugLog('Event delegation active for list:', listId);
}

// Generate unique ID compatible with MongoDB ObjectId format
function generateId() {
  // Generate a 24-character hex string (MongoDB ObjectId format)
  const timestamp = Math.floor(Date.now() / 1000).toString(16);
  const randomHex = 'xxxxxxxxxxxx'.replace(/[x]/g, () => {
    return (Math.random() * 16 | 0).toString(16);
  });
  return (timestamp + randomHex).padStart(24, '0').slice(0, 24);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Test functions for debugging
function testShotlistData() {
  debugLog('Creating test shotlist data...');
  
  shotlists = [
    {
      _id: 'test-list-1',
      name: 'Wedding Day Shots',
      items: [
        {
          _id: 'item-1',
          title: 'Bride getting ready',
          completed: true,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          completedBy: 'test-user-id',
          completedByName: 'John Photographer'
        },
        {
          _id: 'item-2',
          title: 'Ceremony entrance',
          completed: false,
          createdAt: new Date().toISOString()
        }
      ],
      createdAt: new Date().toISOString()
    }
  ];
  
  renderShotlists();
  debugLog('Test data created and rendered');
}

function testShotlistSave() {
  debugLog('Testing shotlist save...');
  saveShotlists().then(() => {
    debugLog('Save test completed');
  }).catch(error => {
    debugLog('Save test failed', error);
  });
}

// Page cleanup function
function cleanupShotlist() {
  debugLog('Cleaning up shotlist page...');
  
  // Remove socket listeners
  if (typeof socket !== 'undefined' && socket) {
    socket.off('shotlistsUpdated', handleShotlistsUpdate);
  }
  
  // Remove event delegation listeners
  document.removeEventListener('click', handleListClicks);
  document.removeEventListener('keypress', handleListKeypress);
  document.removeEventListener('change', handleListChanges);
  document.removeEventListener('focus', handleListFocus, true);
  document.removeEventListener('blur', handleListBlur, true);
  
  // Reset state
  shotlists = [];
  currentUserRole = null;
  isUserEditing = false;
  isInitialized = false;
  syncToModule();
  
  debugLog('Shotlist page cleaned up');
}

// Set up initPage function for app.js compatibility
window.initPage = async function(id) {
  debugLog('initPage called with id:', id);
  
  // Store the table ID
  if (id) {
    localStorage.setItem('currentTable', id);
    localStorage.setItem('eventId', id); // For compatibility
  }
  
  // Set event title
  try {
    const tableId = getCurrentTableId();
    if (tableId) {
      const response = await fetch(`${API_BASE}/api/tables/${tableId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const tableData = await response.json();
        const eventTitleEl = document.getElementById('eventTitle');
        if (eventTitleEl) {
          eventTitleEl.textContent = tableData.title ? `${tableData.title} - Shotlists` : 'Shotlists';
        }
      }
    }
  } catch (error) {
    console.error('Error loading event title:', error);
  }
  
  // Initialize the shotlist functionality
  await initializeShotlist();
};

// Export functions for global access
window.initializeShotlist = initializeShotlist;
window.cleanupShotlist = cleanupShotlist;
window.testShotlistData = testShotlistData;
window.testShotlistSave = testShotlistSave;

// Mark as loaded to prevent conflicts
window.__shotlistJsLoaded = true;

// Version identifier for cache debugging
console.log('🎯 SHOTLIST: Module loaded - Version: USER_TRACKING_DEBUG_v1.3 - ' + new Date().toISOString());
debugLog('Shotlist module loaded');

})(); // Close the IIFE 