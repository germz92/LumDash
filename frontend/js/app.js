if (!localStorage.getItem('token')) {
  window.location.replace('index.html');
}

console.log('�� app.js loaded');

const PAGE_CLASSES = [
  'events-page', 'general-page', 'crew-page', 'travel-page', 'gear-page', 'card-log-page', 'schedule-page', 'dashboard-page', 'login-page', 'register-page'
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
  return params.get('id') || localStorage.getItem('eventId');
}

function navigate(page, id) {
  // Only require an ID for pages that need it
  const needsId = !['events', 'dashboard', 'login', 'register'].includes(page);
  if (needsId && (!id || id === "null")) {
    alert("No event selected. Please select an event first.");
    return;
  }

  // Set the correct body class for the page
  setBodyPageClass(page);

  // Store the event ID
  if (id) localStorage.setItem('eventId', id);
  const tableId = id || getTableId();
  
  // Clean up any existing page content and scripts
  const pageContainer = document.getElementById('page-container');
  if (pageContainer) {
    // Call any cleanup function from the current page before removing scripts
    // but only if we're not on the first load (window.currentPage will be set)
    if (window.currentPage) {
      // Check for page-specific cleanup functions
      const cleanupFunctionMap = {
        'schedule': 'cleanupSchedulePage',
        'card-log': 'cleanupCardLogPage'
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
  
  // Remove elements added to the bottom nav placeholder
  const bottomNavPlaceholder = document.getElementById('bottomNavPlaceholder');
  if (bottomNavPlaceholder) {
    bottomNavPlaceholder.innerHTML = '';
  }

  // Update hash and load new page
  location.hash = `#${page}`;
  loadPageCSS(page);
  
  // Track the current page to know when we're navigating
  window.currentPage = page;
  
  loadPage(page, tableId);
}

function loadPage(page, id) {
  fetch(`pages/${page}.html`)
    .then(res => res.text())
    .then(html => {
      const pageContainer = document.getElementById('page-container');
      if (!pageContainer) {
        console.error('Page container not found');
        return;
      }

      // Clear any existing content
      pageContainer.innerHTML = '';
      
      // Add new content
      pageContainer.innerHTML = html;
      
      // Set up SPA nav listeners
      const navLinks = document.querySelectorAll('.bottom-nav a[data-page]');
      navLinks.forEach(link => {
        link.onclick = function(e) {
          e.preventDefault();
          const page = link.getAttribute('data-page');
          window.navigate(page, getTableId && getTableId());
        };
      });

      // Show/hide bottom nav based on page
      const bottomNav = document.getElementById('bottomNav');
      if (bottomNav) {
        if (page === 'events') {
          bottomNav.style.display = 'none';
        } else {
          bottomNav.style.display = '';
        }
      }

      // Re-initialize Lucide icons
      if (window.lucide) lucide.createIcons();

      // Remove any existing page script with the same ID
      const existingScript = document.getElementById('page-script');
      if (existingScript) {
        existingScript.remove();
      }
      
      // Also remove any duplicate scripts that might have been added
      document.querySelectorAll(`script[src="js/${page}.js"]`).forEach(script => {
        script.remove();
      });

      // Reset page-specific global variables that might have been set by previous scripts
      // Clear any page-specific flags
      const pageFlags = {
        'schedule': ['__scheduleJsLoaded'],
        'card-log': ['__cardLogJsLoaded']
        // Add other page flags as needed
      };
      
      if (pageFlags[page]) {
        pageFlags[page].forEach(flag => {
          window[flag] = false;
        });
  }

      // Dynamically load JS if it exists
  const script = document.createElement('script');
      script.src = `js/${page}.js`;
  script.id = 'page-script';
      
      // Make sure we handle load errors
      script.onerror = (error) => {
        console.error(`Error loading script for ${page}:`, error);
      };
      
  script.onload = () => {
        console.log('Script loaded for', page, 'calling window.initPage with id:', id || getTableId());
        
        // Small delay to ensure the script has been properly initialized
        setTimeout(() => {
          if (window.initPage) {
            try {
              window.initPage(id || getTableId());
            } catch (err) {
              console.error('Error initializing page:', err);
            }
    } else {
            console.warn('window.initPage is not defined after loading', script.src);
    }
        }, 50);
  };
      
  document.body.appendChild(script);
    })
    .catch(err => {
      console.error('Error loading page:', err);
    });
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
  const page = location.hash.replace('#', '') || 'events';
  navigate(page, getTableId());
});

// Initial load
window.addEventListener('DOMContentLoaded', () => {
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
  
  // Clean up any navigation placeholders
  const bottomNavPlaceholder = document.getElementById('bottomNavPlaceholder');
  if (bottomNavPlaceholder) {
    bottomNavPlaceholder.innerHTML = '';
  }
  
  // Reset body classes
  const PAGE_CLASSES_RESET = [
    'events-page', 'general-page', 'crew-page', 'travel-page', 'gear-page', 
    'card-log-page', 'schedule-page', 'dashboard-page', 'login-page', 'register-page'
  ];
  PAGE_CLASSES_RESET.forEach(cls => document.body.classList.remove(cls));
  
  // Get page from hash or default to events
  const page = location.hash.replace('#', '') || 'events';
  navigate(page, getTableId());
});

// Expose navigate globally for nav links
window.navigate = navigate;

console.log('travel-accommodation.js loaded');
