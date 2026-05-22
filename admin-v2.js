/* ========== SCRAPME ADMIN JS — backend-powered ========== */
(() => {
  'use strict';

  const API_BASE = 'http://localhost:3001/api';
  let currentFilter = 'all';
  let currentRequestId = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ─── API HELPER ─────────────────────────────────────
  async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('dp_admin_token');
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API_BASE + path, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      // For validation errors, provide more detailed message
      if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
        const errorMessages = data.errors.map(err => err.message).join(', ');
        throw new Error(`Validation failed: ${errorMessages}`);
      }
      throw new Error(data.message || 'Request failed');
    }
    return data;
  }

  // ─── LOGIN ──────────────────────────────────────────
  const loginForm = $('#admin-login-form');
  const loginScreen = $('#login-screen');
  const adminLayout = $('#admin-layout');
  const loginError = $('#login-error');

  if (localStorage.getItem('dp_admin_token')) {
    loginScreen.classList.add('hidden');
    adminLayout.classList.add('active');
    refreshAll();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#admin-user').value.trim();
    const password = $('#admin-pass').value.trim();
    try {
      const data = await apiFetch('/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      localStorage.setItem('dp_admin_token', data.token);
      loginScreen.classList.add('hidden');
      adminLayout.classList.add('active');
      loginError.style.display = 'none';
      refreshAll();
      showToast('Welcome back, Admin!');
    } catch {
      loginError.style.display = 'block';
    }
  });

  $('#admin-logout').addEventListener('click', () => {
    localStorage.removeItem('dp_admin_token');
    loginScreen.classList.remove('hidden');
    adminLayout.classList.remove('active');
    showToast('Logged out');
  });

  // ─── NAVIGATION ─────────────────────────────────────
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchPage(item.dataset.page));
  });

  function switchPage(page) {
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    $(`.nav-item[data-page="${page}"]`).classList.add('active');
    $$('.page-view').forEach(p => p.classList.remove('active'));
    $(`#page-${page}`).classList.add('active');
    if (page === 'messages') renderMessagesPage();
  }

  // ─── REFRESH ALL ────────────────────────────────────
  async function refreshAll() {
    try {
      const requests = await apiFetch('/admin/requests');

      $('#stat-total').textContent = requests.length;
      $('#stat-pending').textContent = requests.filter(r => r.status === 'pending').length;
      $('#stat-completed').textContent = requests.filter(r => r.status === 'completed').length;
      $('#req-count').textContent = requests.length;

      // Count total admin messages
      let totalMsgs = 0;
      for (const r of requests) {
        try {
          const msgs = await apiFetch(`/admin/messages/${r._id}`);
          totalMsgs += msgs.filter(m => m.from === 'admin').length;
        } catch { /* ignore */ }
      }
      $('#stat-messages').textContent = totalMsgs;

      // Fetch user count
      try {
        const userCountData = await apiFetch('/admin/users/count');
        $('#stat-users').textContent = userCountData.count || 0;
      } catch (err) {
        console.error('Failed to fetch user count:', err.message);
        $('#stat-users').textContent = '0';
      }

      renderRecentRequests(requests);
      renderAllRequests(requests);
    } catch (err) { console.error('refreshAll:', err.message); }
  }

  // ─── RENDER RECENT ──────────────────────────────────
  function renderRecentRequests(requests) {
    const tbody = $('#recent-requests-body');
    const empty = $('#dashboard-empty');
    if (requests.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    tbody.innerHTML = requests.slice(0, 5).map(r => `
      <tr data-id="${r._id}">
        <td><div class="device-info"><div class="device-thumb">📱</div>
          <div><div class="device-name">${r.brand} ${r.model}</div><div class="device-storage">${r.storage}</div></div></div></td>
        <td>${r.sellerName || '—'}</td>
        <td>${r.date || '—'}</td>
        <td><strong>${r.price || '—'}</strong></td>
        <td><span class="status-badge status-${r.status}">${statusLabel(r.status)}</span></td>
      </tr>`).join('');
    bindRowClicks(tbody);
  }

  // ─── RENDER ALL ─────────────────────────────────────
  function renderAllRequests(requests) {
    const tbody = $('#all-requests-body');
    const empty = $('#requests-empty');
    const filtered = currentFilter === 'all' ? requests : requests.filter(r => r.status === currentFilter);

    if (filtered.length === 0) {
      tbody.innerHTML = ''; empty.style.display = 'block';
      tbody.parentElement.querySelector('thead').style.display = 'none'; return;
    }
    empty.style.display = 'none';
    tbody.parentElement.querySelector('thead').style.display = '';
    tbody.innerHTML = filtered.map(r => `
      <tr data-id="${r._id}">
        <td><div class="device-info"><div class="device-thumb">📱</div>
          <div><div class="device-name">${r.brand} ${r.model}</div><div class="device-storage">${r.storage}</div></div></div></td>
        <td>${r.sellerName || '—'}</td>
        <td>${r.phone || '—'}</td>
        <td>${r.date || '—'}</td>
        <td><strong>${r.price || '—'}</strong></td>
        <td><span class="status-badge status-${r.status}">${statusLabel(r.status)}</span></td>
      </tr>`).join('');
    bindRowClicks(tbody);
  }

  function statusLabel(status) {
    return { pending: '⏳ Pending', evaluated: '📋 Evaluated', approved: '✅ Approved', completed: '🎉 Completed', rejected: '❌ Rejected' }[status] || status;
  }

  function bindRowClicks(tbody) {
    tbody.querySelectorAll('tr').forEach(row => row.addEventListener('click', () => openDetail(row.dataset.id)));
  }

  // ─── FILTER BUTTONS ─────────────────────────────────
  $$('.filter-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      $$('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      try {
        const url = currentFilter === 'all' ? '/admin/requests' : `/admin/requests?status=${currentFilter}`;
        renderAllRequests(await apiFetch(url));
      } catch { showToast('Failed to filter', 'error'); }
    });
  });

  // ─── DETAIL MODAL ───────────────────────────────────
  const detailModal = $('#detail-modal');

  async function openDetail(id) {
    try {
      const requests = await apiFetch('/admin/requests');
      const r = requests.find(req => req._id === id);
      if (!r) { showToast('Request not found', 'error'); return; }
      currentRequestId = id;

      $('#detail-title').textContent = `${r.brand} ${r.model} — ${r.storage}`;
      $('#d-brand').textContent = r.brand;
      $('#d-model').textContent = r.model;
      $('#d-storage').textContent = r.storage;
      $('#d-price').textContent = r.price || '—';
      $('#d-seller').textContent = r.sellerName || '—';
      $('#d-email').textContent = r.userEmail || '—';
      $('#d-phone').textContent = r.phone || '—';
      $('#d-address').textContent = r.address || '—';
      $('#d-status-select').value = r.status || 'pending';
      $('#d-details').innerHTML = '<div class="no-details">📱 Device specifications and condition details will appear here</div>';

      await renderDetailMessages(id);
      detailModal.classList.add('open');
    } catch (err) { showToast('Failed to load: ' + err.message, 'error'); }
  }

  async function renderDetailMessages(requestId) {
    const container = $('#d-messages');
    try {
      const msgs = await apiFetch(`/admin/messages/${requestId}`);
      container.innerHTML = msgs.length === 0
        ? '<div class="messages-empty">No messages yet. Type below to start a conversation.</div>'
        : msgs.map(m => `<div class="message message-${m.from}"><div>${escapeHtml(m.text)}</div><div class="message-time">${m.time}</div></div>`).join('');
      container.scrollTop = container.scrollHeight;
    } catch { container.innerHTML = '<div class="messages-empty">Failed to load messages.</div>'; }
  }

  $('#detail-close').addEventListener('click', () => { detailModal.classList.remove('open'); currentRequestId = null; });
  detailModal.addEventListener('click', (e) => { if (e.target === detailModal) { detailModal.classList.remove('open'); currentRequestId = null; } });

  // ─── SEND MESSAGE ───────────────────────────────────
  const msgInput = $('#d-message-input');
  const sendBtn = $('#d-send-btn');

  async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !currentRequestId) return;
    try {
      await apiFetch(`/admin/messages/${currentRequestId}`, { method: 'POST', body: JSON.stringify({ text }) });
      msgInput.value = '';
      await renderDetailMessages(currentRequestId);
      showToast('Message sent!');
    } catch { showToast('Failed to send', 'error'); }
  }

  sendBtn.addEventListener('click', sendMessage);
  msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

  // ─── UPDATE STATUS ──────────────────────────────────
  $('#d-status-update').addEventListener('click', async () => {
    if (!currentRequestId) return;
    try {
      await apiFetch(`/admin/requests/${currentRequestId}/status`, { method: 'PUT', body: JSON.stringify({ status: $('#d-status-select').value }) });
      await refreshAll();
      showToast('Status updated!');
    } catch { showToast('Failed to update status', 'error'); }
  });

  // ─── MESSAGES PAGE ──────────────────────────────────
  async function renderMessagesPage() {
    const list = $('#messages-list');
    const empty = $('#messages-empty');
    try {
      const requests = await apiFetch('/admin/requests');
      const threads = [];
      for (const r of requests) {
        try {
          const msgs = await apiFetch(`/admin/messages/${r._id}`);
          if (msgs.length > 0) threads.push({ request: r, messages: msgs });
        } catch { /* ignore */ }
      }
      $('#msg-count').textContent = threads.length;
      if (threads.length === 0) { list.innerHTML = ''; empty.style.display = 'block'; return; }
      empty.style.display = 'none';
      list.innerHTML = threads.map(({ request: r, messages: msgs }) => {
        const last = msgs[msgs.length - 1];
        return `<div class="message-thread" data-id="${r._id}">
          <div class="thread-avatar">${(r.sellerName || 'U').charAt(0).toUpperCase()}</div>
          <div class="thread-info">
            <div class="thread-name">${r.sellerName || 'Unknown'} — ${r.brand} ${r.model}</div>
            <div class="thread-preview">${escapeHtml(last.text.substring(0, 60))}${last.text.length > 60 ? '...' : ''}</div>
          </div>
          <div><div class="thread-time">${last.time}</div><span class="thread-unread">${msgs.length}</span></div>
        </div>`;
      }).join('');
      list.querySelectorAll('.message-thread').forEach(t => t.addEventListener('click', () => openDetail(t.dataset.id)));
    } catch { list.innerHTML = ''; empty.style.display = 'block'; }
  }

  function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

  // ─── INITIALIZATION ────────────────────────────────
  // Check if admin is already logged in on page load
  (function init() {
    const token = localStorage.getItem('dp_admin_token');
    const loginScreen = $('#login-screen');
    const adminLayout = $('#admin-layout');

    if (token) {
      // Verify token is valid by making a test request
      apiFetch('/admin/requests').then(() => {
        // Token is valid, show admin layout
        loginScreen.classList.add('hidden');
        adminLayout.classList.add('active');
        refreshAll();
      }).catch(() => {
        // Token is invalid or expired, clear it
        localStorage.removeItem('dp_admin_token');
        loginScreen.classList.remove('hidden');
        adminLayout.classList.remove('active');
      });
    }
  })();

  // ─── AUTO-REFRESH (5s) ──────────────────────────────
  setInterval(() => { if (localStorage.getItem('dp_admin_token')) refreshAll(); }, 5000);
})();
