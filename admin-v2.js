/* ========================================================
   SCRAPME ADMIN — v3 (paginated, searchable, scalable)
   ======================================================== */
(() => {
  'use strict';

  const API_BASE = (
    window.location.protocol === 'file:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  )
    ? 'http://localhost:3001/api'
    : 'https://scrapme-backend.onrender.com/api';

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
    } catch (err) {
      const errEl = $('#login-error');
      errEl.textContent = err.message || 'Login failed. Please try again.';
      errEl.style.display = 'block';
    }
  });

  $('#admin-logout').addEventListener('click', () => {
    stopAdminEventSource();
    localStorage.removeItem('dp_admin_token');
    loginScreen.classList.remove('hidden');
    adminLayout.classList.remove('active');
    showToast('Logged out');
  });

  function showAdminPanel() {
    loginScreen.classList.add('hidden');
    adminLayout.classList.add('active');
    $('#login-error').style.display = 'none';
    startAdminEventSource();
    refreshStats();
    loadRequests();
  }

  /* ─── NAVIGATION ──────────────────────────────────────── */
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchPage(item.dataset.page));
  });

  function switchPage(page) {
    if (adminGpsTimer) {
      clearInterval(adminGpsTimer);
      adminGpsTimer = null;
    }
    if (adminPerformanceTimer) {
      clearInterval(adminPerformanceTimer);
      adminPerformanceTimer = null;
    }

    $$('.nav-item').forEach(n => n.classList.remove('active'));
    $(`.nav-item[data-page="${page}"]`).classList.add('active');
    $$('.page-view').forEach(p => p.classList.remove('active'));
    $(`#page-${page}`).classList.add('active');
    
    if (page === 'messages') renderMessagesPage();
    if (page === 'requests') loadRequests();
    if (page === 'partners') renderPartnersPage();
    if (page === 'gps') initGpsPage();
    if (page === 'users') initUsersPage();
    if (page === 'influencers') initInfluencersPage();
    if (page === 'commissions') initCommissionsPage();
    if (page === 'performance') {
      renderPerformancePage();
      adminPerformanceTimer = setInterval(renderPerformancePage, 60000);
    }
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

      // Check partner assignment
      try {
        const orderInfo = await apiFetch(`/operations/admin/orders/request/${id}`);
        $('#d-partner-select').style.display = 'none';
        $('#d-assign-partner-btn').style.display = 'none';
        $('#d-assignment-info').innerHTML = `
          <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); padding: 12px; border-radius: 8px;">
            <div style="font-weight: 700; color: var(--green);">Order Assigned</div>
            <div style="margin-top: 4px;">Order ID: <strong>${orderInfo.orderId}</strong></div>
            <div>Agent: <strong>${orderInfo.partnerId.name} (${orderInfo.partnerId.employeeId})</strong></div>
            <div>Status: <span style="background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; text-transform: uppercase;">${orderInfo.status}</span></div>
          </div>
        `;
      } catch (err) {
        $('#d-partner-select').style.display = 'inline-block';
        $('#d-assign-partner-btn').style.display = 'inline-block';
        $('#d-assignment-info').innerHTML = '<span style="color: var(--amber);">⏳ Not assigned yet. Select partner below:</span>';
        await loadPartnersDropdown();
      }

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

  window.openDetail = openDetail;
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

  /* ─── OPERATIONS ADMIN ACTIONS ────────────────────────── */
  
  // Bind partner assign click
  $('#d-assign-partner-btn').addEventListener('click', async () => {
    const partnerId = $('#d-partner-select').value;
    if (!partnerId) { showToast('Please select a partner first', 'error'); return; }
    if (!state.currentRequestId) return;
    try {
      await apiFetch('/operations/admin/assign', {
        method: 'POST',
        body: JSON.stringify({ requestId: state.currentRequestId, partnerId })
      });
      showToast('Pickup Partner assigned successfully! Order generated.');
      openDetail(state.currentRequestId);
      loadRequests();
      refreshStats();
    } catch (err) {
      showToast('Assignment failed: ' + err.message, 'error');
    }
  });

  async function loadPartnersDropdown() {
    try {
      const partners = await apiFetch('/operations/admin/partners');
      const select = $('#d-partner-select');
      select.innerHTML = '<option value="">-- Select Partner --</option>' +
        partners
          .filter(p => p.active && p.role === 'partner')
          .map(p => `<option value="${p._id}">${escapeHtml(p.name)} (${escapeHtml(p.employeeId)})</option>`)
          .join('');
    } catch (err) {
      console.error('Failed to load partners dropdown:', err.message);
    }
  }

  // Register a new partner form
  $('#admin-partner-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#ap-name').value.trim();
    const phone = $('#ap-phone').value.trim();
    const employeeId = $('#ap-id').value.trim();
    const password = $('#ap-pass').value;
    const role = $('#ap-role').value;
    
    try {
      await apiFetch('/operations/admin/partners', {
        method: 'POST',
        body: JSON.stringify({ name, phone, employeeId, password, role })
      });
      showToast('Operations user registered successfully!');
      $('#admin-partner-form').reset();
      renderPartnersPage();
    } catch (err) {
      showToast('Registration failed: ' + err.message, 'error');
    }
  });

  async function renderPartnersPage() {
    const tbody = $('#admin-partners-table-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;"><span class="spinner"></span> Loading partners…</td></tr>';
    
    try {
      const partners = await apiFetch('/operations/admin/partners');
      if (partners.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No registered partners.</td></tr>';
        return;
      }
      
      tbody.innerHTML = partners.map(p => `
        <tr>
          <td><strong>${escapeHtml(p.employeeId)}</strong></td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.phone)}</td>
          <td><span class="status-badge" style="background: rgba(255,255,255,0.05); text-transform: capitalize; padding: 2px 6px; border-radius: 4px;">${p.role}</span></td>
          <td>
            <span class="status-badge ${p.active ? 'status-approved' : 'status-rejected'}" style="padding: 2px 6px; border-radius: 4px;">
              ${p.active ? 'Active' : 'Inactive'}
            </span>
          </td>
          <td>
            <button class="btn btn-ghost btn-sm btn-toggle-partner" data-id="${p._id}" data-active="${p.active}">
              Toggle Active
            </button>
          </td>
        </tr>
      `).join('');
      
      tbody.querySelectorAll('.btn-toggle-partner').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const active = btn.dataset.active === 'true';
          try {
            await apiFetch(`/operations/admin/partners/${id}`, {
              method: 'PUT',
              body: JSON.stringify({ active: !active })
            });
            showToast('Partner status toggled successfully!');
            renderPartnersPage();
          } catch (err) {
            showToast('Failed to toggle status: ' + err.message, 'error');
          }
        });
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--red);">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // GPS Map state variables
  let adminGpsMap = null;
  let adminGpsMarkers = {};
  let adminGpsTimer = null;
  let adminPerformanceTimer = null;
  let isPerformanceLoading = false;
  let adminGpsPolylineLayers = [];
  let adminEventSource = null;

  function startAdminEventSource() {
    if (adminEventSource) {
      adminEventSource.close();
      adminEventSource = null;
    }

    const sseUrl = API_BASE.replace('/api', '') + '/api/operations/events';
    adminEventSource = new EventSource(sseUrl);

    adminEventSource.addEventListener('message', (e) => {
      try {
        console.log('[SSE INCOMING MESSAGE] Received event data:', e.data);
        const event = JSON.parse(e.data);
        handleAdminIncomingEvent(event);
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    });

    adminEventSource.addEventListener('error', (err) => {
      console.warn('Admin SSE connection error. Reconnecting...');
    });
  }

  function stopAdminEventSource() {
    if (adminEventSource) {
      adminEventSource.close();
      adminEventSource = null;
    }
  }

  function handleAdminIncomingEvent(event) {
    const { type, data } = event;

    if (type === 'partner_status_change') {
      const emoji = data.online ? '🟢' : '⚪';
      const statusText = data.online ? 'Online' : 'Offline';
      showToast(`${emoji} ${data.name} is now ${statusText}`, data.online ? 'success' : 'info');
      refreshDashboardData();
      if (window.activeProfilePartnerId && window.activeProfilePartnerId === data.partnerId) {
        openPartnerProfile(window.activeProfilePartnerId);
      }
    }

    else if (type === 'gps_update') {
      const activeTab = $('.nav-item.active');
      if (activeTab && activeTab.dataset.page === 'gps') {
        updateGpsTracking();
      }
      if (activeTab && activeTab.dataset.page === 'performance') {
        renderPerformancePage();
      }
      
      // Update open partner profile modal in real-time
      if (window.activeProfilePartnerId && window.activeProfilePartnerId === data.partnerId) {
        openPartnerProfile(window.activeProfilePartnerId);
      }
      
      // Update open logistics order detail modal in real-time
      if (window.activeOrderDetailOrderId && window.activeOrderDetailPartnerId === data.partnerId) {
        openAdminOrderDetail(window.activeOrderDetailOrderId);
      }
    }

    else if (type === 'gps_address_update') {
      const activeTab = $('.nav-item.active');
      if (activeTab && activeTab.dataset.page === 'gps') {
        updateGpsTracking();
      }
      if (window.activeProfilePartnerId && window.activeProfilePartnerId === data.partnerId) {
        openPartnerProfile(window.activeProfilePartnerId);
      }
      if (window.activeOrderDetailOrderId && window.activeOrderDetailPartnerId === data.partnerId) {
        openAdminOrderDetail(window.activeOrderDetailOrderId);
      }
    }

    else if (type === 'assignment_change' || type === 'pickup_completed' || type === 'otp_generated') {
      refreshDashboardData();
      if (type === 'pickup_completed') {
        showToast(`📦 Collection Completed for order: ${data.orderId || 'Pickup'}!`, 'success');
      }
      if (window.activeProfilePartnerId && window.activeProfilePartnerId === data.partnerId) {
        openPartnerProfile(window.activeProfilePartnerId);
      }
      if (window.activeOrderDetailOrderId && window.activeOrderDetailOrderId === data.orderId) {
        openAdminOrderDetail(window.activeOrderDetailOrderId);
      }
    }
  }

  function refreshDashboardData() {
    refreshStats();
    loadRequests();

    const activePage = $('.nav-item.active');
    const pageName = activePage ? activePage.dataset.page : '';
    if (pageName === 'partners') {
      renderPartnersPage();
    } else if (pageName === 'performance') {
      renderPerformancePage();
    } else if (pageName === 'gps') {
      updateGpsTracking();
    }
  }

  async function initGpsPage() {
    // Initialize Leaflet map if not already loaded
    if (!adminGpsMap) {
      const mapContainer = document.getElementById('admin-gps-map');
      if (!mapContainer) {
        console.warn('admin-gps-map container not found');
        return;
      }
      adminGpsMap = L.map('admin-gps-map').setView([12.9716, 77.5946], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(adminGpsMap);
    }
    
    updateGpsTracking();
    clearInterval(adminGpsTimer);
    adminGpsTimer = setInterval(updateGpsTracking, 8000);
  }

  async function updateGpsTracking() {
    // If not currently on GPS page, stop polling
    const activeTab = $('.nav-item.active');
    if (!activeTab || activeTab.dataset.page !== 'gps') {
      clearInterval(adminGpsTimer);
      return;
    }
    
    try {
      const locations = await apiFetch('/operations/admin/locations');
      const list = $('#admin-gps-agents-list');
      
      if (locations.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No on-duty agents tracking location.</div>';
        
        // Clear all markers from map
        Object.keys(adminGpsMarkers).forEach(key => adminGpsMap.removeLayer(adminGpsMarkers[key]));
        adminGpsMarkers = {};
        
        adminGpsPolylineLayers.forEach(layer => adminGpsMap.removeLayer(layer));
        adminGpsPolylineLayers = [];
        return;
      }
      
      list.innerHTML = locations.map(l => {
        const partner = l.partnerId || {};
        const partnerName = partner.name || 'Unknown';
        const partnerId = partner.employeeId || 'N/A';
        const isOnline = partner.online;
        const speedVal = l.speed !== undefined && l.speed !== null ? `${Number(l.speed).toFixed(1)} m/s` : 'N/A';
        const accuracyVal = l.accuracy !== undefined && l.accuracy !== null ? `${Number(l.accuracy).toFixed(1)}m` : 'N/A';
        const batteryVal = l.battery !== undefined && l.battery !== null ? `${l.battery}%` : 'N/A';
        const activeOrderVal = l.currentAssignedOrder || 'None';
        const timeStr = new Date(l.lastUpdated || l.timestamp).toLocaleTimeString();
        const lastSeenDate = partner.lastActive ? new Date(partner.lastActive).toLocaleTimeString() : 'N/A';

        // Calculate GPS Health Status
        const lastUpdatedTime = l.lastUpdated || l.timestamp;
        const diffSec = lastUpdatedTime ? Math.floor((Date.now() - new Date(lastUpdatedTime).getTime()) / 1000) : 9999;
        let gpsHealthBadge = '';
        if (diffSec <= 30) {
          gpsHealthBadge = `<span class="badge success" style="padding: 2px 6px; font-size: 0.7rem; border-radius: 4px; background-color: var(--success); color: white;">🟢 HEALTHY</span>`;
        } else if (diffSec <= 120) {
          gpsHealthBadge = `<span class="badge warning" style="padding: 2px 6px; font-size: 0.7rem; border-radius: 4px; background-color: var(--amber); color: black;">🟡 DELAYED</span>`;
        } else {
          gpsHealthBadge = `<span class="badge danger" style="padding: 2px 6px; font-size: 0.7rem; border-radius: 4px; background-color: var(--red); color: white;">🔴 DEAD</span>`;
        }

        const statusBadge = isOnline 
          ? `<span class="badge success" style="padding: 2px 6px; font-size: 0.7rem; border-radius: 4px;">ONLINE</span>` 
          : `<span class="badge secondary" style="padding: 2px 6px; font-size: 0.7rem; border-radius: 4px;">OFFLINE</span>`;

        return `
          <div class="gps-agent-item" onclick="focusAgentGps(${l.latitude}, ${l.longitude}, '${escapeHtml(partnerName)}', '${partner._id}')" style="cursor: pointer; padding: 12px; border-bottom: 1px solid var(--border); transition: background 0.2s;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-weight:700;">
              <span>${escapeHtml(partnerName)} (${escapeHtml(partnerId)})</span>
              <div style="display: flex; gap: 4px; align-items: center;">
                ${gpsHealthBadge}
                ${statusBadge}
              </div>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top: 6px;">
              🌐 <strong>Coords:</strong> ${l.latitude.toFixed(6)}, ${l.longitude.toFixed(6)}
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top: 4px;">
              ⚡ <strong>Battery:</strong> ${batteryVal} | 📡 <strong>Accuracy:</strong> ${accuracyVal} | 🧭 <strong>Heading:</strong> ${l.heading !== undefined && l.heading !== null ? l.heading + '°' : 'N/A'}
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top: 4px;">
              🚗 <strong>Speed:</strong> ${speedVal} | 📦 <strong>Active:</strong> <span style="color: var(--primary);">${escapeHtml(activeOrderVal)}</span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top: 4px;">
              📏 <strong>Distance Today:</strong> ${l.todayDistanceKm || 0} km | 📅 <strong>Completed Today:</strong> ${l.completedTodayCount || 0}
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top: 4px; border-top: 1px dashed var(--border); padding-top: 4px;">
              🏠 <strong>Address:</strong> <span style="color: var(--text-main);">${escapeHtml(l.address || 'Locating current address...')}</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top: 6px; display: flex; justify-content: space-between;">
              <span>🕒 GPS: ${timeStr}</span>
              <span>Active: ${lastSeenDate}</span>
            </div>
          </div>
        `;
      }).join('');

      // Clear previous polyline layers first
      adminGpsPolylineLayers.forEach(layer => adminGpsMap.removeLayer(layer));
      adminGpsPolylineLayers = [];

      const activeIncomingIds = [];

      locations.forEach(l => {
        if (!l.latitude || !l.longitude) return;
        const partner = l.partnerId || {};
        if (!partner.online) {
          // Clean up offline markers
          if (adminGpsMarkers[l._id]) {
            adminGpsMap.removeLayer(adminGpsMarkers[l._id]);
            delete adminGpsMarkers[l._id];
          }
          return;
        }

        activeIncomingIds.push(l._id);

        const name = partner.name || 'Agent';
        const emp = partner.employeeId || '';
        const etaVal = l.eta || 'N/A';
        const speedVal = l.speed !== undefined && l.speed !== null ? `${Number(l.speed).toFixed(1)} m/s` : 'N/A';
        const headingVal = l.heading !== undefined && l.heading !== null ? `${l.heading}°` : 'N/A';
        const addressVal = l.address || 'Locating address...';
        const accuracyVal = l.accuracy !== undefined && l.accuracy !== null ? `${Number(l.accuracy).toFixed(1)}m` : 'N/A';
        const batteryVal = l.battery !== undefined && l.battery !== null ? `${l.battery}%` : 'N/A';
        
        const popupText = `<strong>${escapeHtml(name)} (${escapeHtml(emp)})</strong><br>
          Status: ONLINE<br>
          Speed: ${speedVal} | Heading: ${headingVal}<br>
          Accuracy: ${accuracyVal} | Battery: ${batteryVal}<br>
          Address: ${escapeHtml(addressVal)}<br>
          ETA: ${escapeHtml(etaVal)}<br>
          Coords: ${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}`;

        if (adminGpsMarkers[l._id]) {
          // Update position smoothly
          adminGpsMarkers[l._id].setLatLng([l.latitude, l.longitude]);
          adminGpsMarkers[l._id].setPopupContent(popupText);
        } else {
          // Create marker
          const marker = L.marker([l.latitude, l.longitude])
            .bindPopup(popupText)
            .addTo(adminGpsMap);
          adminGpsMarkers[l._id] = marker;
        }

        // Draw polyline if coordinates array exists
        if (l.route && l.route.length > 1) {
          const polyline = L.polyline(l.route, { color: '#3b82f6', weight: 4, opacity: 0.7 }).addTo(adminGpsMap);
          adminGpsPolylineLayers.push(polyline);
        }

        // Auto-pan if this partner is focused
        if (window.focusedPartnerId === partner._id) {
          adminGpsMap.panTo([l.latitude, l.longitude]);
        }
      });

      // Cleanup markers for partners that are no longer online/listed
      Object.keys(adminGpsMarkers).forEach(key => {
        if (!activeIncomingIds.includes(key)) {
          adminGpsMap.removeLayer(adminGpsMarkers[key]);
          delete adminGpsMarkers[key];
        }
      });
      
    } catch (err) {
      console.error('Failed to update GPS locations:', err.message);
    }
  }

  window.focusAgentGps = (lat, lng, name, partnerId) => {
    if (adminGpsMap) {
      adminGpsMap.setView([lat, lng], 15);
      window.focusedPartnerId = partnerId;
      showToast(`Focused on ${name}`);
    }
  };

  /* ─── PERFORMANCE & WORKFORCE MANAGEMENT ──────────────── */
  let adminOrderDetailMap = null;
  let adminOrderCustMarker = null;
  let adminOrderPartnerMarker = null;
  let adminOrderRoutePolyline = null;
  
  let partnerProfileMap = null;
  let partnerProfilePolyline = null;
  let partnerProfileMarker = null;

  async function geocodeAddress(address) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch (err) {
      console.error('Nominatim geocoding error:', err);
    }
    return null;
  }

  async function renderPerformancePage() {
    if (isPerformanceLoading) return;
    isPerformanceLoading = true;

    const grid = $('#admin-performance-cards');
    if (!grid.querySelector('.perf-card')) {
      grid.innerHTML = '<div style="padding: 40px; text-align: center; grid-column: 1/-1; color: var(--text-muted);"><span class="spinner"></span> Loading analytics reports…</div>';
    }
    
    try {
      // 1. Fetch Global Analytics
      const analytics = await apiFetch('/operations/admin/analytics');
      
      // Update global KPI text
      $('#global-completion-rate').textContent = `${analytics.completionRate}%`;
      $('#global-cancellation-rate').textContent = `${analytics.cancellationRate}%`;
      $('#global-avg-devices').textContent = analytics.avgDevicesPerPickup.toFixed(1);
      $('#global-avg-duration').textContent = `${analytics.avgPickupDuration}m`;
      $('#global-revenue').textContent = `₹${analytics.revenueCollected.toLocaleString()}`;

      // Update weekly trend table
      const weeklyContainer = $('#global-weekly-trends');
      if (analytics.weeklyPerformance && analytics.weeklyPerformance.length > 0) {
        weeklyContainer.innerHTML = analytics.weeklyPerformance.map(w => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
            <td style="padding: 8px;">Week of ${w.week}</td>
            <td style="padding: 8px; color: var(--success); font-weight: 600;">${w.completed}</td>
            <td style="padding: 8px; color: var(--accent); font-weight: 600;">${w.cancelled}</td>
          </tr>
        `).join('');
      } else {
        weeklyContainer.innerHTML = '<tr><td colspan="3" style="padding: 10px; text-align: center; color: var(--text-muted);">No weekly records.</td></tr>';
      }

      // Update monthly trend table
      const monthlyContainer = $('#global-monthly-trends');
      if (analytics.monthlyPerformance && analytics.monthlyPerformance.length > 0) {
        monthlyContainer.innerHTML = analytics.monthlyPerformance.map(m => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
            <td style="padding: 8px;">${m.month}</td>
            <td style="padding: 8px; color: var(--success); font-weight: 600;">${m.completed}</td>
            <td style="padding: 8px; color: var(--accent); font-weight: 600;">${m.cancelled}</td>
          </tr>
        `).join('');
      } else {
        monthlyContainer.innerHTML = '<tr><td colspan="3" style="padding: 10px; text-align: center; color: var(--text-muted);">No monthly records.</td></tr>';
      }

      // 2. Fetch Partner Dashboard Cards
      const stats = await apiFetch('/operations/admin/performance');
      if (stats.length === 0) {
        grid.innerHTML = '<div style="padding: 40px; text-align: center; grid-column: 1/-1; color: var(--text-muted);">No partners registered for collection stats.</div>';
        return;
      }
      
      grid.innerHTML = stats.map(s => {
        const p = s.partner;
        const onlineClass = p.online ? 'success' : 'secondary';
        const onlineText = p.online ? 'Online' : 'Offline';
        const onlineDot = p.online ? '🟢' : '⚪';
        const photo = p.profilePhoto || '/uploads/default-avatar.png';
        const pendingCount = s.pendingPickups || 0;
        const cancelledCount = s.cancelledPickups || 0;

        const lastSeen = p.lastActive ? new Date(p.lastActive).toLocaleString() : 'N/A';
        const gpsTime = s.gpsTimestamp ? new Date(s.gpsTimestamp).toLocaleTimeString() : 'N/A';
        const batteryVal = s.battery !== undefined && s.battery !== null ? `${s.battery}%` : 'N/A';

        return `
          <div class="perf-card" onclick="openPartnerProfile('${p._id || p.id}')" style="cursor: pointer; position: relative;">
            <div style="position: absolute; top: 15px; right: 15px;">
              <span class="badge ${onlineClass}">${onlineDot} ${onlineText}</span>
            </div>
            <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px;">
              <img src="${photo}" alt="Profile" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border);" />
              <div>
                <span class="perf-name" style="display: block; font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${escapeHtml(p.name)}</span>
                <span class="perf-emp" style="font-size: 0.75rem; color: var(--primary); font-weight: 600;">${escapeHtml(p.employeeId)}</span>
              </div>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">📞 Phone: ${escapeHtml(p.phone)}</div>
            
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 10px; line-height: 1.4; background: rgba(0,0,0,0.1); padding: 8px; border-radius: 6px;">
              <div>🕒 Last Seen: <strong style="color: var(--text-main);">${escapeHtml(lastSeen)}</strong></div>
              <div>🧭 GPS Time: <strong style="color: var(--text-main);">${escapeHtml(gpsTime)}</strong></div>
              <div>🔋 Battery: <strong style="color: var(--text-main);">${escapeHtml(batteryVal)}</strong></div>
              <div>📦 Active Pickups: <strong style="color: var(--primary);">${pendingCount}</strong></div>
            </div>

            <div class="perf-stats-grid" style="border-top: 1px solid var(--border); padding-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem;">
              <div class="perf-stat-item">
                <span class="perf-stat-label" style="font-size: 0.7rem; color: var(--text-muted);">Today's Pickups</span>
                <span class="perf-stat-val" style="color: var(--amber); font-weight: 700;">${s.todayPickups}</span>
              </div>
              <div class="perf-stat-item">
                <span class="perf-stat-label" style="font-size: 0.7rem; color: var(--text-muted);">Completed Pickups</span>
                <span class="perf-stat-val" style="color: var(--green); font-weight: 700;">${s.completedPickups}</span>
              </div>
              <div class="perf-stat-item">
                <span class="perf-stat-label" style="font-size: 0.7rem; color: var(--text-muted);">Pending</span>
                <span class="perf-stat-val" style="font-weight: 700;">${pendingCount}</span>
              </div>
              <div class="perf-stat-item">
                <span class="perf-stat-label" style="font-size: 0.7rem; color: var(--text-muted);">Cancelled</span>
                <span class="perf-stat-val" style="color: var(--accent); font-weight: 700;">${cancelledCount}</span>
              </div>
              <div class="perf-stat-item" style="grid-column: span 2; border-top: 1px dashed var(--border); padding-top: 8px; margin-top: 4px; display: flex; justify-content: space-between;">
                <span class="perf-stat-label" style="font-size: 0.7rem; color: var(--text-muted);">Collected Devices</span>
                <span class="perf-stat-val" style="color: var(--purple); font-weight: 700;">${s.totalDevicesCollected}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      grid.innerHTML = `<div style="padding: 40px; text-align: center; grid-column: 1/-1; color: var(--red);">Error loading analytics: ${escapeHtml(err.message)}</div>`;
    } finally {
      isPerformanceLoading = false;
    }
  }

  // --- PARTNER PROFILE MODAL VIEWS ---
  window.openPartnerProfile = async (id) => {
    try {
      const data = await apiFetch(`/operations/admin/partners/${id}/profile`);
      const p = data.partner;
      const stats = data.statistics;

      // Track active profile partner ID
      window.activeProfilePartnerId = p._id || p.id;

      // Update fields
      if ($('#partner-profile-photo')) $('#partner-profile-photo').src = p.profilePhoto || '/uploads/default-avatar.png';
      if ($('#partner-profile-name')) $('#partner-profile-name').textContent = p.name;
      if ($('#partner-profile-id')) $('#partner-profile-id').textContent = p.employeeId;
      if ($('#partner-profile-phone')) $('#partner-profile-phone').textContent = p.phone;
      if ($('#partner-profile-email')) $('#partner-profile-email').textContent = p.email || 'N/A';
      if ($('#partner-profile-zone')) $('#partner-profile-zone').textContent = p.assignedZone || 'General';
      if ($('#partner-profile-vehicle')) $('#partner-profile-vehicle').textContent = p.vehicleDetails || 'Motorcycle';
      if ($('#partner-profile-joining')) $('#partner-profile-joining').textContent = new Date(p.joiningDate || p.createdAt).toLocaleDateString();
      if ($('#partner-profile-last-active')) $('#partner-profile-last-active').textContent = new Date(p.lastActive || p.updatedAt).toLocaleString();

      // Current pickup & today's count
      if ($('#partner-profile-current-pickup')) {
        const currentText = data.currentPickup ? `${data.currentPickup.orderId} (${data.currentPickup.status})` : 'None (Available)';
        $('#partner-profile-current-pickup').textContent = currentText;
      }
      if ($('#partner-profile-today-completed')) $('#partner-profile-today-completed').textContent = stats.completedTodayCount || 0;
      if ($('#partner-profile-today-online')) $('#partner-profile-today-online').textContent = `${stats.timeOnlineMins || 0} mins`;
      if ($('#partner-profile-today-distance')) $('#partner-profile-today-distance').textContent = `${(stats.todayDistanceKm || 0).toFixed(2)} km`;
      if ($('#partner-profile-today-destination')) $('#partner-profile-today-destination').textContent = stats.currentDestination || 'None';
      if ($('#partner-profile-today-eta')) $('#partner-profile-today-eta').textContent = stats.eta || 'N/A';

      // Live Telemetry GPS fields
      if ($('#partner-profile-speed')) $('#partner-profile-speed').textContent = stats.speed !== null && stats.speed !== undefined ? `${Number(stats.speed).toFixed(1)} m/s` : '—';
      if ($('#partner-profile-accuracy')) $('#partner-profile-accuracy').textContent = stats.accuracy !== null && stats.accuracy !== undefined ? `${Number(stats.accuracy).toFixed(1)}m` : '—';
      if ($('#partner-profile-heading')) $('#partner-profile-heading').textContent = stats.heading !== null && stats.heading !== undefined ? `${stats.heading}°` : '—';
      if ($('#partner-profile-battery')) $('#partner-profile-battery').textContent = stats.battery !== null && stats.battery !== undefined ? `${stats.battery}%` : '—';
      if ($('#partner-profile-coords')) $('#partner-profile-coords').textContent = (stats.latitude && stats.longitude) ? `${stats.latitude.toFixed(6)}, ${stats.longitude.toFixed(6)}` : '—';
      if ($('#partner-profile-address')) $('#partner-profile-address').textContent = stats.address || 'Locating current address...';

      const onlineBadge = $('#partner-profile-online-badge');
      if (onlineBadge) {
        onlineBadge.className = `badge ${p.online ? 'success' : 'secondary'}`;
        onlineBadge.textContent = p.online ? 'Online' : 'Offline';
      }

      // Live GPS Health badge in profile
      const gpsTimestamp = stats.gpsTimestamp;
      const diffSecProfile = gpsTimestamp ? Math.floor((Date.now() - new Date(gpsTimestamp).getTime()) / 1000) : 9999;
      let gpsHealthText = 'GPS Dead';
      let gpsHealthClass = 'danger';
      if (diffSecProfile <= 30) {
        gpsHealthText = 'GPS Healthy';
        gpsHealthClass = 'success';
      } else if (diffSecProfile <= 120) {
        gpsHealthText = 'GPS Delayed';
        gpsHealthClass = 'warning';
      } else {
        gpsHealthText = 'GPS Dead';
        gpsHealthClass = 'danger';
      }
      const profileGpsBadge = $('#partner-profile-gps-health-badge');
      if (profileGpsBadge) {
        profileGpsBadge.className = `badge ${gpsHealthClass}`;
        profileGpsBadge.textContent = gpsHealthText;
        profileGpsBadge.style.display = 'inline-block';
      }

      // Statistics values
      if ($('#p-stat-assigned')) $('#p-stat-assigned').textContent = stats.totalOrdersAssigned;
      if ($('#p-stat-completed')) $('#p-stat-completed').textContent = stats.totalOrdersCompleted;
      if ($('#p-stat-pending')) $('#p-stat-pending').textContent = stats.totalPendingOrders;
      if ($('#p-stat-cancelled')) $('#p-stat-cancelled').textContent = stats.totalCancelledOrders;
      if ($('#p-stat-completion-rate')) $('#p-stat-completion-rate').textContent = `${stats.completionRate}%`;
      if ($('#p-stat-avg-duration')) $('#p-stat-avg-duration').textContent = `${stats.averagePickupTime}m`;
      if ($('#p-stat-value')) $('#p-stat-value').textContent = `₹${stats.totalEstimatedCollectionValue.toLocaleString()}`;

      // Initialize or reload Leaflet Map on #partner-profile-map
      setTimeout(() => {
        if (!partnerProfileMap) {
          partnerProfileMap = L.map('partner-profile-map').setView([12.9716, 77.5946], 13);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          }).addTo(partnerProfileMap);
        } else {
          partnerProfileMap.invalidateSize();
        }

        // Clear previous layer markers & lines
        if (partnerProfilePolyline) {
          partnerProfileMap.removeLayer(partnerProfilePolyline);
          partnerProfilePolyline = null;
        }
        if (partnerProfileMarker) {
          partnerProfileMap.removeLayer(partnerProfileMarker);
          partnerProfileMarker = null;
        }

        const routeCoords = stats.route || [];
        if (routeCoords.length > 0) {
          // Draw route travelled today
          partnerProfilePolyline = L.polyline(routeCoords, { color: '#3b82f6', weight: 4, opacity: 0.8 }).addTo(partnerProfileMap);
          
          // Draw partner's current position marker
          const lastCoord = routeCoords[routeCoords.length - 1];
          partnerProfileMarker = L.marker(lastCoord)
            .bindPopup(`<strong>${escapeHtml(p.name)}</strong><br>Last seen: ${new Date(stats.lastActive || Date.now()).toLocaleTimeString()}`)
            .addTo(partnerProfileMap);

          partnerProfileMap.setView(lastCoord, 14);
        } else {
          partnerProfileMap.setView([12.9716, 77.5946], 12);
        }
      }, 200);

      // History Table
      const listContainer = $('#partner-profile-orders-list');
      if (listContainer) {
        if (data.history && data.history.length > 0) {
          listContainer.innerHTML = data.history.map(h => `
            <tr onclick="openAdminOrderDetail('${h._id}')" style="border-bottom: 1px solid rgba(255,255,255,0.03); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
              <td style="padding: 10px; font-weight: 600; color: var(--primary);">${h.orderId}</td>
              <td style="padding: 10px;">${escapeHtml(h.customerName)}</td>
              <td style="padding: 10px; text-align: center;">${h.deviceCount}</td>
              <td style="padding: 10px; color: var(--success); font-weight: 600;">₹${h.estimatedValue.toLocaleString()}</td>
              <td style="padding: 10px;"><span class="badge ${h.status === 'completed' ? 'success' : h.status === 'cancelled' ? 'danger' : 'warning'}">${h.status}</span></td>
              <td style="padding: 10px; font-size: 0.75rem; color: var(--text-muted);">${new Date(h.assignedDate).toLocaleDateString()}</td>
            </tr>
          `).join('');
        } else {
          listContainer.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: var(--text-muted);">No orders assigned to this partner.</td></tr>';
        }
      }

      // Recent Activity Timeline
      const timelineContainer = $('#partner-profile-timeline');
      if (timelineContainer) {
        if (data.timeline && data.timeline.length > 0) {
          timelineContainer.innerHTML = data.timeline.map(t => {
            const dateStr = new Date(t.timestamp).toLocaleString();
            let eventColor = 'var(--text-muted)';
            let eventIcon = '⚪';
            
            if (t.eventName === 'logged_in') { eventColor = 'var(--primary)'; eventIcon = '🔑'; }
            if (t.eventName === 'went_online') { eventColor = 'var(--success)'; eventIcon = '🟢'; }
            if (t.eventName === 'went_offline') { eventColor = 'var(--text-muted)'; eventIcon = '⚪'; }
            if (t.eventName === 'logged_out') { eventColor = 'var(--text-muted)'; eventIcon = '🚪'; }
            if (t.eventName === 'assigned') { eventColor = 'var(--amber)'; eventIcon = '📌'; }
            if (t.eventName === 'navigating') { eventColor = 'var(--primary)'; eventIcon = '🛵'; }
            if (t.eventName === 'arrived') { eventColor = 'var(--success)'; eventIcon = '📍'; }
            if (t.eventName === 'otp_generated') { eventColor = 'var(--purple)'; eventIcon = '🔑'; }
            if (t.eventName === 'picked_up') { eventColor = 'var(--success)'; eventIcon = '📦'; }
            if (t.eventName === 'warehouse_verified') { eventColor = 'var(--success)'; eventIcon = '🏢'; }
            if (t.eventName === 'cancelled') { eventColor = 'var(--accent)'; eventIcon = '❌'; }

            return `
              <div style="display: flex; gap: 10px; border-left: 2px solid ${eventColor}; padding-left: 12px; position: relative; padding-bottom: 6px; text-align: left;">
                <span style="position: absolute; left: -9px; top: 0; background: #0f172a; width: 16px; height: 16px; border-radius: 50%; text-align: center; font-size: 0.65rem; line-height: 16px;">${eventIcon}</span>
                <div>
                  <div style="font-weight: 600; color: var(--text-main); font-size: 0.8rem;">${escapeHtml(t.eventName.toUpperCase().replace('_', ' '))}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${escapeHtml(t.details)}</div>
                  <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 1px;">🕒 ${dateStr}</div>
                </div>
              </div>
            `;
          }).join('');
        } else {
          timelineContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 15px 0;">No activities recorded yet.</div>';
        }
      }

      $('#partner-profile-modal').style.display = 'flex';
    } catch (err) {
      showToast('Failed to load profile details: ' + err.message, 'error');
    }
  };

  window.closePartnerProfileModal = () => {
    $('#partner-profile-modal').style.display = 'none';
    window.activeProfilePartnerId = null;
  };

  // --- ADMIN DETAILED LOGISTICS ORDER DETAIL MODAL ---
  window.openAdminOrderDetail = async (id) => {
    try {
      const data = await apiFetch(`/operations/admin/orders/${id}`);
      const o = data.order;
      const timeline = data.timeline;
      const loc = data.location;

      window.activeOrderDetailOrderId = id;
      window.activeOrderDetailPartnerId = o.partnerId ? (o.partnerId._id || o.partnerId) : null;

      $('#adm-po-id').textContent = o.orderId;
      
      const statusBadge = $('#adm-po-status');
      statusBadge.className = `badge ${o.status === 'completed' ? 'success' : o.status === 'cancelled' ? 'danger' : 'warning'}`;
      statusBadge.textContent = o.status.toUpperCase();

      // Customer Info
      const req = o.requestId || {};
      $('#adm-po-cust-name').textContent = req.sellerName || '—';
      $('#adm-po-cust-phone').textContent = req.phone || '—';
      $('#adm-po-cust-address').textContent = req.address || '—';

      // Partner Info
      const part = o.partnerId || {};
      $('#adm-po-partner-photo').src = part.profilePhoto || '/uploads/default-avatar.png';
      $('#adm-po-partner-name').textContent = part.name || '—';
      $('#adm-po-partner-id').textContent = part.employeeId || '—';

      // Collection Metadata
      if (o.pickedUpAt) {
        $('#adm-po-pickup-time').textContent = new Date(o.pickedUpAt).toLocaleString();
      } else {
        $('#adm-po-pickup-time').textContent = '—';
      }

      if (o.pickupLatitude !== undefined && o.pickupLatitude !== null && o.pickupLongitude !== undefined && o.pickupLongitude !== null) {
        $('#adm-po-pickup-coords').textContent = `${Number(o.pickupLatitude).toFixed(6)}, ${Number(o.pickupLongitude).toFixed(6)}`;
      } else {
        $('#adm-po-pickup-coords').textContent = '—';
      }

      if (o.finalPrice !== undefined && o.finalPrice !== null) {
        $('#adm-po-final-price').textContent = `₹${Number(o.finalPrice).toLocaleString()}`;
      } else {
        $('#adm-po-final-price').textContent = '—';
      }

      $('#adm-po-pickup-remarks').textContent = o.pickupRemarks || '—';

      // OTP verification details
      const otpBadge = $('#adm-po-otp-badge');
      if (otpBadge) {
        if (o.status === 'cancelled') {
          otpBadge.style.display = 'block';
          otpBadge.style.color = 'var(--accent)';
          otpBadge.style.borderColor = 'rgba(244,63,94,0.2)';
          otpBadge.style.background = 'rgba(244,63,94,0.1)';
          otpBadge.textContent = 'CANCELLED';
          $('#adm-po-otp-details').textContent = `Order cancelled. Reason: "${o.cancellationReason || 'No details'}"`;
        } else {
          let otpStatus = o.otpStatus || 'Not Generated';
          if (otpStatus === 'Sent' && o.otpExpiresAt && Date.now() > new Date(o.otpExpiresAt).getTime()) {
            otpStatus = 'Expired';
          }

          otpBadge.style.display = 'block';
          otpBadge.textContent = otpStatus.toUpperCase();

          if (otpStatus === 'Verified') {
            otpBadge.style.color = 'var(--success)';
            otpBadge.style.borderColor = 'rgba(16,185,129,0.2)';
            otpBadge.style.background = 'rgba(16,185,129,0.1)';
            $('#adm-po-otp-details').textContent = `OTP authenticated successfully.`;
          } else if (otpStatus === 'Delivered') {
            otpBadge.style.color = 'var(--success)';
            otpBadge.style.borderColor = 'rgba(16,185,129,0.2)';
            otpBadge.style.background = 'rgba(16,185,129,0.1)';
            $('#adm-po-otp-details').textContent = `OTP delivered to customer’s mobile number. Pending verification.`;
          } else if (otpStatus === 'Expired') {
            otpBadge.style.color = 'var(--accent)';
            otpBadge.style.borderColor = 'rgba(244,63,94,0.2)';
            otpBadge.style.background = 'rgba(244,63,94,0.1)';
            $('#adm-po-otp-details').textContent = `The generated OTP has expired. Please ask the partner to resend.`;
          } else if (otpStatus === 'Failed') {
            otpBadge.style.color = 'var(--accent)';
            otpBadge.style.borderColor = 'rgba(244,63,94,0.2)';
            otpBadge.style.background = 'rgba(244,63,94,0.1)';
            $('#adm-po-otp-details').textContent = `OTP SMS delivery failed.`;
          } else if (otpStatus === 'Sent') {
            otpBadge.style.color = 'var(--warning)';
            otpBadge.style.borderColor = 'rgba(245,158,11,0.2)';
            otpBadge.style.background = 'rgba(245,158,11,0.1)';
            $('#adm-po-otp-details').textContent = `OTP sent to customer’s mobile number. Pending verification.`;
          } else {
            // Not Generated
            otpBadge.style.color = 'var(--text-muted)';
            otpBadge.style.borderColor = 'rgba(255,255,255,0.1)';
            otpBadge.style.background = 'rgba(255,255,255,0.05)';
            $('#adm-po-otp-details').textContent = `OTP code has not been generated for this order yet.`;
          }
        }
      }

      // Registered device card
      $('#adm-po-registered-device').innerHTML = `
        <strong>${req.brand || '—'} ${req.model || '—'}</strong><br/>
        Storage: ${req.storage || '—'} | Original Offer: <strong style="color: var(--success);">${req.price || '—'}</strong>
      `;

      // Extra devices list
      const extraContainer = $('#adm-po-extra-devices');
      if (o.extraDevices && o.extraDevices.length > 0) {
        extraContainer.innerHTML = o.extraDevices.map(ed => `
          <div style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 4px; margin-bottom: 4px;">
            <strong>${escapeHtml(ed.brand)} ${escapeHtml(ed.model)}</strong> (${escapeHtml(ed.storage)})<br/>
            Est. Price: <span style="color: var(--success); font-weight: 600;">₹${ed.estimatedPrice.toLocaleString()}</span>
          </div>
        `).join('');
      } else {
        extraContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem;">No extra devices collected.</div>';
      }

      // Photos uploaded list
      const photosContainer = $('#adm-po-photos-list');
      if (o.extraDevices && o.extraDevices.length > 0) {
        photosContainer.innerHTML = o.extraDevices.map(ed => {
          if (ed.photoUrl) {
            return `
              <a href="${ed.photoUrl}" target="_blank" style="display: block; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); transition: all 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                <img src="${ed.photoUrl}" alt="Device" style="width: 70px; height: 70px; object-fit: cover;" />
              </a>
            `;
          }
          return '';
        }).join('');
        if (photosContainer.innerHTML.trim() === '') {
          photosContainer.innerHTML = '<span style="font-size: 0.85rem; color: var(--text-muted);">No device photos uploaded.</span>';
        }
      } else {
        photosContainer.innerHTML = '<span style="font-size: 0.85rem; color: var(--text-muted);">No photos uploaded for this collection.</span>';
      }

      // Timeline activity logs
      const timelineContainer = $('#adm-po-timeline');
      if (timeline && timeline.length > 0) {
        timelineContainer.innerHTML = timeline.map(t => `
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.02); padding-bottom: 4px;">
            <span>📍 <strong>${t.eventName.toUpperCase()}</strong>: ${escapeHtml(t.details)}</span>
            <span style="color: var(--text-muted); font-size: 0.75rem;">${new Date(t.createdAt).toLocaleString()}</span>
          </div>
        `).join('');
      } else {
        timelineContainer.innerHTML = '<div style="color: var(--text-muted); text-align: center;">No activity timeline logs.</div>';
      }

      // Warehouse Audit Checks
      const whContainer = $('#adm-po-warehouse-details');
      if (o.warehouseVerified) {
        const dateStr = new Date(o.warehouseVerifiedAt).toLocaleString();
        let listHTML = o.warehouseDevices.map(wd => `
          <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.02);">
            <span>📱 ${wd.brand} ${wd.model} (${wd.storage})</span>
            <span class="badge ${wd.status === 'received' ? 'success' : wd.status === 'damaged' ? 'warning' : 'danger'}">${wd.status.toUpperCase()}</span>
          </div>
        `).join('');

        whContainer.innerHTML = `
          <div style="margin-bottom: 10px; font-weight: 600; color: var(--success);">
            Verified on ${dateStr} by Warehouse Staff. Status: <span class="badge ${o.warehouseStatus === 'verified' ? 'success' : 'danger'}">${o.warehouseStatus.toUpperCase()}</span>
          </div>
          <div>${listHTML}</div>
          <div style="margin-top: 8px; font-style: italic; color: var(--text-muted);">Notes: "${o.warehouseNotes || 'None'}"</div>
        `;
      } else {
        whContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem;">Pending warehouse audit submission.</div>';
      }

      // Internal admin notes
      $('#adm-po-notes').textContent = o.notes || 'No remarks added.';

      // Map Route Display
      $('#admin-order-detail-modal').style.display = 'flex';
      
      setTimeout(async () => {
        if (!adminOrderDetailMap) {
          const mapContainer = document.getElementById('admin-order-route-map');
          if (!mapContainer) {
            console.warn('admin-order-route-map container not found');
            return;
          }
          adminOrderDetailMap = L.map('admin-order-route-map').setView([12.9716, 77.5946], 13);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
          }).addTo(adminOrderDetailMap);
        }

        // Clean layers
        if (adminOrderCustMarker) adminOrderDetailMap.removeLayer(adminOrderCustMarker);
        if (adminOrderPartnerMarker) adminOrderDetailMap.removeLayer(adminOrderPartnerMarker);
        if (adminOrderRoutePolyline) adminOrderDetailMap.removeLayer(adminOrderRoutePolyline);

        const adminGeoWarning = $('#admin-geocoding-warning');
        if (adminGeoWarning) adminGeoWarning.classList.add('hidden');

        let custCoords = null;
        if (req.address) {
          custCoords = await geocodeAddress(req.address);
        }

        const mapCoords = [];
        if (custCoords) {
          adminOrderCustMarker = L.marker([custCoords.lat, custCoords.lng])
            .bindPopup(`<strong>Customer Destination</strong><br/>${req.address}`)
            .addTo(adminOrderDetailMap);
          mapCoords.push([custCoords.lat, custCoords.lng]);
        } else if (req.address) {
          if (adminGeoWarning) adminGeoWarning.classList.remove('hidden');
        }

        // Plots partner route history path from GPS telemetry coordinates array
        if (loc && loc.route && loc.route.length > 0) {
          adminOrderRoutePolyline = L.polyline(loc.route, { color: '#6366f1', weight: 4, opacity: 0.7 }).addTo(adminOrderDetailMap);
          
          loc.route.forEach(pt => mapCoords.push(pt));

          // Draw final partner live coordinate marker
          const lastPt = loc.route[loc.route.length - 1];
          adminOrderPartnerMarker = L.marker([lastPt[0], lastPt[1]])
            .bindPopup(`<strong>Partner Current Location</strong>`)
            .addTo(adminOrderDetailMap);
        } else if (loc && loc.latitude && loc.longitude) {
          adminOrderPartnerMarker = L.marker([loc.latitude, loc.longitude])
            .bindPopup(`<strong>Partner Location</strong>`)
            .addTo(adminOrderDetailMap);
          mapCoords.push([loc.latitude, loc.longitude]);
        }

        if (mapCoords.length > 0) {
          if (mapCoords.length === 1) {
            adminOrderDetailMap.setView(mapCoords[0], 14);
          } else {
            const bounds = L.latLngBounds(mapCoords);
            adminOrderDetailMap.fitBounds(bounds, { padding: [40, 40] });
          }
        } else {
          adminOrderDetailMap.setView([12.9716, 77.5946], 13);
        }
      }, 300);

    } catch (err) {
      showToast('Failed to load logistics order details: ' + err.message, 'error');
    }
  };

  window.closeAdminOrderDetailModal = () => {
    $('#admin-order-detail-modal').style.display = 'none';
    window.activeOrderDetailOrderId = null;
    window.activeOrderDetailPartnerId = null;
  };

  /* ─── USER DATA MANAGEMENT ────────────────────────────── */
  let userPage = 1;
  const userLimit = 100;
  let userSearchQuery = '';
  let userFilterVal = 'all';
  let userSearchTimeout = null;

  function initUsersPage() {
    userPage = 1;
    userSearchQuery = '';
    userFilterVal = 'all';
    const searchInput = $('#user-search');
    if (searchInput) searchInput.value = '';
    const filterSelect = $('#user-filter');
    if (filterSelect) filterSelect.value = 'all';
    
    loadUsers();
    loadUsersStats();
  }

  async function loadUsers() {
    try {
      const container = $('#admin-users-list');
      if (container) container.innerHTML = '<tr><td colspan="5" style="padding: 20px; text-align: center; color: var(--text-muted);">Loading users list...</td></tr>';

      const queryParams = new URLSearchParams({
        page: userPage,
        limit: userLimit,
        search: userSearchQuery,
        filter: userFilterVal
      });

      const data = await apiFetch(`/admin/users?${queryParams.toString()}`);
      
      if (!container) return;

      if (!data.users || data.users.length === 0) {
        container.innerHTML = '<tr><td colspan="5" style="padding: 20px; text-align: center; color: var(--text-muted);">No users found matching query.</td></tr>';
        $('#user-count-showing').textContent = '0-0';
        $('#user-count-total').textContent = data.total || 0;
        return;
      }

      container.innerHTML = data.users.map(u => {
        const dateStr = new Date(u.createdAt).toLocaleDateString();
        return `
          <tr onclick="openAdminUserDetail('${u.id}')" style="cursor: pointer; border-bottom: 1px solid var(--border); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
            <td style="padding: 12px 15px; font-weight: 600; color: var(--text-main);">${escapeHtml(u.name)}</td>
            <td style="padding: 12px 15px;">${escapeHtml(u.email)}</td>
            <td style="padding: 12px 15px;">${escapeHtml(u.phone)}</td>
            <td style="padding: 12px 15px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(u.address)}</td>
            <td style="padding: 12px 15px;">${dateStr}</td>
          </tr>
        `;
      }).join('');

      const startIdx = (userPage - 1) * userLimit + 1;
      const endIdx = Math.min(userPage * userLimit, data.total);
      $('#user-count-showing').textContent = `${startIdx}-${endIdx}`;
      $('#user-count-total').textContent = data.total;
      $('#user-page-current').textContent = `Page ${userPage} of ${data.pages || 1}`;

      // Enable/disable page buttons
      const prevBtn = $('#user-page-prev');
      const nextBtn = $('#user-page-next');
      if (prevBtn) prevBtn.disabled = (userPage <= 1);
      if (nextBtn) nextBtn.disabled = (userPage >= data.pages);

    } catch (err) {
      showToast('Error loading users: ' + err.message, 'error');
    }
  }

  async function loadUsersStats() {
    try {
      const stats = await apiFetch('/admin/users/stats');
      $('#user-stat-total').textContent = stats.totalUsers ?? 0;
      $('#user-stat-today').textContent = stats.todayRegistrations ?? 0;
      $('#user-stat-7days').textContent = stats.last7Days ?? 0;
      $('#user-stat-30days').textContent = stats.last30Days ?? 0;
      $('#user-stat-with-requests').textContent = stats.usersWithRequests ?? 0;
      $('#user-stat-without-requests').textContent = stats.usersWithoutRequests ?? 0;
    } catch (err) {
      console.error('Failed to load user stats:', err);
    }
  }

  window.changeUserPage = (delta) => {
    userPage += delta;
    loadUsers();
  };

  window.onUserSearchInput = () => {
    if (userSearchTimeout) clearTimeout(userSearchTimeout);
    userSearchTimeout = setTimeout(() => {
      userSearchQuery = $('#user-search').value.trim();
      userPage = 1;
      loadUsers();
    }, 300);
  };

  window.onUserFilterChange = () => {
    userFilterVal = $('#user-filter').value;
    userPage = 1;
    loadUsers();
  };

  window.openAdminUserDetail = async (userId) => {
    try {
      const data = await apiFetch(`/admin/users/${userId}`);
      const u = data.user;
      
      $('#usr-detail-name').textContent = u.name;
      $('#usr-detail-email').textContent = u.email;
      $('#usr-detail-phone').textContent = u.phone;
      $('#usr-detail-address').textContent = u.address;
      $('#usr-detail-joined').textContent = new Date(u.createdAt).toLocaleString();
      $('#usr-detail-count').textContent = data.numRequests || 0;

      const latestBox = $('#usr-detail-latest-box');
      if (data.latestRequest) {
        const req = data.latestRequest;
        $('#usr-detail-device').textContent = `${req.brand} ${req.model} (${req.storage})`;
        $('#usr-detail-price').textContent = typeof req.price === 'number' ? `₹${req.price.toLocaleString()}` : req.price;
        
        const statusBadge = $('#usr-detail-status');
        statusBadge.className = `badge ${req.status === 'completed' ? 'success' : req.status === 'cancelled' || req.status === 'rejected' ? 'danger' : 'warning'}`;
        statusBadge.textContent = req.status.toUpperCase();
        
        $('#usr-detail-date').textContent = new Date(req.createdAt).toLocaleDateString();
        latestBox.style.display = 'block';
      } else {
        latestBox.style.display = 'none';
      }

      $('#admin-user-detail-modal').style.display = 'flex';
    } catch (err) {
      showToast('Failed to load user profile: ' + err.message, 'error');
    }
  };

  window.closeAdminUserDetailModal = () => {
    $('#admin-user-detail-modal').style.display = 'none';
  };

  window.exportUsers = async (format) => {
    try {
      showToast(`Generating ${format.toUpperCase()} export...`, 'info');
      
      // Fetch all matched results (page/limit omitted, export=true)
      const queryParams = new URLSearchParams({
        search: userSearchQuery,
        filter: userFilterVal,
        export: 'true'
      });
      
      const data = await apiFetch(`/admin/users?${queryParams.toString()}`);
      if (!data.users || data.users.length === 0) {
        showToast('No user data to export.', 'warning');
        return;
      }

      let fileContent = '';
      let mimeType = '';
      let filename = `users_export_${new Date().toISOString().slice(0, 10)}`;

      if (format === 'csv') {
        const headers = ['Full Name', 'Email', 'Phone Number', 'Primary Address', 'Registration Date'];
        const rows = data.users.map(u => [
          u.name,
          u.email,
          u.phone,
          u.address,
          new Date(u.createdAt).toISOString()
        ]);
        
        fileContent = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        mimeType = 'text/csv;charset=utf-8;';
        filename += '.csv';
      } else {
        // Excel tab-separated format (highly compatible with Excel natively)
        const headers = ['Full Name', 'Email', 'Phone Number', 'Primary Address', 'Registration Date'];
        const rows = data.users.map(u => [
          u.name,
          u.email,
          u.phone,
          u.address,
          new Date(u.createdAt).toISOString()
        ]);
        
        fileContent = [
          headers.join('\t'),
          ...rows.map(row => row.map(cell => (cell || '').replace(/\t/g, ' ')).join('\t'))
        ].join('\n');
        
        mimeType = 'application/vnd.ms-excel;charset=utf-8;';
        filename += '.xls';
      }

      const blob = new Blob([fileContent], { type: mimeType });
      const link = document.createElement('a');
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Export downloaded successfully!', 'success');
      }
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  };

  /* ─── INFLUENCER AFFILIATE LOGIC ──────────────────────── */
  let influencerEventsBound = false;
  let clicksChartInstance = null;
  let perfChartInstance = null;
  let activeCommissions = [];
  let drilldownData = [];
  let currentInfluencerId = null;
  let currentDrilldownType = '';

  // Modal helpers — openModal/closeModal are not defined in admin-v2.js scope,
  // so we define them here using the same pattern as partner-profile-modal.
  function openModal(el) {
    if (!el) return;
    el.style.display = 'flex';
    el.style.opacity = '1';
    el.style.pointerEvents = 'auto';
    document.body.style.overflow = 'hidden';
  }
  function closeModal(el) {
    if (!el) return;
    el.style.display = 'none';
    document.body.style.overflow = '';
  }

  function bindInfluencerEvents() {
    if (influencerEventsBound) return;
    
    const addBtn = $('#btn-add-influencer');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        $('#influencer-form').reset();
        $('#influencer-id').value = '';
        $('#influencer-modal-title').textContent = 'Add Influencer Affiliate';
        openModal($('#influencer-modal'));
      });
    }

    const searchInput = $('#influencer-search-input');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(initInfluencersPage, 300);
      });
    }
    
    influencerEventsBound = true;
  }

  async function initInfluencersPage() {
    bindInfluencerEvents();
    const search = ($('#influencer-search-input')?.value || '').trim();
    try {
      const res = await apiFetch(`/influencers?search=${encodeURIComponent(search)}`);
      
      $('#inf-stat-total').textContent = res.summary.total ?? 0;
      $('#inf-stat-active').textContent = res.summary.active ?? 0;
      $('#inf-stat-clicks').textContent = res.summary.clicks ?? 0;
      $('#inf-stat-completed').textContent = res.summary.completed ?? 0;
      $('#inf-stat-pending').textContent = `₹${(res.summary.pendingCommission ?? 0).toLocaleString('en-IN')}`;

      const tbody = $('#influencers-list-body');
      if (res.influencers.length === 0) {
        tbody.innerHTML = '';
        $('#influencers-empty').style.display = 'block';
        return;
      }
      
      $('#influencers-empty').style.display = 'none';
      tbody.innerHTML = res.influencers.map(inf => {
        const link = `https://www.scrapme.in/?ref=${inf.referralCode}`;
        const activeClass = inf.isActive ? 'badge green' : 'badge red';
        const activeText = inf.isActive ? 'Active' : 'Inactive';
        const toggleBtnText = inf.isActive ? 'Deactivate' : 'Activate';
        const toggleBtnStyle = inf.isActive ? 'color: var(--amber);' : 'color: var(--green);';

        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
            <td style="padding: 12px; font-weight:600;">${escapeHtml(inf.name)}</td>
            <td style="padding: 12px; color: var(--accent);">@${escapeHtml(inf.instagramHandle)}</td>
            <td style="padding: 12px; font-family: monospace;">${escapeHtml(inf.referralCode)}</td>
            <td style="padding: 12px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size: 0.8rem; color: var(--text-muted); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width: 150px;">${link}</span>
                <button class="btn btn-outline btn-sm" onclick="copyAffiliateLink('${inf.referralCode}')" style="padding: 4px 8px; font-size: 0.75rem;">Copy</button>
              </div>
            </td>
            <td style="padding: 12px; font-weight:700;">${inf.totalClicks}</td>
            <td style="padding: 12px;">${inf.totalOrders}</td>
            <td style="padding: 12px; color: var(--green); font-weight:700;">${inf.totalCompleted}</td>
            <td style="padding: 12px;">₹${inf.totalRevenue.toLocaleString()}</td>
            <td style="padding: 12px; color: var(--amber); font-weight:700;">₹${inf.totalCommissionPending.toLocaleString()}</td>
            <td style="padding: 12px;"><span class="${activeClass}">${activeText}</span></td>
            <td style="padding: 12px;">
              <div style="display:flex; gap:8px;">
                <button class="btn btn-outline btn-sm" onclick="viewInfluencer('${inf._id}')" style="padding:4px 8px; font-size:0.75rem; color:var(--primary);">View</button>
                <button class="btn btn-outline btn-sm" onclick="editInfluencer('${inf._id}')" style="padding:4px 8px; font-size:0.75rem; color:var(--text);">Edit</button>
                <button class="btn btn-outline btn-sm" onclick="toggleInfluencerStatus('${inf._id}')" style="padding:4px 8px; font-size:0.75rem; ${toggleBtnText === 'Deactivate' ? 'color: var(--amber);' : 'color: var(--green);'}">${toggleBtnText}</button>
                <button class="btn btn-outline btn-sm" onclick="deleteInfluencer('${inf._id}')" style="padding:4px 8px; font-size:0.75rem; color:var(--red);">Delete</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      showToast('Failed to load influencers: ' + err.message, 'error');
    }
  }

  // ─── COMMISSION HISTORY VIEW PAGE ───
  async function initCommissionsPage() {
    try {
      const res = await apiFetch('/influencers/commissions');
      activeCommissions = res;

      // Populate Influencer select options
      const influencerFilter = $('#commission-filter-influencer');
      const uniqueInfluencers = [...new Set(res.map(c => c.influencerName))];
      influencerFilter.innerHTML = '<option value="">All Influencers</option>' + 
        uniqueInfluencers.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');

      renderCommissionsTable();
      
      // Bind event listeners for filtering
      if (!window.commissionsFilterBound) {
        $('#commission-search-input').addEventListener('input', renderCommissionsTable);
        $('#commission-filter-status').addEventListener('change', renderCommissionsTable);
        $('#commission-filter-influencer').addEventListener('change', renderCommissionsTable);
        $('#commission-filter-start').addEventListener('change', renderCommissionsTable);
        $('#commission-filter-end').addEventListener('change', renderCommissionsTable);
        window.commissionsFilterBound = true;
      }
    } catch (err) {
      showToast('Failed to load commissions: ' + err.message, 'error');
    }
  }

  function renderCommissionsTable() {
    const search = $('#commission-search-input').value.toLowerCase().trim();
    const status = $('#commission-filter-status').value;
    const influencer = $('#commission-filter-influencer').value;
    const start = $('#commission-filter-start').value;
    const end = $('#commission-filter-end').value;

    const filtered = activeCommissions.filter(c => {
      // Search check
      const searchMatch = !search || 
        c.customerName?.toLowerCase().includes(search) ||
        c.phone?.includes(search) ||
        c.orderId?.toLowerCase().includes(search) ||
        c._id?.toLowerCase().includes(search);

      // Status check
      const statusMatch = !status || c.commissionStatus === status;

      // Influencer check
      const influencerMatch = !influencer || c.influencerName === influencer;

      // Date range check
      const genDate = new Date(c.generatedOn).toISOString().split('T')[0];
      const startMatch = !start || genDate >= start;
      const endMatch = !end || genDate <= end;

      return searchMatch && statusMatch && influencerMatch && startMatch && endMatch;
    });

    // Update KPI metrics
    let totalAmt = 0;
    let pendingAmt = 0;
    let paidAmt = 0;

    filtered.forEach(c => {
      if (c.status === 'completed') {
        totalAmt += c.commissionAmount;
        if (c.commissionStatus === 'Pending') pendingAmt += c.commissionAmount;
        else if (c.commissionStatus === 'Paid') paidAmt += c.commissionAmount;
      }
    });

    $('#comm-stat-total').textContent = `₹${totalAmt.toLocaleString()}`;
    $('#comm-stat-pending').textContent = `₹${pendingAmt.toLocaleString()}`;
    $('#comm-stat-paid').textContent = `₹${paidAmt.toLocaleString()}`;

    const tbody = $('#commissions-list-body');
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="padding: 25px; text-align: center; color: var(--text-muted);">No referred requests or commissions found.</td></tr>';
      $('#commissions-empty').style.display = 'block';
      return;
    }

    $('#commissions-empty').style.display = 'none';
    tbody.innerHTML = filtered.map(c => {
      const genDate = new Date(c.generatedOn).toLocaleDateString('en-IN');
      const paidDate = c.paidOn ? new Date(c.paidOn).toLocaleDateString('en-IN') : '—';
      const statusClass = c.commissionStatus === 'Paid' ? 'badge green' : 'badge warning';
      const payoutDetails = c.commissionStatus === 'Paid' 
        ? `${escapeHtml(c.paymentMethod)} (${escapeHtml(c.transactionReference)})` 
        : '—';

      let actionHtml = '';
      if (c.status === 'completed') {
        if (c.commissionStatus === 'Pending') {
          actionHtml = `<button class="btn btn-primary btn-sm" onclick="payCommission('${c._id}', ${c.commissionAmount}, '${c.influencerId}', '${escapeHtml(c.influencerName)}')" style="padding: 4px 8px; font-size: 0.7rem;">Mark Paid</button>`;
        } else {
          actionHtml = `<span style="color: var(--green); font-weight:700;">Paid ✅</span>`;
        }
      } else {
        actionHtml = `<span style="color: var(--text-muted); font-size: 0.75rem;">Waiting Completion</span>`;
      }

      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
          <td style="padding: 12px; font-family: monospace; font-size: 0.8rem;">
            <a href="javascript:void(0)" onclick="openDetail('${c._id}')" style="color: var(--primary); font-weight:700;">${c.orderId || c._id.slice(-6)}</a>
          </td>
          <td style="padding: 12px; font-weight:600;">${escapeHtml(c.customerName)}<br><span style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(c.phone)}</span></td>
          <td style="padding: 12px; color: var(--accent); font-weight:600;">${escapeHtml(c.influencerName)}</td>
          <td style="padding: 12px; font-size:0.8rem;">${escapeHtml(c.device)}</td>
          <td style="padding: 12px; font-weight:700;">₹${c.commissionAmount.toLocaleString()}</td>
          <td style="padding: 12px;"><span class="${statusClass}">${c.commissionStatus}</span></td>
          <td style="padding: 12px; font-size:0.8rem;">${genDate}</td>
          <td style="padding: 12px; font-size:0.8rem;">${paidDate}</td>
          <td style="padding: 12px; font-size:0.8rem; max-width: 150px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${payoutDetails}</td>
          <td style="padding: 12px;">${actionHtml}</td>
        </tr>
      `;
    }).join('');
  }

  // Export Commissions to CSV
  window.exportCommissionsCSV = function() {
    if (activeCommissions.length === 0) {
      showToast('No commission data to export', 'error');
      return;
    }
    const headers = ['Order ID', 'Customer Name', 'Phone', 'Influencer', 'Device', 'Commission Amount', 'Status', 'Generated On', 'Paid On', 'Payment Method', 'Transaction Reference'];
    const rows = activeCommissions.map(c => [
      c.orderId,
      c.customerName,
      c.phone,
      c.influencerName,
      c.device,
      c.commissionAmount,
      c.commissionStatus,
      c.generatedOn,
      c.paidOn || '',
      c.paymentMethod || '',
      c.transactionReference || ''
    ]);
    exportToCSV('commissions_export.csv', headers, rows);
    showToast('Commissions CSV exported!', 'success');
  };

  // ─── DRILLDOWN CONTROLLERS ───
  window.triggerDrilldown = function(type) {
    if (!currentInfluencerId) return;
    openDrilldown(currentInfluencerId, type);
  };

  async function openDrilldown(influencerId, type) {
    currentInfluencerId = influencerId;
    currentDrilldownType = type;
    try {
      const res = await apiFetch(`/influencers/${influencerId}`);
      
      $('#drilldown-modal-title').textContent = `${escapeHtml(res.influencer.name)} — ${type} Drill-down`;
      
      if (type === 'Clicks') {
        drilldownData = res.clicks;
      } else {
        drilldownData = res.requests;
      }

      // Populate brand filter options
      const brandFilter = $('#drilldown-filter-brand');
      const uniqueBrands = [...new Set(drilldownData.map(d => d.brand).filter(Boolean))];
      brandFilter.innerHTML = '<option value="">All Brands</option>' + 
        uniqueBrands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');

      // Enable/disable status dropdown
      const statusFilter = $('#drilldown-filter-status');
      if (type === 'Clicks') {
        statusFilter.style.display = 'none';
      } else {
        statusFilter.style.display = 'inline-block';
        statusFilter.value = '';
      }

      renderDrilldownTable();

      // Bind search/filter events
      if (!window.drilldownFilterBound) {
        $('#drilldown-search').addEventListener('input', renderDrilldownTable);
        $('#drilldown-filter-status').addEventListener('change', renderDrilldownTable);
        $('#drilldown-filter-brand').addEventListener('change', renderDrilldownTable);
        $('#drilldown-filter-start').addEventListener('change', renderDrilldownTable);
        $('#drilldown-filter-end').addEventListener('change', renderDrilldownTable);
        
        $('#drilldown-export-btn').addEventListener('click', () => {
          exportDrilldownCSV();
        });
        window.drilldownFilterBound = true;
      }

      openModal($('#influencer-drilldown-modal'));
    } catch (err) {
      showToast('Drilldown failed: ' + err.message, 'error');
    }
  }

  window.closeInfluencerDrilldownModal = function() {
    closeModal($('#influencer-drilldown-modal'));
  };

  function renderDrilldownTable() {
    const search = $('#drilldown-search').value.toLowerCase().trim();
    const status = $('#drilldown-filter-status').value;
    const brand = $('#drilldown-filter-brand').value;
    const start = $('#drilldown-filter-start').value;
    const end = $('#drilldown-filter-end').value;

    const filtered = drilldownData.filter(d => {
      // Date selector parsing
      const itemDate = new Date(d.createdAt).toISOString().split('T')[0];
      const startMatch = !start || itemDate >= start;
      const endMatch = !end || itemDate <= end;
      
      // Brand filter check
      const brandMatch = !brand || d.brand === brand;

      if (currentDrilldownType === 'Clicks') {
        const searchMatch = !search || 
          d.ip?.includes(search) || 
          d.browser?.toLowerCase().includes(search) || 
          d.os?.toLowerCase().includes(search) || 
          d.city?.toLowerCase().includes(search) ||
          d.referralCode?.toLowerCase().includes(search);

        return searchMatch && startMatch && brandMatch;
      } else {
        // Request metrics checks
        const searchMatch = !search ||
          d.sellerName?.toLowerCase().includes(search) ||
          d.phone?.includes(search) ||
          d.orderId?.toLowerCase().includes(search) ||
          d._id?.toLowerCase().includes(search);

        const statusMatch = !status || d.status === status;

        // Metric-specific subsets
        if (currentDrilldownType === 'Completed') {
          if (d.status !== 'completed') return false;
        } else if (currentDrilldownType === 'Revenue') {
          if (d.status !== 'completed') return false;
        } else if (currentDrilldownType === 'Pending') {
          if (d.status !== 'completed' || d.commissionStatus !== 'Pending') return false;
        } else if (currentDrilldownType === 'Paid') {
          if (d.status !== 'completed' || d.commissionStatus !== 'Paid') return false;
        }

        return searchMatch && statusMatch && brandMatch && startMatch;
      }
    });

    const thead = $('#drilldown-table-head');
    const tbody = $('#drilldown-table-body');

    if (currentDrilldownType === 'Clicks') {
      thead.innerHTML = `
        <tr>
          <th>Date</th>
          <th>Time</th>
          <th>Referral Code</th>
          <th>IP Address</th>
          <th>Device</th>
          <th>Browser</th>
          <th>OS</th>
          <th>Location</th>
          <th>Landing Page</th>
          <th>Duplicate?</th>
        </tr>
      `;
      tbody.innerHTML = filtered.map(c => {
        const dateObj = new Date(c.createdAt);
        const dateStr = dateObj.toLocaleDateString('en-IN');
        const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const dupBadge = c.isDuplicate ? '<span class="badge red">Yes</span>' : '<span class="badge green">No</span>';

        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
            <td style="padding: 8px;">${dateStr}</td>
            <td style="padding: 8px;">${timeStr}</td>
            <td style="padding: 8px; font-family: monospace;">${escapeHtml(c.referralCode)}</td>
            <td style="padding: 8px; font-family: monospace; font-size: 0.8rem;">${escapeHtml(c.ip)}</td>
            <td style="padding: 8px;">${escapeHtml(c.deviceType)}</td>
            <td style="padding: 8px;">${escapeHtml(c.browser)}</td>
            <td style="padding: 8px;">${escapeHtml(c.os)}</td>
            <td style="padding: 8px;">📍 ${escapeHtml(c.city)}, ${escapeHtml(c.country)}</td>
            <td style="padding: 8px; max-width: 150px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(c.landingPage)}</td>
            <td style="padding: 8px;">${dupBadge}</td>
          </tr>
        `;
      }).join('');
    } else if (currentDrilldownType === 'Requests') {
      thead.innerHTML = `
        <tr>
          <th>Request ID</th>
          <th>Customer</th>
          <th>Contact</th>
          <th>Device Details</th>
          <th>Quoted Price</th>
          <th>Final Price</th>
          <th>Partner</th>
          <th>Status</th>
          <th>Date</th>
          <th>Actions</th>
        </tr>
      `;
      tbody.innerHTML = filtered.map(r => {
        const dateStr = new Date(r.createdAt).toLocaleDateString('en-IN');
        const statusClass = r.status === 'completed' ? 'badge green' : 'badge warning';
        const partnerName = r.partner || '—';
        const finalPrice = r.finalPrice ? `₹${r.finalPrice.toLocaleString()}` : '—';
        const quotedPrice = r.priceNum ? `₹${r.priceNum.toLocaleString()}` : '—';

        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
            <td style="padding: 8px; font-family: monospace; font-size: 0.8rem; font-weight:700;">
              <a href="javascript:void(0)" onclick="openDetail('${r._id}')" style="color:var(--primary);">${r.orderId || r._id.slice(-6)}</a>
            </td>
            <td style="padding: 8px; font-weight:600;">${escapeHtml(r.sellerName)}</td>
            <td style="padding: 8px; font-size:0.75rem;">${escapeHtml(r.phone)}<br><span style="color:var(--text-muted);">${escapeHtml(r.email || r.userEmail || '—')}</span></td>
            <td style="padding: 8px; font-size: 0.8rem;">${escapeHtml(r.brand)} ${escapeHtml(r.model)} (${escapeHtml(r.storage)})</td>
            <td style="padding: 8px; font-weight:700;">${quotedPrice}</td>
            <td style="padding: 8px; font-weight:700; color:var(--green);">${finalPrice}</td>
            <td style="padding: 8px;">${escapeHtml(partnerName)}</td>
            <td style="padding: 8px;"><span class="${statusClass}">${r.status}</span></td>
            <td style="padding: 8px; font-size:0.8rem;">${dateStr}</td>
            <td style="padding: 8px;">
              <button class="btn btn-outline btn-sm" onclick="openDetail('${r._id}')" style="padding:2px 6px; font-size:0.7rem;">Open Request</button>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      // Completed, Revenue, Pending, Paid types
      thead.innerHTML = `
        <tr>
          <th>Order ID</th>
          <th>Customer</th>
          <th>Device</th>
          <th>Final Price Paid</th>
          <th>Net Profit (20%)</th>
          <th>Commission %</th>
          <th>Commission Amount</th>
          <th>Status</th>
          <th>Completed Date</th>
          <th>Actions</th>
        </tr>
      `;
      tbody.innerHTML = filtered.map(r => {
        const dateStr = r.completedAt ? new Date(r.completedAt).toLocaleDateString('en-IN') : '—';
        const finalPrice = r.finalPrice || r.priceNum || 0;
        const profit = Math.round(finalPrice * 0.2);
        const commissionPct = r.commissionPercent || 10;
        const commAmt = r.commissionAmount || 0;
        const statusClass = r.commissionStatus === 'Paid' ? 'badge green' : 'badge warning';
        
        let actionHtml = '';
        if (r.commissionStatus === 'Pending') {
          actionHtml = `<button class="btn btn-primary btn-sm" onclick="payCommission('${r._id}', ${commAmt}, '${r.influencerId}', '${escapeHtml(r.sellerName)}')" style="padding:2px 6px; font-size:0.7rem;">Mark Paid</button>`;
        } else {
          actionHtml = `<span style="color:var(--green); font-weight:700;">Paid ✅</span>`;
        }

        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
            <td style="padding: 8px; font-family: monospace; font-size: 0.8rem; font-weight:700;">
              <a href="javascript:void(0)" onclick="openDetail('${r._id}')" style="color:var(--primary);">${r.orderId || r._id.slice(-6)}</a>
            </td>
            <td style="padding: 8px; font-weight:600;">${escapeHtml(r.sellerName)}</td>
            <td style="padding: 8px; font-size: 0.8rem;">${escapeHtml(r.brand)} ${escapeHtml(r.model)} (${escapeHtml(r.storage)})</td>
            <td style="padding: 8px; font-weight:700;">₹${finalPrice.toLocaleString()}</td>
            <td style="padding: 8px; color:var(--accent);">₹${profit.toLocaleString()}</td>
            <td style="padding: 8px;">${commissionPct}%</td>
            <td style="padding: 8px; color:var(--amber); font-weight:700;">₹${commAmt.toLocaleString()}</td>
            <td style="padding: 8px;"><span class="${statusClass}">${r.commissionStatus}</span></td>
            <td style="padding: 8px; font-size:0.8rem;">${dateStr}</td>
            <td style="padding: 8px;">
              <div style="display:flex; gap:4px;">
                <button class="btn btn-outline btn-sm" onclick="openDetail('${r._id}')" style="padding:2px 6px; font-size:0.7rem;">View</button>
                ${actionHtml}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  function exportDrilldownCSV() {
    if (drilldownData.length === 0) {
      showToast('No data to export', 'error');
      return;
    }
    
    if (currentDrilldownType === 'Clicks') {
      const headers = ['Date', 'Time', 'Referral Code', 'IP Address', 'Device Type', 'Browser', 'OS', 'Location', 'Landing Page', 'Duplicate Click'];
      const rows = drilldownData.map(c => [
        new Date(c.createdAt).toLocaleDateString('en-IN'),
        new Date(c.createdAt).toLocaleTimeString('en-IN'),
        c.referralCode,
        c.ip,
        c.deviceType,
        c.browser,
        c.os,
        `${c.city}, ${c.country}`,
        c.landingPage,
        c.isDuplicate ? 'Yes' : 'No'
      ]);
      exportToCSV('affiliate_clicks_export.csv', headers, rows);
    } else {
      const headers = ['Order ID', 'Customer Name', 'Phone', 'Email', 'Device', 'Final Price Paid', 'Net Profit', 'Commission Amount', 'Status', 'Booking Date', 'Completed Date', 'Partner'];
      const rows = drilldownData.map(r => [
        r.orderId || r._id,
        r.sellerName,
        r.phone,
        r.email || r.userEmail,
        `${r.brand} ${r.model} (${r.storage})`,
        r.finalPrice || r.priceNum || 0,
        Math.round((r.finalPrice || r.priceNum || 0) * 0.2),
        r.commissionAmount || 0,
        r.status,
        new Date(r.createdAt).toLocaleDateString('en-IN'),
        r.completedAt ? new Date(r.completedAt).toLocaleDateString('en-IN') : '',
        r.partner || ''
      ]);
      exportToCSV('affiliate_orders_export.csv', headers, rows);
    }
    showToast('CSV export downloaded!', 'success');
  }

  function exportToCSV(filename, headers, rows) {
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ─── COPYS & GENERATORS ───
  window.copyAffiliateLink = function(code) {
    const link = `https://www.scrapme.in/?ref=${code}`;
    navigator.clipboard.writeText(link)
      .then(() => showToast('Affiliate link copied to clipboard! 📋', 'success'))
      .catch(err => showToast('Failed to copy link: ' + err.message, 'error'));
  };

  window.generateReferralCode = function() {
    const nameVal = $('#inf-name').value;
    if (!nameVal) {
      showToast('Please enter a name first to generate a code', 'error');
      return;
    }
    const clean = nameVal.toLowerCase().replace(/[^a-z0-9]/g, '');
    const rand = Math.floor(100 + Math.random() * 900);
    $('#inf-code').value = `${clean}${rand}`;
  };

  window.closeInfluencerModal = function() {
    closeModal($('#influencer-modal'));
  };

  window.closeInfluencerDetailModal = function() {
    closeModal($('#influencer-detail-modal'));
  };

  window.saveInfluencer = async function(event) {
    event.preventDefault();
    const id = $('#influencer-id').value;
    const payload = {
      name: $('#inf-name').value,
      instagramHandle: $('#inf-instagram').value,
      phone: $('#inf-phone').value,
      email: $('#inf-email').value,
      upiId: $('#inf-upi').value,
      commissionPercent: $('#inf-commission').value,
      referralCode: $('#inf-code').value
    };

    try {
      if (id) {
        await apiFetch(`/influencers/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast('Influencer updated successfully!', 'success');
      } else {
        await apiFetch('/influencers', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast('Influencer created successfully!', 'success');
      }
      closeInfluencerModal();
      initInfluencersPage();
    } catch (err) {
      showToast(err.message || 'Failed to save influencer', 'error');
    }
  };

  window.editInfluencer = async function(id) {
    try {
      const res = await apiFetch(`/influencers/${id}`);
      const inf = res.influencer;
      
      $('#influencer-id').value = inf._id;
      $('#inf-name').value = inf.name;
      $('#inf-instagram').value = inf.instagramHandle;
      $('#inf-phone').value = inf.phone;
      $('#inf-email').value = inf.email;
      $('#inf-upi').value = inf.upiId;
      $('#inf-commission').value = inf.commissionPercent;
      $('#inf-code').value = inf.referralCode;
      
      $('#influencer-modal-title').textContent = 'Edit Influencer Affiliate';
      openModal($('#influencer-modal'));
    } catch (err) {
      showToast('Failed to load influencer details: ' + err.message, 'error');
    }
  };

  window.toggleInfluencerStatus = async function(id) {
    try {
      await apiFetch(`/influencers/${id}/toggle`, { method: 'POST' });
      showToast('Influencer status updated successfully!', 'success');
      initInfluencersPage();
    } catch (err) {
      showToast('Failed to toggle status: ' + err.message, 'error');
    }
  };

  window.deleteInfluencer = async function(id) {
    if (!confirm('Are you sure you want to delete this influencer? This will remove their clicks and reference on bookings.')) return;
    try {
      await apiFetch(`/influencers/${id}`, { method: 'DELETE' });
      showToast('Influencer deleted successfully!', 'success');
      initInfluencersPage();
    } catch (err) {
      showToast('Deletion failed: ' + err.message, 'error');
    }
  };

  window.viewInfluencer = async function(id) {
    currentInfluencerId = id;
    try {
      const res = await apiFetch(`/influencers/${id}`);
      const inf = res.influencer;
      
      $('#det-inf-name').textContent = inf.name;
      $('#det-inf-instagram').textContent = `@${inf.instagramHandle}`;
      $('#det-inf-phone').textContent = inf.phone || '—';
      $('#det-inf-email').textContent = inf.email || '—';
      $('#det-inf-upi').textContent = inf.upiId || '—';
      $('#det-inf-rate').textContent = `${inf.commissionPercent}%`;
      $('#det-inf-code').textContent = inf.referralCode;

      const affLink = `https://www.scrapme.in/?ref=${inf.referralCode}`;
      $('#det-aff-link').textContent = affLink;
      $('#det-qr-code').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(affLink)}`;
      
      const badge = $('#det-inf-badge');
      badge.textContent = inf.isActive ? 'Active' : 'Inactive';
      badge.className = inf.isActive ? 'badge green' : 'badge red';

      $('#det-stat-clicks').textContent = inf.totalClicks.toLocaleString();
      $('#det-stat-requests').textContent = inf.totalOrders.toLocaleString();
      $('#det-stat-completed').textContent = inf.totalCompleted.toLocaleString();
      $('#det-stat-revenue').textContent = `₹${inf.totalRevenue.toLocaleString()}`;
      $('#det-stat-profit').textContent = `₹${inf.totalNetProfit.toLocaleString()}`;
      $('#det-stat-pending').textContent = `₹${inf.totalCommissionPending.toLocaleString()}`;
      $('#det-stat-paid').textContent = `₹${inf.totalCommissionPaid.toLocaleString()}`;

      // Referrals table
      const referralsBody = $('#det-referrals-list');
      if (res.requests.length === 0) {
        referralsBody.innerHTML = '<tr><td colspan="7" style="padding: 15px; text-align: center; color: var(--text-muted);">No referral bookings recorded.</td></tr>';
      } else {
        referralsBody.innerHTML = res.requests.map(req => {
          let commissionText = '—';
          let actionHtml = '';
          
          if (req.status === 'completed') {
            commissionText = `₹${(req.commissionAmount ?? 0).toLocaleString()}`;
            if (req.commissionStatus === 'Pending') {
              actionHtml = `<button class="btn btn-primary btn-sm" onclick="payCommission('${req._id}', ${req.commissionAmount}, '${inf._id}', '${escapeHtml(inf.name)}')" style="padding: 2px 6px; font-size: 0.7rem;">Mark Paid</button>`;
            } else if (req.commissionStatus === 'Paid') {
              actionHtml = `<span style="color: var(--green); font-size: 0.75rem; font-weight: 700;">Paid ✅</span>`;
            }
          } else {
            commissionText = `₹${(req.commissionAmount ?? 0).toLocaleString()} (est.)`;
            actionHtml = `<span style="color: var(--text-muted); font-size: 0.75rem;">Waiting Completion</span>`;
          }

          const deviceDetails = `${req.brand} ${req.model} (${req.storage})`;
          const requestDate = new Date(req.createdAt).toLocaleDateString('en-IN');
          const statusClass = req.status === 'completed' ? 'badge green' : 'badge warning';

          return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
              <td style="padding: 8px;">
                <a href="javascript:void(0)" onclick="openDetail('${req._id}')" style="color:var(--primary); font-weight:600;">${escapeHtml(req.sellerName || '—')}</a>
              </td>
              <td style="padding: 8px; font-size: 0.8rem;">${escapeHtml(req.phone || '—')}</td>
              <td style="padding: 8px; font-size: 0.8rem;">${escapeHtml(deviceDetails)}</td>
              <td style="padding: 8px; font-size: 0.8rem;">${requestDate}</td>
              <td style="padding: 8px;"><span class="${statusClass}">${req.status}</span></td>
              <td style="padding: 8px; font-weight: 700;">${commissionText}</td>
              <td style="padding: 8px;">${actionHtml}</td>
            </tr>
          `;
        }).join('');
      }

      openModal($('#influencer-detail-modal'));

      // Render Chart.js charts
      setTimeout(() => {
        renderInfluencerCharts(res);
      }, 100);
    } catch (err) {
      showToast('Failed to load influencer details: ' + err.message, 'error');
    }
  };

  window.copyDetailAffiliateLink = function() {
    const link = $('#det-aff-link').textContent;
    navigator.clipboard.writeText(link)
      .then(() => showToast('Affiliate link copied!', 'success'))
      .catch(err => showToast('Copy failed: ' + err.message, 'error'));
  };

  function renderInfluencerCharts(res) {
    // 1. Clicks Chart
    const clicksCtx = document.getElementById('clicks-chart-canvas').getContext('2d');
    if (clicksChartInstance) clicksChartInstance.destroy();

    const clicksLabels = (res.charts.clicksOverTime || []).map(c => c._id.slice(5));
    const clicksValues = (res.charts.clicksOverTime || []).map(c => c.clicks);

    clicksChartInstance = new Chart(clicksCtx, {
      type: 'line',
      data: {
        labels: clicksLabels.length > 0 ? clicksLabels : ['No clicks'],
        datasets: [{
          label: 'Clicks per Day',
          data: clicksValues.length > 0 ? clicksValues : [0],
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
        }
      }
    });

    // 2. Monthly Performance Chart
    const perfCtx = document.getElementById('performance-chart-canvas').getContext('2d');
    if (perfChartInstance) perfChartInstance.destroy();

    const monthlyLabels = (res.charts.monthlyStats || []).map(m => m._id);
    const revValues = (res.charts.monthlyStats || []).map(m => m.revenue);
    const profitValues = (res.charts.monthlyStats || []).map(m => Math.round(m.revenue * 0.2));
    const commValues = (res.charts.monthlyStats || []).map(m => m.commission);

    perfChartInstance = new Chart(perfCtx, {
      type: 'bar',
      data: {
        labels: monthlyLabels.length > 0 ? monthlyLabels : ['No revenue'],
        datasets: [
          {
            label: 'Revenue (₹)',
            data: revValues.length > 0 ? revValues : [0],
            backgroundColor: '#8b5cf6'
          },
          {
            label: 'Profit (₹)',
            data: profitValues.length > 0 ? profitValues : [0],
            backgroundColor: '#10b981'
          },
          {
            label: 'Commission (₹)',
            data: commValues.length > 0 ? commValues : [0],
            backgroundColor: '#f59e0b'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
        }
      }
    });
  }

  window.payCommission = function(requestId, amount, influencerId, influencerName) {
    $('#pay-comm-request-id').value = requestId;
    $('#pay-comm-influencer-id').value = influencerId;
    $('#pay-comm-influencer-name').textContent = influencerName || 'Influencer';
    $('#pay-comm-amount').textContent = `₹${amount.toLocaleString()}`;
    $('#pay-comm-method').value = 'UPI';
    $('#pay-comm-ref').value = '';
    openModal($('#pay-commission-modal'));
  };

  window.closePayCommissionModal = function() {
    closeModal($('#pay-commission-modal'));
  };

  window.submitPayCommission = async function(event) {
    event.preventDefault();
    const requestId = $('#pay-comm-request-id').value;
    const influencerId = $('#pay-comm-influencer-id').value;
    const paymentMethod = $('#pay-comm-method').value;
    const transactionReference = $('#pay-comm-ref').value;

    try {
      await apiFetch('/influencers/pay-commission', {
        method: 'POST',
        body: JSON.stringify({
          requestId,
          paymentMethod,
          transactionReference
        })
      });
      showToast('Commission payout recorded successfully!', 'success');
      closePayCommissionModal();
      
      // Refresh active dashboards/views
      if ($('#influencer-detail-modal').style.display === 'flex' || $('#influencer-detail-modal').classList.contains('open')) {
        viewInfluencer(influencerId);
      }
      if ($('#page-commissions').classList.contains('active')) {
        initCommissionsPage();
      }
      initInfluencersPage();
    } catch (err) {
      showToast('Payout recording failed: ' + err.message, 'error');
    }
  };


  /* ─── INIT ────────────────────────────────────────────── */
  (function init() {
    const token = localStorage.getItem('dp_admin_token');
    if (token) {
      apiFetch('/admin/stats').then(() => {
        showAdminPanel();
      }).catch(() => {
        localStorage.removeItem('dp_admin_token');
        loginScreen.classList.remove('hidden');
      });
    }
  })();

  // Auto-refresh stats every 60s (not requests, to avoid disrupting user)
  setInterval(() => {
    if (localStorage.getItem('dp_admin_token')) refreshStats();
  }, 60000);
})();
