// User Management Page Logic
if (typeof window.API_BASE === 'undefined') {
  window.API_BASE = localStorage.getItem('API_BASE') || '';
}
// Don't redeclare API_BASE
// const API_BASE = window.API_BASE;
const token = window.token || localStorage.getItem('token');

// Document ready function to initialize page
document.addEventListener('DOMContentLoaded', function() {
  console.log('Users admin page initialized');
  if (checkAdminRole()) {
    loadUsers();
    
    // Setup Socket.IO for real-time updates
    setupSocketIO();
  }
});

// Setup Socket.IO to handle updates
function setupSocketIO() {
  // Check if socket.io is loaded
  if (typeof io !== 'undefined') {
    try {
      // Connect to socket server
      const socketServerUrl = localStorage.getItem('SOCKET_SERVER') || window.API_BASE;
      window.socket = io(socketServerUrl);
      
      // Listen for updates
      window.socket.on('usersChanged', () => {
        console.log('Users data changed, reloading...');
        loadUsers();
      });
    } catch (err) {
      console.error('Socket.IO initialization error:', err);
    }
  } else {
    // Try to load socket.io-client library
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.5.0/socket.io.min.js';
    script.onload = setupSocketIO;  // Try again when loaded
    document.head.appendChild(script);
  }
}

// Check if user is admin, otherwise show error and redirect
function checkAdminRole() {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    console.log('User role:', payload.role);
    if (payload.role !== 'admin') {
      const messageArea = document.getElementById('messageArea');
      if (messageArea) {
        messageArea.innerHTML = `
          <div class="msg msg-error">
            You don't have admin privileges. Redirecting to events page in 3 seconds.
          </div>
        `;
      } else {
        console.error('Message area element not found, but user is not admin');
      }
      
      setTimeout(() => {
        window.location.href = '../dashboard.html#events';
      }, 3000);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error checking admin role:', err);
    return false;
  }
}

const messageArea = document.getElementById('messageArea');
const userTableBody = document.getElementById('userTableBody');
const userModal = document.getElementById('userModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const userForm = document.getElementById('userForm');
const modalTitle = document.getElementById('modalTitle');
const userIdInput = document.getElementById('userId');
const userNameInput = document.getElementById('userName');
const userEmailInput = document.getElementById('userEmail');
const userRoleInput = document.getElementById('userRole');
const passwordGroup = document.getElementById('passwordGroup');
const userPasswordInput = document.getElementById('userPassword');
const resetPasswordBtn = document.getElementById('resetPasswordBtn');

let users = [];
let currentAction = null;
let editingUserId = null;

function showMessage(text, type = 'error') {
  messageArea.innerHTML = `<div class="msg msg-${type}">${text}</div>`;
  setTimeout(() => { messageArea.innerHTML = ''; }, 5000);
}

async function loadUsers() {
  userTableBody.innerHTML = '<tr><td colspan="4">Loading users...</td></tr>';
  try {
    console.log('Attempting to load users from:', `${window.API_BASE}/api/users`);
    console.log('Using token:', token ? 'Token exists' : 'No token found');
    
    const res = await fetch(`${window.API_BASE}/api/users`, {
      headers: { Authorization: token }
    });
    
    console.log('Response status:', res.status);
    console.log('Response headers:', 
      Array.from(res.headers.entries())
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ')
    );
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('API Error:', errorText);
      throw new Error(`Failed to load users: ${res.status} ${errorText}`);
    }
    
    users = await res.json();
    console.log('Users loaded successfully:', users.length);
    renderUsers();
  } catch (err) {
    console.error('Error in loadUsers():', err);
    showMessage(err.message, 'error');
    userTableBody.innerHTML = '<tr><td colspan="4">Error loading users</td></tr>';
  }
}

function renderUsers() {
  if (!users.length) {
    userTableBody.innerHTML = '<tr><td colspan="4">No users found</td></tr>';
    return;
  }
  userTableBody.innerHTML = users.map(user => `
    <tr>
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td>${escapeHtml(user.role)}</td>
      <td class="action-buttons">
        <button class="action-btn btn-edit" onclick="editUser('${user._id}')">Edit</button>
        <button class="action-btn btn-delete" onclick="deleteUser('${user._id}')">Delete</button>
        <button class="action-btn btn-reset" onclick="resetPassword('${user._id}')">Reset Password</button>
      </td>
    </tr>
  `).join('');
}

// Modal logic
function openModal(title) {
  modalTitle.textContent = title;
  userModal.style.display = 'block';
}
function closeModal() {
  userModal.style.display = 'none';
  userForm.reset();
  passwordGroup.style.display = 'none';
  editingUserId = null;
}
closeModalBtn.onclick = closeModal;
cancelModalBtn.onclick = closeModal;
window.onclick = function(event) {
  if (event.target === userModal) closeModal();
};

// Edit user
window.editUser = function(id) {
  const user = users.find(u => u._id === id);
  if (!user) return;
  editingUserId = id;
  userIdInput.value = user._id;
  userNameInput.value = user.name;
  userEmailInput.value = user.email;
  userRoleInput.value = user.role;
  userPasswordInput.value = '';
  passwordGroup.style.display = 'none';
  resetPasswordBtn.style.display = '';
  openModal('Edit User');
};

// Delete user
window.deleteUser = async function(id) {
  if (!confirm('Are you sure you want to delete this user?')) return;
  try {
    const res = await fetch(`${window.API_BASE}/api/users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: token }
    });
    if (!res.ok) throw new Error('Failed to delete user');
    showMessage('User deleted successfully!', 'success');
    await loadUsers();
  } catch (err) {
    showMessage(err.message, 'error');
  }
};

// Reset password
window.resetPassword = function(id) {
  editingUserId = id;
  const user = users.find(u => u._id === id);
  if (!user) return;
  userIdInput.value = user._id;
  userNameInput.value = user.name;
  userEmailInput.value = user.email;
  userRoleInput.value = user.role;
  userPasswordInput.value = '';
  passwordGroup.style.display = '';
  resetPasswordBtn.style.display = 'none';
  openModal('Reset Password');
};

// Save user (edit or reset password)
userForm.onsubmit = async function(e) {
  e.preventDefault();
  const id = userIdInput.value;
  const name = userNameInput.value.trim();
  const email = userEmailInput.value.trim();
  const role = userRoleInput.value;
  const password = userPasswordInput.value;
  const isReset = passwordGroup.style.display !== 'none';
  try {
    let res;
    if (isReset) {
      // Reset password
      res = await fetch(`${window.API_BASE}/api/users/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ password })
      });
      if (!res.ok) throw new Error('Failed to reset password');
      showMessage('Password reset successfully!', 'success');
    } else {
      // Edit user
      res = await fetch(`${window.API_BASE}/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ name, email, role })
      });
      if (!res.ok) throw new Error('Failed to update user');
      showMessage('User updated successfully!', 'success');
    }
    closeModal();
    await loadUsers();
  } catch (err) {
    showMessage(err.message, 'error');
  }
};

resetPasswordBtn.onclick = function() {
  passwordGroup.style.display = '';
  resetPasswordBtn.style.display = 'none';
  userPasswordInput.value = '';
  modalTitle.textContent = 'Reset Password';
};

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
} 