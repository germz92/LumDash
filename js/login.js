// LOGIN CHECK ON LOAD
// Show splash by default, hide login form
document.addEventListener('DOMContentLoaded', async () => {
  const splash = document.getElementById('splashScreen');
  const authWrapper = document.getElementById('authWrapper');
  if (authWrapper) authWrapper.style.display = 'none';
  if (splash) splash.style.display = 'flex';

  const token = localStorage.getItem('token');

  // ✅ If token exists, verify it
  if (token) {
    try {
      const res = await fetch(`${API_BASE}/api/verify-token`, {
        headers: { Authorization: token }
      });

      if (res.ok) {
        window.location.href = 'dashboard.html#events';
        return;
      }
      
    } catch (err) {
      console.warn('[index] Token check failed:', err);
      localStorage.clear();
    }
  }

  // If not authenticated, hide splash and show login form
  if (splash) splash.style.display = 'none';
  if (authWrapper) authWrapper.style.display = '';

  // ✅ Allow pressing Enter key to login
  const passwordField = document.getElementById('password');
  if (passwordField) {
    passwordField.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        login();
      }
    });
  }
});

// LOGIN
window.login = async function () {
  if (window.loginLock) return;
  window.loginLock = true;

  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value.trim();

  if (!email || !password) {
    alert('Please enter both email and password.');
    window.loginLock = false;
    return;
  }

  const loginBtn = document.getElementById('loginButton');
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    let data;
    try {
      data = await res.json();
    } catch {
      alert('Server returned an invalid response.');
      throw new Error('Invalid JSON from server');
    }

    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('fullName', data.fullName);

      // Optional: extract and store user ID
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      if (payload?.id) localStorage.setItem('userId', payload.id);

      console.log('[login.js] Logged in, token:', data.token);
      window.location.replace('dashboard.html#events');
    } else {
      alert(data.error || 'Login failed');
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
      }
      window.loginLock = false;
    }
  } catch (err) {
    console.error('Login error:', err);
    alert('Login failed. Please try again later.');
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
    window.loginLock = false;
  }
};

// REGISTER
window.register = async function () {
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const fullName = document.getElementById('regFullName').value.trim();
  const password = document.getElementById('regPassword').value.trim();

  if (!email || !fullName || !password) {
    alert('Please fill in all fields.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, fullName, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    alert(data.message || 'User created');

    if (data.message === 'User created') {
      window.location.href = 'index.html';
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
    console.error(err);
  }
};
