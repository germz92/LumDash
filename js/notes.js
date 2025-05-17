const params = new URLSearchParams(window.location.search);
const tableId = params.get('id');
const token = localStorage.getItem('token');
const notesList = document.getElementById('notesList');
const addNoteBtn = document.getElementById('addNoteBtn');
const noteModal = document.getElementById('noteModal');
const modalTitle = document.getElementById('modalTitle');
const noteTitleInput = document.getElementById('noteTitleInput');
const saveNoteBtn = document.getElementById('saveNoteBtn');
const cancelNoteBtn = document.getElementById('cancelNoteBtn');
const modalError = document.getElementById('modalError');
const eventTitleEl = document.getElementById('notesEventTitle');
let modalQuill;
let isAdmin = false;
let editingNoteId = null;

function showModal(title, note = { title: '', content: '' }) {
  modalTitle.textContent = title;
  noteTitleInput.value = note.title || '';
  modalQuill.root.innerHTML = note.content || '';
  modalError.style.display = 'none';
  noteModal.style.display = 'flex';
  editingNoteId = note._id || null;
}

function hideModal() {
  noteModal.style.display = 'none';
  noteTitleInput.value = '';
  modalQuill.root.innerHTML = '';
  editingNoteId = null;
}

function showError(msg) {
  modalError.textContent = msg;
  modalError.style.display = 'block';
}

function hideError() {
  modalError.style.display = 'none';
}

function renderNotes(notes) {
  notesList.innerHTML = '';
  if (!notes.length) {
    notesList.innerHTML = '<div style="color:#888;text-align:center;">No notes yet.</div>';
    return;
  }
  notes.slice().reverse().forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.innerHTML = `
      <div class="note-card-title">${note.title ? escapeHtml(note.title) : '(No title)'}</div>
      <div class="note-card-date">${formatDate(note.date)}</div>
      <div class="note-card-content">${note.content ? note.content : '<em>(No content)</em>'}</div>
      <div class="note-card-actions"></div>
    `;
    if (isAdmin) {
      const actions = card.querySelector('.note-card-actions');
      const editBtn = document.createElement('button');
      editBtn.className = 'edit-note-btn';
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => showModal('Edit Note', note);
      actions.appendChild(editBtn);
      const delBtn = document.createElement('button');
      delBtn.className = 'delete-note-btn';
      delBtn.textContent = 'Delete';
      delBtn.onclick = () => deleteNote(note._id);
      actions.appendChild(delBtn);
    }
    notesList.appendChild(card);
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function(tag) {
    const charsToReplace = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return charsToReplace[tag] || tag;
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // Parse as local date (YYYY-MM-DD)
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function fetchTable() {
  const res = await fetch(`/api/tables/${tableId}`, {
    headers: { Authorization: token }
  });
  if (!res.ok) throw new Error('Failed to load event');
  return res.json();
}

async function fetchNotes() {
  const res = await fetch(`/api/tables/${tableId}/admin-notes`, {
    headers: { Authorization: token }
  });
  if (!res.ok) throw new Error('Not authorized or failed to load notes');
  return res.json();
}

async function saveNote() {
  const title = noteTitleInput.value.trim();
  const content = modalQuill.root.innerHTML.trim();
  if (!title) {
    showError('Title is required');
    return;
  }
  hideError();
  saveNoteBtn.disabled = true;
  try {
    let res;
    if (editingNoteId) {
      res = await fetch(`/api/tables/${tableId}/admin-notes/${editingNoteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token
        },
        body: JSON.stringify({ title, content })
      });
    } else {
      const localDate = new Date().toLocaleDateString('en-CA');
      res = await fetch(`/api/tables/${tableId}/admin-notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token
        },
        body: JSON.stringify({ title, content, date: localDate })
      });
    }
    if (!res.ok) throw new Error('Failed to save note');
    const data = await res.json();
    renderNotes(data.adminNotes);
    hideModal();
  } catch (e) {
    showError(e.message);
  } finally {
    saveNoteBtn.disabled = false;
  }
}

async function deleteNote(noteId) {
  if (!confirm('Delete this note?')) return;
  try {
    const res = await fetch(`/api/tables/${tableId}/admin-notes/${noteId}`, {
      method: 'DELETE',
      headers: { Authorization: token }
    });
    if (!res.ok) throw new Error('Failed to delete note');
    const data = await res.json();
    renderNotes(data.adminNotes);
  } catch (e) {
    alert(e.message);
  }
}

async function init() {
  if (!tableId) {
    notesList.innerHTML = '<div style="color:red">Missing event ID.</div>';
    addNoteBtn.style.display = 'none';
    return;
  }
  try {
    const table = await fetchTable();
    eventTitleEl.textContent = table.title ? `for: ${table.title}` : '';
    isAdmin = table.owners.includes(table.currentUserId || table.user?._id || '');
    if (!isAdmin && localStorage.getItem('userId')) {
      isAdmin = table.owners.includes(localStorage.getItem('userId'));
    }
    if (!isAdmin) addNoteBtn.style.display = 'none';
    // Fetch notes
    const notesRes = await fetchNotes();
    renderNotes(notesRes.adminNotes || []);
  } catch (e) {
    notesList.innerHTML = `<div style='color:red;text-align:center;'>${e.message}</div>`;
    addNoteBtn.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  modalQuill = new Quill('#modalEditor', { theme: 'snow' });
  addNoteBtn.onclick = () => showModal('Add Note');
  cancelNoteBtn.onclick = hideModal;
  saveNoteBtn.onclick = saveNote;
  // Close modal on Esc
  noteModal.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideModal();
  });
  init();
}); 