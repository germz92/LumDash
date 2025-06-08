// --- DEBUG PATCH: Log all changes to localStorage.eventId ---
(function() {
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function(key, value) {
    if (key === 'eventId') {
      console.warn(`[DEBUG] localStorage.setItem('eventId', '${value}') called!`);
      console.trace('[DEBUG] Stack trace for eventId set:');
    }
    return originalSetItem.apply(this, arguments);
  };
})();

if (!localStorage.getItem('token') && !window.location.pathname.endsWith('index.html')) {
  window.location.replace('index.html');
}

console.log('🚀 app.js loaded and executing');
console.log(' app.js loaded');

const PAGE_CLASSES = [
  'events-page', 'general-page', 'crew-page', 'travel-page', 'gear-page', 'card-log-page', 'schedule-page', 'dashboard-page', 'login-page', 'register-page', 'users-page'
];

function setBodyPageClass(page) {
  PAGE_CLASSES.forEach(cls => document.body.classList.remove(cls));
  // Map travel-accommodation to travel-page for CSS compatibility
  if (page === 'travel-accommodation') {
    document.body.classList.add('travel-page');
  } else {
    document.body.classList.add(`${page}-page`);
  }
}

function getTableId() {
  const params = new URLSearchParams(window.location.search);
  const urlId = params.get('id');
  const storedId = localStorage.getItem('eventId');
  const result = urlId || storedId;
  
  console.log(`[getTableId] URL ID: ${urlId}, localStorage ID: ${storedId}, returning: ${result}`);
  
  return result;
}

// Global navigation state
let navigationInProgress = false;

function navigate(page, id) {
  // Prevent double navigation
  if (navigationInProgress) {
    console.log(`[NAVIGATE] Navigation already in progress, skipping duplicate call for page: ${page}`);
    return;
  }
  
  navigationInProgress = true;
  
  // Only require an ID for pages that need it
  const needsId = !['events', 'dashboard', 'login', 'register', 'users'].includes(page);
  
  // CRITICAL FIX: Determine the final tableId to use consistently throughout navigation
  let finalId = id;
  if (needsId && (!finalId || finalId === "null")) {
    finalId = getTableId();
    console.log(`[NAVIGATE] No valid ID provided for ${page}, using getTableId(): ${finalId}`);
  }
  
  if (needsId && (!finalId || finalId === "null")) {
    alert("No event selected. Please select an event first.");
    return;
  }

  // Set the correct body class for the page
  setBodyPageClass(page);

  // Store the event ID ONLY if we have a valid one and it's needed
  if (finalId && needsId) {
    localStorage.setItem('eventId', finalId);
    console.log(`[NAVIGATE] Set localStorage eventId to: ${finalId} for page: ${page}`);
  }
  
  // Clean up dropdown listeners before page transition
  cleanupDropdownListeners();
  
  // Clean up any existing page content and scripts
  const pageContainer = document.getElementById('page-container');
  if (pageContainer) {
    // Call any cleanup function from the current page before removing scripts
    // but only if we're not on the first load (window.currentPage will be set)
    if (window.currentPage) {
      // Check for page-specific cleanup functions
      const cleanupFunctionMap = {
        'schedule': 'cleanupSchedulePage',
        'card-log': 'cleanupCardLogPage',
        'shotlist': 'cleanupShotlist'
        // Add more page cleanup functions here as needed
      };
      
      const cleanupFunctionName = cleanupFunctionMap[window.currentPage] || 
                                 `cleanup${window.currentPage.charAt(0).toUpperCase() + window.currentPage.slice(1)}Page`;
      
      if (typeof window[cleanupFunctionName] === 'function') {
        console.log(`Calling ${cleanupFunctionName} for page:`, window.currentPage);
        try {
          window[cleanupFunctionName]();
        } catch (err) {
          console.error(`Error in ${cleanupFunctionName}:`, err);
        }
      }
    }
  
    // Remove all page scripts
    const oldScript = document.getElementById('page-script');
    if (oldScript) {
      oldScript.remove();
    }
    
    // Also remove any duplicate scripts
    document.querySelectorAll('script[id="page-script"]').forEach(script => {
      script.remove();
    });
 
    // Clear page container
    pageContainer.innerHTML = '';
  }
  
  // Update hash and load new page
  location.hash = `#${page}`;
  loadPageCSS(page);
  
  // Track the current page to know when we're navigating
  window.currentPage = page;
  
  // Save the current page state for PWA restoration
  saveCurrentPageState(page, finalId);
  
  // CRITICAL: Always pass the finalId (which is guaranteed to be valid for pages that need it)
  loadPage(page, needsId ? finalId : null);
  
  // Reset navigation flag after a short delay to allow the page to load
  setTimeout(() => {
    navigationInProgress = false;
  }, 100);
}

