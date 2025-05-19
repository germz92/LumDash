// Environment config
const ENVIRONMENTS = {
  development: {
    API_BASE: 'http://localhost:3000',
  },
  production: {
    // Make sure to include www if that's how the site is accessed
    API_BASE: 'https://spa-lumdash-backend.onrender.com', 
  }
};

// Detect environment
const isProduction = window.location.hostname !== 'localhost' && 
                     !window.location.hostname.includes('127.0.0.1');

// Set the API base URL
const API_BASE = isProduction ? ENVIRONMENTS.production.API_BASE : ENVIRONMENTS.development.API_BASE;

console.log(`[config.js] Running in ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);
console.log(`[config.js] Hostname: ${window.location.hostname}`);
console.log(`[config.js] API_BASE set to: ${API_BASE}`);

(async function checkLogin() {
  console.log('[config.js] Running checkLogin...');

  const pathname = window.location.pathname.toLowerCase();
  const isSafePage =
    pathname.endsWith('/index.html') ||
    pathname.endsWith('/register.html') || // ✅ Allow registration page
    pathname.endsWith('/dashboard.html') || // ✅ Allow dashboard to load SPA
    pathname === '/' ||
    pathname === '' ||
    window.location.href.toLowerCase().endsWith('/');

  if (isSafePage) {
    console.log('[config.js] Skipping login check on safe page:', pathname);
    return;
  }

  const token = localStorage.getItem('token');
  if (!token) {
    console.warn('[config.js] No token found, redirecting...');
    window.location.href = 'index.html';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/verify-token`, {
      headers: { Authorization: token }
    });

    const data = await res.json();
    console.log('[config.js] verify-token status:', res.status);
    console.log('[config.js] verify-token response:', data);

    if (!res.ok || !data.valid) {
      console.warn('[config.js] Invalid token. Logging out...');
      localStorage.clear();
      window.location.href = 'index.html';
    }
  } catch (err) {
    console.error('[config.js] Auth check failed:', err);
    window.location.href = 'index.html';
  }
})();

window.API_BASE = API_BASE;
