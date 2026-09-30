// User Management Page Logic
if (typeof window.API_BASE === 'undefined') {
  window.API_BASE = localStorage.getItem('API_BASE') || '';
}
// Don't redeclare API_BASE
// const API_BASE = window.API_BASE;
const token = window.token || localStorage.getItem('token');

// Global variables
let messageArea, userTableBody, userModal, closeModalBtn, cancelModalBtn, userForm, modalTitle;
let userIdInput, userNameInput, userEmailInput, userPhoneInput, userRoleInput, passwordGroup, userPasswordInput, resetPasswordBtn;
let users = [];
let currentAction = null;
let editingUserId = null;

// Document ready function to initialize page
document.addEventListener('DOMContentLoaded', function() {
  console.log('Users admin page initialized');
  
  // Initialize DOM elements
  messageArea = document.getElementById('messageArea');
  userTableBody = document.getElementById('userTableBody');
  userModal = document.getElementById('userModal');
  closeModalBtn = document.getElementById('closeModalBtn');
  cancelModalBtn = document.getElementById('cancelModalBtn');
  userForm = document.getElementById('userForm');
  modalTitle = document.getElementById('modalTitle');
  userIdInput = document.getElementById('userId');
  userNameInput = document.getElementById('userName');
  userEmailInput = document.getElementById('userEmail');
  userPhoneInput = document.getElementById('userPhone');
  userRoleInput = document.getElementById('userRole');
  passwordGroup = document.getElementById('passwordGroup');
  userPasswordInput = document.getElementById('userPassword');
  resetPasswordBtn = document.getElementById('resetPasswordBtn');
  
  // Debug: Log which elements were found
  console.log('DOM Elements initialized:', {
    messageArea: !!messageArea,
    userTableBody: !!userTableBody,
    userModal: !!userModal,
    closeModalBtn: !!closeModalBtn,
    cancelModalBtn: !!cancelModalBtn,
    userForm: !!userForm,
    modalTitle: !!modalTitle,
    userIdInput: !!userIdInput,
    userNameInput: !!userNameInput,
    userEmailInput: !!userEmailInput,
    userRoleInput: !!userRoleInput,
    passwordGroup: !!passwordGroup,
    userPasswordInput: !!userPasswordInput,
    resetPasswordBtn: !!resetPasswordBtn
  });
  
  // Setup modal event handlers
  if (closeModalBtn) closeModalBtn.onclick = closeModal;
  if (cancelModalBtn) cancelModalBtn.onclick = closeModal;
  if (userForm) {
    userForm.onsubmit = handleFormSubmit;
  }
  if (resetPasswordBtn) {
    resetPasswordBtn.onclick = function() {
      if (passwordGroup) passwordGroup.style.display = '';
      resetPasswordBtn.style.display = 'none';
      if (userPasswordInput) userPasswordInput.value = '';
      if (modalTitle) modalTitle.textContent = 'Reset Password';
    };
  }
  
  // Setup window click handler for modal
  window.onclick = function(event) {
    if (event.target === userModal) closeModal();
  };
  
  const inviteBtn = document.getElementById('inviteBtn');
  const closeInviteModalBtn = document.getElementById('closeInviteModalBtn');
  const cancelInviteBtn = document.getElementById('cancelInviteBtn');
  const inviteForm = document.getElementById('inviteForm');
  const inviteModal = document.getElementById('inviteModal');
  if (inviteBtn) inviteBtn.onclick = openInviteModal;
  if (closeInviteModalBtn) closeInviteModalBtn.onclick = closeInviteModal;
  if (cancelInviteBtn) cancelInviteBtn.onclick = closeInviteModal;
  if (inviteForm) inviteForm.onsubmit = handleInviteSubmit;
  if (inviteModal) {
    inviteModal.onclick = function (event) {
      if (event.target === inviteModal) closeInviteModal();
    };
  }

  if (checkAdminRole()) {
    loadUsers();
    loadInvites();
    
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
        loadInvites();
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

function showMessage(text, type = 'error') {
  if (messageArea) {
    const safe = escapeHtml(String(text || ''));
    messageArea.innerHTML = `<div class="msg msg-${type}">${safe}</div>`;
    const holdMs = String(text || '').includes('http') ? 30000 : 5000;
    setTimeout(() => { messageArea.innerHTML = ''; }, holdMs);
  }
}

function openInviteModal() {
  const form = document.getElementById('inviteForm');
  const modal = document.getElementById('inviteModal');
  if (form) form.reset();
  if (modal) modal.classList.add('show');
}

function closeInviteModal() {
  const modal = document.getElementById('inviteModal');
  if (modal) modal.classList.remove('show');
}

function formatInviteDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function loadInvites() {
  const token = localStorage.getItem('token');
  fetch(`${window.API_BASE}/api/invites`, {
    headers: { Authorization: token }
  })
    .then(res => {
      if (!res.ok) throw new Error('Failed to load invites');
      return res.json();
    })
    .then(renderInvites)
    .catch(() => {
      document.getElementById('inviteTableBody').innerHTML =
        '<tr class="user-table-status"><td colspan="5">Could not load invites.</td></tr>';
    });
}

function renderInvites(invites) {
  const tbody = document.getElementById('inviteTableBody');
  if (!invites.length) {
    tbody.innerHTML = '<tr class="user-table-status"><td colspan="5">No pending invites.</td></tr>';
    return;
  }
  tbody.innerHTML = invites.map(invite => `
    <tr>
      <td data-label="Name">${escapeHtml(invite.fullName)}</td>
      <td data-label="Email">${mailLink(invite.email)}</td>
      <td data-label="Role"><span class="role-pill">${escapeHtml(invite.role || 'user')}</span></td>
      <td data-label="Expires">${escapeHtml(formatInviteDate(invite.expiresAt))}${new Date(invite.expiresAt) < new Date() ? ' · expired' : ''}</td>
      <td class="action-buttons" data-label="Actions">
        <button type="button" class="action-btn btn-edit btn-text" onclick="resendInvite('${invite._id}')">Resend</button>
        <button type="button" class="action-btn btn-delete btn-text" onclick="revokeInvite('${invite._id}')">Revoke</button>
      </td>
    </tr>
  `).join('');
}

function handleInviteSubmit(e) {
  e.preventDefault();
  const token = localStorage.getItem('token');
  const payload = {
    fullName: document.getElementById('inviteName').value.trim(),
    email: document.getElementById('inviteEmail').value.trim(),
    role: document.getElementById('inviteRole').value
  };
  const btn = document.getElementById('sendInviteBtn');
  btn.disabled = true;
  fetch(`${window.API_BASE}/api/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(payload)
  })
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send invite');
      return data;
    })
    .then(data => {
      closeInviteModal();
      const extra = data.acceptUrl ? ` Copy this link: ${data.acceptUrl}` : '';
      showMessage((data.message || 'Invite sent') + extra, data.emailSent === false ? 'error' : 'success');
      loadInvites();
    })
    .catch(err => showMessage(err.message, 'error'))
    .finally(() => { btn.disabled = false; });
}

window.resendInvite = function (id) {
  const token = localStorage.getItem('token');
  fetch(`${window.API_BASE}/api/invites/${id}/resend`, {
    method: 'POST',
    headers: { Authorization: token }
  })
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not resend invite');
      const extra = data.acceptUrl ? ` Copy this link: ${data.acceptUrl}` : '';
      showMessage((data.message || 'Invite resent') + extra, data.emailSent === false ? 'error' : 'success');
      loadInvites();
    })
    .catch(err => showMessage(err.message, 'error'));
};

window.revokeInvite = function (id) {
  if (!confirm('Revoke this invite? The link will stop working.')) return;
  const token = localStorage.getItem('token');
  fetch(`${window.API_BASE}/api/invites/${id}`, {
    method: 'DELETE',
    headers: { Authorization: token }
  })
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not revoke invite');
      showMessage('Invite revoked', 'success');
      loadInvites();
    })
    .catch(err => showMessage(err.message, 'error'));
};

async function loadUsers() {
  if (userTableBody) {
    userTableBody.innerHTML = '<tr class="user-table-status"><td colspan="5">Loading users...</td></tr>';
  }
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
    if (userTableBody) {
      userTableBody.innerHTML = '<tr class="user-table-status"><td colspan="5">Error loading users</td></tr>';
    }
  }
}

function renderUsers() {
  if (!userTableBody) return;
  
  if (!users.length) {
    userTableBody.innerHTML = '<tr class="user-table-status"><td colspan="5">No users found</td></tr>';
    return;
  }
  userTableBody.innerHTML = users.map(user => `
    <tr>
      <td data-label="Name">${escapeHtml(user.name)}</td>
      <td data-label="Email">${mailLink(user.email)}</td>
      <td data-label="Phone">${phoneLink(user.phone)}</td>
      <td data-label="Role"><span class="role-pill">${escapeHtml(user.role)}</span></td>
      <td class="action-buttons" data-label="Actions">
        <button class="action-btn btn-edit btn-text" onclick="editUser('${user._id}')">Edit</button>
        <button class="action-btn btn-delete btn-text" onclick="deleteUser('${user._id}')">Delete</button>
        <button class="action-btn btn-reset btn-text" onclick="resetPassword('${user._id}')">Reset Password</button>
      </td>
    </tr>
  `).join('');
}

// Modal logic
function openModal(title) {
  console.log('Opening modal with title:', title);
  console.log('Modal element exists:', !!userModal);
  if (modalTitle) modalTitle.textContent = title;
  if (userModal) {
    userModal.classList.add('show');
    console.log('Modal show class added');
  } else {
    console.error('userModal element not found!');
  }
}

function closeModal() {
  console.log('Closing modal');
  if (userModal) {
    userModal.classList.remove('show');
    console.log('Modal show class removed');
  }
  if (userForm) userForm.reset();
  if (passwordGroup) passwordGroup.style.display = 'none';
  editingUserId = null;
}

// Edit user
window.editUser = function(id) {
  console.log('editUser called with id:', id);
  const user = users.find(u => u._id === id);
  if (!user) {
    console.error('User not found for id:', id);
    return;
  }
  console.log('Found user:', user);
  editingUserId = id;
  if (userIdInput) userIdInput.value = user._id;
  if (userNameInput) userNameInput.value = user.name;
  if (userEmailInput) userEmailInput.value = user.email;
  if (userPhoneInput) userPhoneInput.value = user.phone || '';
  if (userRoleInput) userRoleInput.value = user.role;
  if (userPasswordInput) userPasswordInput.value = '';
  if (passwordGroup) passwordGroup.style.display = 'none';
  if (resetPasswordBtn) resetPasswordBtn.style.display = '';
  openModal('Edit User');
};

// Delete user
window.deleteUser = async function(id) {
  console.log('deleteUser called with id:', id);
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
  console.log('resetPassword called with id:', id);
  editingUserId = id;
  const user = users.find(u => u._id === id);
  if (!user) {
    console.error('User not found for id:', id);
    return;
  }
  console.log('Found user for password reset:', user);
  if (userIdInput) userIdInput.value = user._id;
  if (userNameInput) userNameInput.value = user.name;
  if (userEmailInput) userEmailInput.value = user.email;
  if (userPhoneInput) userPhoneInput.value = user.phone || '';
  if (userRoleInput) userRoleInput.value = user.role;
  if (userPasswordInput) userPasswordInput.value = '';
  if (passwordGroup) passwordGroup.style.display = '';
  if (resetPasswordBtn) resetPasswordBtn.style.display = 'none';
  openModal('Reset Password');
};

// Handle form submission (edit or reset password)
async function handleFormSubmit(e) {
  e.preventDefault();
  if (!userIdInput || !userNameInput || !userEmailInput || !userRoleInput) return;
  
  const id = userIdInput.value;
  const name = userNameInput.value.trim();
  const email = userEmailInput.value.trim();
  const phone = userPhoneInput ? userPhoneInput.value.trim() : '';
  const role = userRoleInput.value;
  const password = userPasswordInput ? userPasswordInput.value : '';
  const isReset = passwordGroup && passwordGroup.style.display !== 'none';
  
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
        body: JSON.stringify({ name, email, phone, role })
      });
      if (!res.ok) throw new Error('Failed to update user');
      showMessage('User updated successfully!', 'success');
    }
    closeModal();
    await loadUsers();
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

function mailLink(email) {
  const value = String(email || '').trim();
  if (!value) return '—';
  return `<a class="contact-link" href="mailto:${escapeHtml(value)}">${escapeHtml(value)}</a>`;
}

function phoneLink(phone) {
  const value = String(phone || '').trim();
  if (!value) return '—';
  const tel = value.replace(/[^\d+]/g, '');
  if (!tel) return escapeHtml(value);
  return `<a class="contact-link" href="tel:${escapeHtml(tel)}">${escapeHtml(value)}</a>`;
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
} 