function loadPage(page, id) {
  fetch(`pages/${page}.html`)
    .then(res => res.text())
    .then(html => {
      // Wait for DOM to be ready if it isn't already
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          injectPageContent(html, page, id);
        });
      } else {
        injectPageContent(html, page, id);
      }
    })
    .catch(err => {
      console.error('Error loading page:', err);
    });
}

function injectPageContent(html, page, id) {
  // Use the simple page container
  const targetElement = document.getElementById('page-container');
  if (!targetElement) {
    console.error('page-container not found');
    return;
  }

  // Clear any existing content
  targetElement.innerHTML = '';
  
  // Add new content to the target element
  targetElement.innerHTML = html;
  
  // Show/hide bottom nav based on page and set it up
  const bottomNav = document.getElementById('bottomNav');
  if (bottomNav) {
    if (page === 'events') { // 'events' page usually doesn't show the main event-specific nav
      bottomNav.style.display = 'none';
    } else {
      bottomNav.style.display = ''; // Ensure it's visible for other pages
      // Centralized call to setup bottom navigation, including listeners and active state
      if (window.setupBottomNavigation) {
        console.log(`Calling window.setupBottomNavigation for page: ${page} with id: ${id}`);
        // CRITICAL FIX: Only use the explicit id if provided, don't fall back to getTableId()
        // The id should come from the navigation system and be reliable
        if (id) {
          window.setupBottomNavigation(bottomNav, id, page);
        } else {
          console.warn(`No event ID provided for page ${page}, setupBottomNavigation skipped`);
        }
      } else {
        console.error('window.setupBottomNavigation is not defined. Ensure it is globally available.');
      }
    }
  } else {
    console.log('Bottom navigation element (bottomNav) not found.');
  }

  // Initialize AI Chat Widget for pages with event ID
  if (id && typeof window.initChat === 'function') {
    console.log(`Initializing AI chat for page: ${page} with id: ${id}`);
    window.initChat(id);
  } else if (id) {
    console.warn('Chat widget not available - window.initChat not found');
  }

  // Lucide icons init should be called AFTER setupBottomNavigation has potentially changed data-lucide attributes
  // Note: updateActiveNavigation, called by setupBottomNavigation, already calls lucide.createIcons().
  // So, an additional call here might be redundant unless setupBottomNavigation might not run or not call it.
  // For safety, and because lucide.createIcons() is idempotent, a call here is okay.
  /* This is now removed as we are using Material Symbols
  if (window.lucide) {
    lucide.createIcons(); 
  }
  */

  // Remove any existing page script with the same ID
  const existingScript = document.getElementById('page-script');
  if (existingScript) {
    existingScript.remove();
  }
  
  // Also remove any duplicate scripts that might have been added
  document.querySelectorAll(`script[src=\"js/${page}.js\"]`).forEach(script => {
    script.remove();
  });
  
  // Check if script is already being loaded
  if (document.querySelector(`script[src="js/${page}.js"]`)) {
    console.log(`[SCRIPT_LOAD] Script js/${page}.js is already being loaded, skipping`);
    return;
  }

  // Reset page-specific global variables that might have been set by previous scripts
  // Clear any page-specific flags
  const pageFlags = {
    'schedule': ['__scheduleJsLoaded'],
    'card-log': ['__cardLogJsLoaded'],
    'shotlist': ['__shotlistJsLoaded']
    // Add other page flags as needed
  };
  
  if (pageFlags[page]) {
    pageFlags[page].forEach(flag => {
      window[flag] = false;
    });
  }

  // Clear global functions that might be set by page scripts to prevent conflicts
  window.initPage = null;
  
  // Clear any page-specific global functions
  const pageGlobals = [
    'addContactRow', 'addLocationRow', 'saveGeneralInfo', 'switchToEdit', // general.js
    'documentsPage', // documents.js
    // Add other page-specific globals as needed
  ];
  
  pageGlobals.forEach(globalName => {
    if (window[globalName]) {
      window[globalName] = null;
    }
  });

  // Dynamically load JS if it exists
  const script = document.createElement('script');
  script.src = `js/${page}.js?v=${Date.now()}`;
  script.id = 'page-script';
  
  console.log(`[SCRIPT_LOAD] Loading script for page: ${page}, src: ${script.src}`);
  
  // Make sure we handle load errors
  script.onerror = (error) => {
    console.error(`Error loading script for ${page}:`, error);
    console.error(`Script src that failed:`, script.src);
    console.error(`Script readyState:`, script.readyState);
    navigationInProgress = false; // Reset flag on error
  };
  
  script.onload = () => {
    console.log(`Script loaded for ${page}, calling window.initPage with id: ${id}`);
    console.log(`[SCRIPT_LOAD] Script src that just loaded: ${script.src}`);
    console.log(`[SCRIPT_LOAD] window.initPage exists: ${typeof window.initPage === 'function'}`);
    
    // Check if the script actually executed by looking for our debug marker
    if (window.__documentsJsLoaded) {
      console.log(`[SCRIPT_LOAD] documents.js execution confirmed via marker`);
    } else {
      console.warn(`[SCRIPT_LOAD] documents.js may not have executed properly - no execution marker found`);
    }
    
    // Small delay to ensure the script has been properly initialized
    setTimeout(() => {
      if (window.initPage) {
        try {
          // CRITICAL FIX: Always call initPage if it exists, but only pass ID for pages that need it
          const needsId = !['events', 'dashboard', 'login', 'register', 'users'].includes(page);
          
          if (needsId && id) {
            console.log(`[INIT_PAGE] Calling initPage with explicit id: ${id}`);
            window.initPage(id);
          } else if (needsId && !id) {
            console.warn(`[INIT_PAGE] Page ${page} needs event ID but none provided, initPage not called`);
          } else {
            // Page doesn't need an ID, call initPage without parameters
            console.log(`[INIT_PAGE] Calling initPage for page ${page} (no ID needed)`);
            window.initPage();
          }
        } catch (err) {
          console.error('Error initializing page:', err);
        }
      } else {
        console.warn('window.initPage is not defined after loading', script.src);
      }
    }, 50);
  };
  
  document.body.appendChild(script);
}

