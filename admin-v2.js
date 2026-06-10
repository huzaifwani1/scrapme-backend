/* ========================================================
   SCRAPME ADMIN — v3 (paginated, searchable, scalable)
   ======================================================== */
(() => {
  'use strict';

  const API_BASE = 'https://scrapme-backend.onrender.com/api';

  /* ─── STATE ───────────────────────────────────────────── */
  let state = {
    page: 1,
    limit: 50,
    totalPages: 1,
    total: 0,
    search: '',
    status: 'all',
    reviewed: '',
    brand: '',
    location: '',
    currentRequestId: null,
    searchTimer: null,
  };

  /* ─── HELPERS ─────────────────────────────────────────── */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('toast-exit'), 2700);
    setTimeout(() => toast.remove(), 3000);
  }

  async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('dp_admin_token');
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res  = await fetch(API_BASE + path, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
        throw new Error(data.errors.map(e => e.message).join(', '));
      }
      throw new Error(data.message || 'Request failed');
    }
    return data;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  function statusLabel(status) {
    return {
      pending:   '⏳ Pending',
      evaluated: '📋 Evaluated',
      approved:  '✅ Approved',
      completed: '🎉 Completed',
      rejected:  '❌ Rejected',
      contacted: '📞 Contacted',
      accepted:  '🤝 Accepted',
      purchased: '💰 Purchased',
    }[status] || status;
  }

  function statusClass(status) {
    return {
      pending:   'status-pending',
      evaluated: 'status-evaluated',
      approved:  'status-approved',
      completed: 'status-completed',
      rejected:  'status-rejected',
      contacted: 'status-contacted',
      accepted:  'status-accepted',
      purchased: 'status-purchased',
    }[status] || 'status-pending';
  }

  /* ─── LOGIN ───────────────────────────────────────────── */
  const loginScreen = $('#login-screen');
  const adminLayout = $('#admin-layout');

  $('#admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#admin-user').value.trim();
    const password = $('#admin-pass').value.trim();
    try {
      const data = await apiFetch('/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      localStorage.setItem('dp_admin_token', data.token);
      showAdminPanel();
      showToast('Welcome back, Admin! 👋');
    } catch {
      $('#login-error').style.display = 'block';
    }
  });

  $('#admin-logout').addEventListener('click', () => {
    localStorage.removeItem('dp_admin_token');
    loginScreen.classList.remove('hidden');
    adminLayout.classList.remove('active');
    showToast('Logged out');
  });

  function showAdminPanel() {
    loginScreen.classList.add('hidden');
    adminLayout.classList.add('active');
    $('#login-error').style.display = 'none';
    refreshStats();
    loadRequests();
  }

  /* ─── NAVIGATION ──────────────────────────────────────── */
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchPage(item.dataset.page));
  });

  function switchPage(page) {
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    $(`.nav-item[data-page="${page}"]`).classList.add('active');
    $$('.page-view').forEach(p => p.classList.remove('active'));
    $(`#page-${page}`).classList.add('active');
    if (page === 'messages') renderMessagesPage();
    if (page === 'requests') loadRequests();
  }

  /* ─── DASHBOARD STATS ─────────────────────────────────── */
  async function refreshStats() {
    try {
      const s = await apiFetch('/admin/stats');
      $('#stat-total').textContent       = s.total       ?? 0;
      $('#stat-pending').textContent     = s.pending      ?? 0;
      $('#stat-reviewed').textContent    = s.reviewed     ?? 0;
      $('#stat-unreviewed').textContent  = s.unreviewed   ?? 0;
      $('#stat-purchased').textContent   = s.purchased    ?? 0;
      $('#stat-contacted').textContent   = s.contacted    ?? 0;
      $('#stat-rejected').textContent    = s.rejected     ?? 0;
      $('#stat-users').textContent       = s.users        ?? 0;
      // Nav badge
      $('#req-count').textContent        = s.total        ?? 0;
    } catch (err) {
      console.error('Stats error:', err.message);
    }
  }

  /* ─── LOAD REQUESTS (paginated) ───────────────────────── */
  async function loadRequests() {
    const tbody = $('#all-requests-body');
    tbody.innerHTML = '<tr><td colspan="9" class="loading-row"><span class="spinner"></span> Loading…</td></tr>';

    try {
      const params = new URLSearchParams({
        page:  state.page,
        limit: state.limit,
      });
      if (state.search)   params.set('search',   state.search);
      if (state.status && state.status !== 'all') params.set('status', state.status);
      if (state.reviewed !== '') params.set('reviewed', state.reviewed);
      if (state.brand)    params.set('brand',    state.brand);
      if (state.location) params.set('location', state.location);

      const data = await apiFetch(`/admin/requests?${params}`);
      state.total      = data.pagination.total;
      state.totalPages = data.pagination.totalPages;

      renderRequestsTable(data.requests);
      renderPagination();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" class="loading-row" style="color:var(--red)">Failed to load: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  /* ─── RENDER TABLE ────────────────────────────────────── */
  function renderRequestsTable(requests) {
    const tbody = $('#all-requests-body');
    const empty = $('#requests-empty');

    if (!requests || requests.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = requests.map(r => `
      <tr data-id="${r._id}" class="${r.reviewed ? 'row-reviewed' : ''}">
        <td class="td-check" onclick="event.stopPropagation()">
          <label class="check-wrap" title="${r.reviewed ? 'Mark unreviewed' : 'Mark reviewed'}">
            <input type="checkbox" class="reviewed-cb" data-id="${r._id}" ${r.reviewed ? 'checked' : ''} />
            <span class="check-icon">${r.reviewed ? '✅' : ''}</span>
          </label>
        </td>
        <td>
          <div class="device-info">
            <div class="device-thumb">📱</div>
            <div>
              <div class="device-name">${escapeHtml(r.brand)} ${escapeHtml(r.model)}</div>
              <div class="device-storage">${escapeHtml(r.storage)}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(r.sellerName || '—')}</td>
        <td>${escapeHtml(r.phone || '—')}</td>
        <td class="td-location">${escapeHtml(r.address || '—')}</td>
        <td><strong>${escapeHtml(r.price || '—')}</strong></td>
        <td onclick="event.stopPropagation()">
          <select class="quick-status-select" data-id="${r._id}" title="Quick status update">
            ${['pending','contacted','accepted','purchased','rejected','evaluated','approved','completed'].map(s =>
              `<option value="${s}" ${r.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`
            ).join('')}
          </select>
        </td>
        <td class="td-notes">
          ${r.adminNotes ? `<span class="notes-icon" title="${escapeHtml(r.adminNotes)}">📝</span>` : '<span class="notes-empty">—</span>'}
        </td>
        <td>${r.date ? escapeHtml(r.date) : '—'}</td>
      </tr>`).join('');

    // Row click → open detail
    tbody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', () => openDetail(row.dataset.id));
    });

    // Reviewed checkbox toggle
    tbody.querySelectorAll('.reviewed-cb').forEach(cb => {
      cb.addEventListener('change', async () => {
        const id = cb.dataset.id;
        const reviewed = cb.checked;
        try {
          await apiFetch(`/admin/requests/${id}/reviewed`, { method: 'PUT', body: JSON.stringify({ reviewed }) });
          const icon = cb.nextElementSibling;
          icon.textContent = reviewed ? '✅' : '';
          cb.closest('tr').classList.toggle('row-reviewed', reviewed);
          refreshStats();
        } catch { showToast('Failed to update reviewed status', 'error'); cb.checked = !reviewed; }
      });
    });

    // Quick status select
    tbody.querySelectorAll('.quick-status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id     = sel.dataset.id;
        const status = sel.value;
        try {
          await apiFetch(`/admin/requests/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
          showToast(`Status → ${statusLabel(status)}`);
          refreshStats();
        } catch { showToast('Failed to update status', 'error'); }
      });
    });
  }

  /* ─── PAGINATION ──────────────────────────────────────── */
  function renderPagination() {
    const bar = $('#pagination-bar');
    bar.innerHTML = `
      <div class="page-info">
        Showing page <strong>${state.page}</strong> of <strong>${state.totalPages}</strong>
        &nbsp;·&nbsp; <strong>${state.total}</strong> total requests
      </div>
      <div class="page-btns">
        <button id="pg-prev" class="btn btn-ghost btn-sm" ${state.page <= 1 ? 'disabled' : ''}>← Prev</button>
        <button id="pg-next" class="btn btn-ghost btn-sm" ${state.page >= state.totalPages ? 'disabled' : ''}>Next →</button>
      </div>`;

    $('#pg-prev').addEventListener('click', () => { if (state.page > 1) { state.page--; loadRequests(); } });
    $('#pg-next').addEventListener('click', () => { if (state.page < state.totalPages) { state.page++; loadRequests(); } });
  }

  /* ─── SEARCH BAR ──────────────────────────────────────── */
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      state.search = e.target.value.trim();
      state.page   = 1;
      loadRequests();
    }, 350);
  });

  /* ─── FILTER BUTTONS ──────────────────────────────────── */
  $$('.filter-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter-status-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.status = btn.dataset.filter;
      state.page   = 1;
      loadRequests();
    });
  });

  $('#filter-reviewed').addEventListener('change', () => {
    state.reviewed = $('#filter-reviewed').value;
    state.page     = 1;
    loadRequests();
  });

  $('#filter-brand').addEventListener('change', () => {
    state.brand = $('#filter-brand').value;
    state.page  = 1;
    loadRequests();
  });

  /* ─── DETAIL MODAL ────────────────────────────────────── */
  const detailModal = $('#detail-modal');

  async function openDetail(id) {
    try {
      // Fetch just the single record via search by id
      const data = await apiFetch(`/admin/requests?search=${id}&limit=1`);
      const r    = (data.requests || [])[0];
      if (!r) { showToast('Request not found', 'error'); return; }
      state.currentRequestId = id;

      $('#detail-title').textContent   = `${r.brand} ${r.model} — ${r.storage}`;
      $('#d-brand').textContent         = r.brand;
      $('#d-model').textContent         = r.model;
      $('#d-storage').textContent       = r.storage;
      $('#d-price').textContent         = r.price || '—';
      $('#d-seller').textContent        = r.sellerName || '—';
      $('#d-email').textContent         = r.userEmail  || '—';
      $('#d-phone').textContent         = r.phone      || '—';
      $('#d-address').textContent       = r.address    || '—';
      $('#d-status-select').value       = r.status     || 'pending';
      $('#d-notes-area').value          = r.adminNotes || '';
      $('#d-reviewed-cb').checked       = !!r.reviewed;

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

  $('#detail-close').addEventListener('click', () => { detailModal.classList.remove('open'); state.currentRequestId = null; });
  detailModal.addEventListener('click', (e) => { if (e.target === detailModal) { detailModal.classList.remove('open'); state.currentRequestId = null; } });

  /* ─── STATUS UPDATE (in modal) ────────────────────────── */
  $('#d-status-update').addEventListener('click', async () => {
    if (!state.currentRequestId) return;
    try {
      await apiFetch(`/admin/requests/${state.currentRequestId}/status`, { method: 'PUT', body: JSON.stringify({ status: $('#d-status-select').value }) });
      loadRequests();
      refreshStats();
      showToast('Status updated!');
    } catch { showToast('Failed to update status', 'error'); }
  });

  /* ─── REVIEWED TOGGLE (in modal) ──────────────────────── */
  $('#d-reviewed-cb').addEventListener('change', async () => {
    if (!state.currentRequestId) return;
    const reviewed = $('#d-reviewed-cb').checked;
    try {
      await apiFetch(`/admin/requests/${state.currentRequestId}/reviewed`, { method: 'PUT', body: JSON.stringify({ reviewed }) });
      refreshStats();
      loadRequests();
      showToast(reviewed ? 'Marked as reviewed ✅' : 'Marked as unreviewed');
    } catch { showToast('Failed to update', 'error'); $('#d-reviewed-cb').checked = !reviewed; }
  });

  /* ─── ADMIN NOTES (in modal) ──────────────────────────── */
  let notesSaveTimer = null;
  $('#d-notes-area').addEventListener('input', () => {
    clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(saveNotes, 1200);
  });

  $('#d-save-notes').addEventListener('click', saveNotes);

  async function saveNotes() {
    if (!state.currentRequestId) return;
    try {
      await apiFetch(`/admin/requests/${state.currentRequestId}/notes`, { method: 'PUT', body: JSON.stringify({ adminNotes: $('#d-notes-area').value }) });
      showToast('Notes saved!');
      loadRequests();
    } catch { showToast('Failed to save notes', 'error'); }
  }

  /* ─── SEND MESSAGE ────────────────────────────────────── */
  const msgInput = $('#d-message-input');
  const sendBtn  = $('#d-send-btn');

  async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !state.currentRequestId) return;
    try {
      await apiFetch(`/admin/messages/${state.currentRequestId}`, { method: 'POST', body: JSON.stringify({ text }) });
      msgInput.value = '';
      await renderDetailMessages(state.currentRequestId);
      showToast('Message sent!');
    } catch { showToast('Failed to send', 'error'); }
  }

  sendBtn.addEventListener('click', sendMessage);
  msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

  /* ─── MESSAGES PAGE ───────────────────────────────────── */
  async function renderMessagesPage() {
    const list  = $('#messages-list');
    const empty = $('#messages-empty');
    list.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)"><span class="spinner"></span> Loading…</div>';
    try {
      // Fetch first 100 requests and filter those with messages
      const data    = await apiFetch('/admin/requests?limit=100');
      const requests = data.requests || [];
      const threads  = [];

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
            <div class="thread-name">${escapeHtml(r.sellerName || 'Unknown')} — ${escapeHtml(r.brand)} ${escapeHtml(r.model)}</div>
            <div class="thread-preview">${escapeHtml(last.text.substring(0, 60))}${last.text.length > 60 ? '…' : ''}</div>
          </div>
          <div>
            <div class="thread-time">${last.time}</div>
            <span class="thread-unread">${msgs.length}</span>
          </div>
        </div>`;
      }).join('');

      list.querySelectorAll('.message-thread').forEach(t => t.addEventListener('click', () => openDetail(t.dataset.id)));
    } catch { list.innerHTML = ''; empty.style.display = 'block'; }
  }

  /* ─── INIT ────────────────────────────────────────────── */
  (function init() {
    const token = localStorage.getItem('dp_admin_token');
    if (token) {
      apiFetch('/admin/stats').then(() => {
        showAdminPanel();
      }).catch(() => {
        localStorage.removeItem('dp_admin_token');
      });
    }
  })();

  // Auto-refresh stats every 60s (not requests, to avoid disrupting user)
  setInterval(() => {
    if (localStorage.getItem('dp_admin_token')) refreshStats();
  }, 60000);
})();