// Global dropdown state management
let dropdownEventListeners = {
  toggle: null,
  document: null,
  links: []
};

function cleanupDropdownListeners() {
  // Remove existing event listeners
  if (dropdownEventListeners.toggle) {
    const dropdownToggle = document.querySelector('.dropdown-toggle');
    if (dropdownToggle && dropdownEventListeners.toggle) {
      dropdownToggle.removeEventListener('click', dropdownEventListeners.toggle);
    }
  }
  
  if (dropdownEventListeners.document) {
    document.removeEventListener('click', dropdownEventListeners.document);
  }
  
  // Remove link event listeners
  dropdownEventListeners.links.forEach(({ element, handler }) => {
    if (element && handler) {
      element.removeEventListener('click', handler);
    }
  });
  
  // Reset the listeners object
  dropdownEventListeners = {
    toggle: null,
    document: null,
    links: []
  };
}

function setupDropdownMenu(tableId) {
  // Clean up any existing listeners first
  cleanupDropdownListeners();
  
  console.log(`🎯 setupDropdownMenu called with tableId: ${tableId} - Looking for dropdown elements...`);
  const dropdownToggle = document.querySelector('.dropdown-toggle');
  const dropdownMenu = document.getElementById('dropdownMenu');
  const dropdownLinks = document.querySelectorAll('.dropdown-menu a[data-page]');

  console.log('Dropdown toggle found:', !!dropdownToggle);
  console.log('Dropdown menu found:', !!dropdownMenu);
  console.log('Dropdown links found:', dropdownLinks.length);

  if (!dropdownToggle || !dropdownMenu) {
    console.log('❌ Dropdown elements not found, skipping setup');
    console.log('Available elements in document:');
    console.log('- .dropdown-toggle:', document.querySelectorAll('.dropdown-toggle').length);
    console.log('- #dropdownMenu:', document.querySelectorAll('#dropdownMenu').length);
    return;
  }

  console.log('✅ Setting up dropdown menu with', dropdownLinks.length, 'links');

  // Create toggle handler
  const toggleHandler = function(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('🎯 Dropdown toggle clicked, current state:', dropdownMenu.classList.contains('show'));
    dropdownMenu.classList.toggle('show');
  };
  
  // Create document click handler
  const documentHandler = function(e) {
    // Only proceed if the dropdown menu is currently shown
    if (dropdownMenu.classList.contains('show')) {
      if (!dropdownToggle.contains(e.target) && !dropdownMenu.contains(e.target)) {
        console.log('Clicking outside visible dropdown, closing');
        dropdownMenu.classList.remove('show');
      }
    }
  };

  // Add toggle event listener
  console.log('Adding click listener to dropdown toggle');
  dropdownToggle.addEventListener('click', toggleHandler);
  dropdownEventListeners.toggle = toggleHandler;

  // Add document click listener
  document.addEventListener('click', documentHandler);
  dropdownEventListeners.document = documentHandler;

  // Handle dropdown menu item clicks
  dropdownLinks.forEach(link => {
    const linkHandler = function(e) {
      e.preventDefault();
      const page = link.getAttribute('data-page');
      // Always get the latest eventId from localStorage at click time
      const currentEventId = localStorage.getItem('eventId');
      console.log(`Dropdown link clicked: ${page}, using currentEventId: ${currentEventId}`);
      dropdownMenu.classList.remove('show');
      window.navigate(page, currentEventId);
    };
    link.addEventListener('click', linkHandler);
    dropdownEventListeners.links.push({ element: link, handler: linkHandler });
  });
  
  // Mark as set up
  dropdownToggle.setAttribute('data-dropdown-setup', 'true');
  console.log('✅ Dropdown menu setup complete');
}

function loadPageCSS(page) {
  // Remove any previously added page CSS
  document.querySelectorAll('link[data-page-css]').forEach(link => link.remove());

  let cssFile = '';
  switch (page) {
    case 'events': cssFile = 'css/events.css'; break;
    case 'general': cssFile = 'css/general.css'; break;
    case 'crew': cssFile = 'css/crew.css'; break;
    case 'travel-accommodation': cssFile = 'css/travel-accommodation.css'; break;
    case 'gear': cssFile = 'css/gear.css'; break;
    case 'card-log': cssFile = 'css/card-log.css'; break;
    case 'schedule': cssFile = 'css/schedule.css'; break;
    case 'shotlist': cssFile = 'css/shotlist.css'; break;
    case 'users': cssFile = 'css/users.css'; break;
  }
  if (cssFile) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssFile;
    link.setAttribute('data-page-css', 'true'); // Mark for easy removal
    document.head.appendChild(link);
  }
}

// Handle hash changes (back/forward navigation)
window.addEventListener('hashchange', () => {
  // Prevent handling hashchange if navigation is already in progress
  if (navigationInProgress) {
    console.log(`[HASHCHANGE] Navigation in progress, skipping hashchange handler`);
    return;
  }
  
  const page = location.hash.replace('#', '') || 'events';
  console.log(`[HASHCHANGE] Hash changed to: ${page}`);
  
  // For hash changes (back/forward navigation), we need to be more careful about event IDs
  // Only pass an event ID if the page actually needs one
  const needsId = !['events', 'dashboard', 'login', 'register', 'users'].includes(page);
  
  if (needsId) {
    const currentEventId = localStorage.getItem('eventId');
    console.log(`[HASHCHANGE] Page ${page} needs event ID, using: ${currentEventId}`);
    navigate(page, currentEventId);
  } else {
    console.log(`[HASHCHANGE] Page ${page} doesn't need event ID`);
    navigate(page);
  }
});

// Initial load
window.addEventListener('DOMContentLoaded', () => {
  console.log('🔥 DOMContentLoaded fired, checking for elements...');
  console.log('page-container exists:', !!document.getElementById('page-container'));
  console.log('bottomNav exists:', !!document.getElementById('bottomNav'));
  
  // Reset any state that might be lingering from previous sessions
  window.currentPage = null;
  window.__scheduleJsLoaded = false;
  window.__cardLogJsLoaded = false;
  
  // Clean up any duplicate scripts that might exist
  const pageScripts = document.querySelectorAll('script[id="page-script"]');
  if (pageScripts.length > 0) {
    console.warn(`Found ${pageScripts.length} page scripts, cleaning up...`);
    pageScripts.forEach(script => script.remove());
  }
  
  // Reset body classes
  const PAGE_CLASSES_RESET = [
    'events-page', 'general-page', 'crew-page', 'travel-page', 'gear-page', 
    'card-log-page', 'schedule-page', 'dashboard-page', 'login-page', 'register-page'
  ];
  PAGE_CLASSES_RESET.forEach(cls => document.body.classList.remove(cls));
  
  // Get page from hash or default to events
  const page = location.hash.replace('#', '') || 'events';
  console.log(`[INITIAL_LOAD] Initial page load: ${page}`);
  
  // Use the same logic as hashchange handler for consistency
  const needsId = !['events', 'dashboard', 'login', 'register', 'users'].includes(page);
  
  if (needsId) {
    const currentEventId = localStorage.getItem('eventId');
    console.log(`[INITIAL_LOAD] Page ${page} needs event ID, using: ${currentEventId}`);
    navigate(page, currentEventId);
  } else {
    console.log(`[INITIAL_LOAD] Page ${page} doesn't need event ID`);
    navigate(page);
  }
});

// Expose navigate globally for nav links
window.navigate = navigate;
window.setupBottomNavigation = setupBottomNavigation;

// PullToRefresh.js integration for PWA/mobile
if (window.PullToRefresh) {
  PullToRefresh.init({
    mainElement: 'body',
    shouldPullToRefresh: function() {
      // Prevent pull-to-refresh if the user is pulling on a scrollable element
      const scrollableSelectors = [
        '.item-list', '.program-container', '.modal-content', '.table-cards', '.gear-container', '.card-log-table', '.schedule-page', '.crew-page', '.travel-page', '.general-page', '.card-container', '.modal', '.modal-content', '.list-group', '.info-section', '.contacts-container', '.contacts-scroll-wrapper', '.program-container', '.program-entry', '.date-section', '.date-header', '.event-header', '.event-details', '.action-buttons', '.table-card', '.table-cards', '.gear-page', '.schedule-page', '.crew-page', '.travel-page', '.general-page', '.dashboard-page', '.card-log-page', '.login-page', '.register-page'
      ];
      let el = document.elementFromPoint(window.innerWidth/2, 10);
      while (el) {
        if (scrollableSelectors.some(sel => el.matches && el.matches(sel))) {
          return false;
        }
        el = el.parentElement;
      }
      // Only allow pull-to-refresh when at the top of the page
      return window.scrollY === 0;
    },
    onRefresh() {
      console.log('PTR: onRefresh triggered', { currentPage: window.currentPage });
      // Show spinner (handled by library's custom icon)
      // Call SPA page refresh logic
      if (window.currentPage && window.navigate) {
        // Get the current event ID more reliably
        const currentEventId = localStorage.getItem('eventId');
        console.log(`PTR: Refreshing page ${window.currentPage} with eventId: ${currentEventId}`);
        window.navigate(window.currentPage, currentEventId);
      } else {
        window.location.reload();
      }
    },
    iconArrow: '<div class="ptr-spinner"><div class="loader"></div></div>',
    iconRefreshing: '<div class="ptr-spinner"><div class="loader"></div></div>',
    iconSuccess: '<div class="ptr-spinner"><div class="loader"></div></div>',
    distReload: 60,
    distThreshold: 60
  });
}

// Function to be called by pages after they load bottom navigation
function setupBottomNavigation(navContainer, tableId, currentPage) {
  if (!navContainer) {
    console.error('No navigation container provided');
    return;
  }

  console.log(`Setting up bottom navigation with explicit tableId: ${tableId} for page: ${currentPage}`);

  // Check if we should show desktop navigation (all buttons) or mobile navigation (with dropdown)
  const isDesktop = window.innerWidth >= 768;
  console.log(`Screen width: ${window.innerWidth}px, using ${isDesktop ? 'desktop' : 'mobile'} navigation`);
  
  if (isDesktop) {
    setupDesktopNavigation(navContainer, tableId, currentPage);
  } else {
    setupMobileNavigation(navContainer, tableId, currentPage);
  }
  
  // Handle window resize to switch between desktop and mobile navigation
  const resizeHandler = () => {
    const newIsDesktop = window.innerWidth >= 768;
    if (newIsDesktop !== isDesktop) {
      console.log(`Screen size changed, switching to ${newIsDesktop ? 'desktop' : 'mobile'} navigation`);
      if (newIsDesktop) {
        setupDesktopNavigation(navContainer, tableId, currentPage);
      } else {
        setupMobileNavigation(navContainer, tableId, currentPage);
      }
    }
  };
  
  // Remove any existing resize listener to avoid duplicates
  if (window.__navigationResizeHandler) {
    window.removeEventListener('resize', window.__navigationResizeHandler);
  }
  window.__navigationResizeHandler = resizeHandler;
  window.addEventListener('resize', resizeHandler);
  
  console.log('Bottom navigation setup complete');
}

// Desktop navigation: show all buttons directly
function setupDesktopNavigation(navContainer, tableId, currentPage) {
  console.log('Setting up desktop navigation with all buttons visible');
  
  // Hide the dropdown container
  const navDropdown = navContainer.querySelector('.nav-dropdown');
  if (navDropdown) {
    navDropdown.style.display = 'none';
  }
  
  // Create and add the dropdown items as direct navigation buttons
  const dropdownItems = [
    { page: 'travel-accommodation', icon: 'flight_takeoff', label: 'Travel' },
    { page: 'gear', icon: 'photo_camera', label: 'Gear' },
    { page: 'card-log', icon: 'sd_card', label: 'Cards' },
    { page: 'documents', icon: 'map', label: 'Map' },
    { page: 'events', icon: 'exit_to_app', label: 'Exit' }
  ];
  
  // Remove any existing desktop nav items we added previously
  navContainer.querySelectorAll('.desktop-nav-item').forEach(item => item.remove());
  
  // Add the dropdown items as direct navigation links
  dropdownItems.forEach(item => {
    const navLink = document.createElement('a');
    navLink.href = '#';
    navLink.setAttribute('data-page', item.page);
    navLink.className = 'desktop-nav-item';
    navLink.innerHTML = `
      <span class="material-symbols-outlined">${item.icon}</span>
      <span>${item.label}</span>
    `;
    
    // Add click handler
    navLink.addEventListener('click', function(e) {
      e.preventDefault();
      const page = navLink.getAttribute('data-page');
      const currentEventId = localStorage.getItem('eventId');
      console.log(`Desktop nav link clicked: ${page}, using currentEventId: ${currentEventId}`);
      window.navigate(page, currentEventId);
    });
    
    navContainer.appendChild(navLink);
  });
  
  // Set up navigation for existing regular nav links
  setupRegularNavLinks(navContainer);
  
  // Update active navigation state
  if (currentPage) {
    updateActiveNavigation(currentPage);
  }
}

// Mobile navigation: use dropdown menu
function setupMobileNavigation(navContainer, tableId, currentPage) {
  console.log('Setting up mobile navigation with dropdown menu');
  
  // Show the dropdown container
  const navDropdown = navContainer.querySelector('.nav-dropdown');
  if (navDropdown) {
    navDropdown.style.display = 'flex';
  }
  
  // Remove any desktop nav items we added
  navContainer.querySelectorAll('.desktop-nav-item').forEach(item => item.remove());
  
  // Set up navigation for regular nav links
  setupRegularNavLinks(navContainer);
  
  // Set up dropdown menu functionality
  setupDropdownMenu(tableId);
  
  // Update active navigation state
  if (currentPage) {
    updateActiveNavigation(currentPage);
  }
}

// Helper function to set up regular navigation links
function setupRegularNavLinks(navContainer) {
  const navLinks = navContainer.querySelectorAll('a[data-page]');
  console.log('Found', navLinks.length, 'navigation links with data-page attribute');
  
  navLinks.forEach(link => {
    // Skip if this is inside a dropdown menu (will be handled separately)
    if (link.closest('.dropdown-menu')) {
      console.log('Skipping dropdown menu link:', link.getAttribute('data-page'));
      return;
    }
    
    // Skip if this is a desktop nav item (already has handler)
    if (link.classList.contains('desktop-nav-item')) {
      return;
    }
    
    console.log('Setting up navigation for:', link.getAttribute('data-page'));
    
    // Remove any existing click listeners to avoid duplicates
    const newLink = link.cloneNode(true);
    link.parentNode.replaceChild(newLink, link);
    
    newLink.addEventListener('click', function(e) {
      e.preventDefault();
      const page = newLink.getAttribute('data-page');
      const currentEventId = localStorage.getItem('eventId');
      console.log(`Regular nav link clicked: ${page}, using currentEventId: ${currentEventId}`);
      
      // Close dropdown menu if it's open
      const dropdownMenu = document.getElementById('dropdownMenu');
      if (dropdownMenu && dropdownMenu.classList.contains('show')) {
        console.log('Closing dropdown menu due to regular nav link click');
        dropdownMenu.classList.remove('show');
      }
      window.navigate(page, currentEventId);
    });
  });
  
  // Set up the chat button in navbar (mobile only)
  const chatNavButton = navContainer.querySelector('.chat-button-nav');
  if (chatNavButton) {
    console.log('Setting up chat button in navbar');
    
    // Remove any existing click listeners to avoid duplicates
    const newChatButton = chatNavButton.cloneNode(true);
    chatNavButton.parentNode.replaceChild(newChatButton, chatNavButton);
    
    newChatButton.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('Chat navbar button clicked');
      
      // Close dropdown menu if it's open
      const dropdownMenu = document.getElementById('dropdownMenu');
      if (dropdownMenu && dropdownMenu.classList.contains('show')) {
        console.log('Closing dropdown menu due to chat button click');
        dropdownMenu.classList.remove('show');
      }
      
      // Trigger the chat functionality (same as floating button)
      if (window.chatWidget) {
        window.chatWidget.toggleChat();
      }
    });
  }
}

// Function to update active navigation state
function updateActiveNavigation(currentPage) {
  console.log('Updating active navigation for page:', currentPage);

  const allNavItems = document.querySelectorAll('.bottom-nav-material a, .bottom-nav-material .dropdown-toggle');

  // Map: data-page value or a special key for toggle -> Material Symbol INACTIVE icon name
  const defaultInactiveIcons = {
    'events': 'exit_to_app',  // Exit icon for events page
    'dashboard': 'home', 
    'general': 'home',        // Home icon for general page
    'crew': 'group',
    'schedule': 'calendar_today',
    'more-toggle': 'more_horiz',
    'travel-accommodation': 'flight_takeoff',
    'gear': 'photo_camera',
    'card-log': 'sd_card',
    'shotlist': 'checklist',
    'documents': 'map'
  };

  // Map: INACTIVE Material Symbol name -> ACTIVE Material Symbol name
  // Most will rely on CSS to change to a "filled" state by keeping the same name.
  // Only list icons here that change their actual name for the active state.
  const activeIconMap = {
    'more_horiz': 'more_vert' // More toggle changes name
    // 'home': 'home', // Stays 'home', CSS will handle fill
    // 'info': 'info', // Stays 'info', CSS will handle fill
    // 'group': 'group', // Stays 'group', CSS will handle fill
    // 'calendar_today': 'calendar_today', // Stays 'calendar_today', CSS will handle fill
  };

  allNavItems.forEach(item => {
    item.classList.remove('active');
    // Find Material Symbol span. Note: The class might change if we decide to dynamically change it for fill state.
    // For now, assuming it's always present and we only change textContent or rely on a parent .active class.
    const iconElement = item.querySelector('span.material-symbols-outlined'); 
    if (iconElement) {
      let canonicalInactiveIconName;
      if (item.classList.contains('dropdown-toggle')) {
        canonicalInactiveIconName = defaultInactiveIcons['more-toggle'];
      } else if (item.dataset.page) {
        canonicalInactiveIconName = defaultInactiveIcons[item.dataset.page];
      }

      if (canonicalInactiveIconName) {
        // Store the canonical inactive name if needed (e.g. if we were to change it and revert)
        // For Material Symbols, we primarily change textContent.
        iconElement.dataset.inactiveIconName = canonicalInactiveIconName;

        // Reset to this canonical inactive icon name if it's not already set
        if (iconElement.textContent !== canonicalInactiveIconName) {
          iconElement.textContent = canonicalInactiveIconName;
        }
      } else {
        if (!iconElement.dataset.inactiveIconName) {
          iconElement.dataset.inactiveIconName = iconElement.textContent;
        }
        if (iconElement.textContent !== iconElement.dataset.inactiveIconName) {
            iconElement.textContent = iconElement.dataset.inactiveIconName;
        }
        console.warn('[DEBUG] Could not determine canonical inactive Material Symbol for item:', item, 'using fallback textContent.');
      }
    }
  });

  let activeElement = null;
  let finalActiveIconName = null; 
  let baseInactiveIconForActiveElement = null;

  // First check for regular nav items (direct children of bottom-nav-material)
  let navItem = document.querySelector(`.bottom-nav-material > a[data-page="${currentPage}"]`);
  
  // If not found, also check for desktop nav items
  if (!navItem) {
    navItem = document.querySelector(`.bottom-nav-material .desktop-nav-item[data-page="${currentPage}"]`);
  }
  
  if (navItem) {
    activeElement = navItem;
    const pageType = navItem.dataset.page;
    baseInactiveIconForActiveElement = defaultInactiveIcons[pageType];
    if (baseInactiveIconForActiveElement) {
      // If there's a specific active name mapped, use it. Otherwise, it's the same name (CSS handles fill).
      finalActiveIconName = activeIconMap[baseInactiveIconForActiveElement] || baseInactiveIconForActiveElement;
    }
  } else {
    // Check if the page is in the dropdown menu (for mobile navigation)
    const dropdownLink = document.querySelector(`.bottom-nav-material .dropdown-menu a[data-page="${currentPage}"]`);
    if (dropdownLink) {
      activeElement = document.querySelector('.bottom-nav-material .dropdown-toggle'); 
      if (activeElement) {
        baseInactiveIconForActiveElement = defaultInactiveIcons['more-toggle']; // This is 'more_horiz'
        if (baseInactiveIconForActiveElement) {
          finalActiveIconName = activeIconMap[baseInactiveIconForActiveElement] || baseInactiveIconForActiveElement; // Should be 'more_vert'
        }
      }
    }
  }

  if (activeElement) {
    activeElement.classList.add('active');
    const iconElementToUpdate = activeElement.querySelector('span.material-symbols-outlined');
    if (iconElementToUpdate && finalActiveIconName) {
      if (!iconElementToUpdate.dataset.inactiveIconName && baseInactiveIconForActiveElement) {
         iconElementToUpdate.dataset.inactiveIconName = baseInactiveIconForActiveElement;
      }
      iconElementToUpdate.textContent = finalActiveIconName;
      console.log(`[DEBUG MS] Activated: ${currentPage}. Icon name for active state: '${finalActiveIconName}'. Base inactive: '${baseInactiveIconForActiveElement || 'unknown'}'. Stored inactive: '${iconElementToUpdate.dataset.inactiveIconName}'`);
    } else if (iconElementToUpdate) {
      console.log(`[DEBUG MS] Activated: ${currentPage}. Icon for ${iconElementToUpdate.dataset.inactiveIconName || iconElementToUpdate.textContent} relies on CSS active state (no specific active icon name mapping).`);
    }
  } else {
    console.log('[DEBUG MS] No active element found for page:', currentPage);
  }

  // No need for lucide.createIcons(); Material Symbols with icon font render on textContent change.
}

// Function to save current page state for PWA restoration
function saveCurrentPageState(page, eventId = null) {
  const pageState = {
    page: page,
    eventId: eventId || localStorage.getItem('eventId'),
    timestamp: Date.now(),
    url: window.location.href
  };
  
  localStorage.setItem('lastPageState', JSON.stringify(pageState));
  console.log('[PWA] Saved page state:', pageState);
}

// Function to restore the last visited page when PWA reopens
function restoreLastPageState() {
  try {
    const savedState = localStorage.getItem('lastPageState');
    if (!savedState) {
      console.log('[PWA] No saved page state found, starting fresh');
      return false;
    }
    
    const pageState = JSON.parse(savedState);
    const isAuthenticated = !!localStorage.getItem('token');
    
    // Don't restore if not authenticated or if saved state is too old (more than 7 days)
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    if (!isAuthenticated || (Date.now() - pageState.timestamp > maxAge)) {
      console.log('[PWA] Not restoring page state - not authenticated or state too old');
      localStorage.removeItem('lastPageState');
      return false;
    }
    
    // Restore the page if it's valid and we have the required eventId for pages that need it
    const needsId = !['events', 'dashboard', 'login', 'register', 'users'].includes(pageState.page);
    
    if (needsId && !pageState.eventId) {
      console.log('[PWA] Cannot restore page state - missing eventId for page:', pageState.page);
      return false;
    }
    
    console.log('[PWA] Restoring last page state:', pageState);
    
    // Update the hash without triggering navigation yet
    if (pageState.page !== 'events') {
      location.hash = `#${pageState.page}`;
    }
    
    // Restore eventId if needed
    if (pageState.eventId) {
      localStorage.setItem('eventId', pageState.eventId);
    }
    
    // Navigate to the restored page
    setTimeout(() => {
      navigate(pageState.page, pageState.eventId);
    }, 100);
    
    return true;
  } catch (error) {
    console.error('[PWA] Error restoring page state:', error);
    localStorage.removeItem('lastPageState');
    return false;
  }
}

// Function to clear old page state (utility)
function clearPageState() {
  localStorage.removeItem('lastPageState');
  console.log('[PWA] Page state cleared');
}

// Function to get the current page state (utility)
function getCurrentPageState() {
  try {
    const savedState = localStorage.getItem('lastPageState');
    return savedState ? JSON.parse(savedState) : null;
  } catch (error) {
    console.error('[PWA] Error getting current page state:', error);
    return null;
  }
}

// Make PWA utilities globally available
window.clearPageState = clearPageState;
window.getCurrentPageState = getCurrentPageState;
