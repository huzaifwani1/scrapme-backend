/* ========== SCRAPME OPERATIONS JS ========== */
(() => {
  'use strict';

  const LAN_IP = '192.168.29.74';
  const CANDIDATE_BASES = window.Capacitor ? [
    localStorage.getItem('API_BASE_OVERRIDE'),
    `http://${LAN_IP}:3001/api/operations`,
    'http://10.0.2.2:3001/api/operations',
    'http://localhost:3001/api/operations',
    'https://scrapme-backend.onrender.com/api/operations'
  ].filter(Boolean) : [
    localStorage.getItem('API_BASE_OVERRIDE'),
    'http://localhost:3001/api/operations',
    `http://${LAN_IP}:3001/api/operations`,
    'https://scrapme-backend.onrender.com/api/operations'
  ].filter(Boolean);

  let currentBaseIndex = 0;
  function getApiBase() {
    return CANDIDATE_BASES[currentBaseIndex] || CANDIDATE_BASES[0];
  }

  // --- STATE ---
  let state = {
    role: 'partner', // 'partner' or 'warehouse'
    token: localStorage.getItem('ops_token') || null,
    user: JSON.parse(localStorage.getItem('ops_user')) || null,
    activeOrders: [],
    selectedOrderId: null,
    extraDevices: [], // Extra devices added locally for current order
    whOrders: [],
    selectedWhOrderId: null,
    uploadedPhotoUrl: '',
    partnerTab: 'pending', // 'pending', 'completed', 'cancelled'
    
    // GPS Simulation state
    gpsTimer: null,
    syncTimer: null,
    dutyOn: localStorage.getItem('ops_duty') === 'true',
    simLat: 12.9716, // Default to Bangalore coord
    simLng: 77.5946,
    simTicks: 0,
    eventSource: null
  };

  // --- HELPERS ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const elAddClass = (sel, cls) => $(sel)?.classList.add(cls);
  const elRemoveClass = (sel, cls) => $(sel)?.classList.remove(cls);
  const elSetVal = (sel, val) => { const el = $(sel); if (el) el.value = val; };
  const elSetText = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
  const elSetHtml = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };
  const elSetProp = (sel, prop, val) => { const el = $(sel); if (el) el[prop] = val; };

  function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast show ${type}`;
    toast.style.cssText = `
      padding: 16px 24px;
      border-radius: 12px;
      background: #1e293b;
      border-left: 4px solid var(--primary);
      color: var(--text-main);
      font-weight: 500;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
      transform: translateY(-20px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    if (type === 'success') toast.style.borderLeftColor = 'var(--success)';
    if (type === 'error') toast.style.borderLeftColor = 'var(--accent)';
    if (type === 'warning') toast.style.borderLeftColor = 'var(--warning)';
    
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    }, 50);
    
    setTimeout(() => {
      toast.style.transform = 'translateY(-20px)';
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 4000);
  }

  // Handle online/offline connection state
  window.addEventListener('online', () => {
    elAddClass('#offline-banner', 'hidden');
    showToast('Network restored! Reconnected to ScrapMe server.');
  });
  
  window.addEventListener('offline', () => {
    elRemoveClass('#offline-banner', 'hidden');
    showToast('Internet connection lost. Working offline...', 'error');
  });

  function startEventSource() {
    if (state.eventSource) {
      state.eventSource.close();
      state.eventSource = null;
    }

    const sseUrl = getApiBase() + '/events';
    console.log(`[PARTNER SSE CONNECT] Registering EventSource to: ${sseUrl}`);
    state.eventSource = new EventSource(sseUrl);

    state.eventSource.onopen = () => {
      console.log('[PARTNER SSE CONNECT] Connection successfully established (200 OK)');
      elSetText('#debug-sse-status', 'CONNECTED (200 OK)');
      const el = $('#debug-sse-status');
      if (el) el.style.color = 'var(--success)';
    };

    state.eventSource.addEventListener('message', (e) => {
      try {
        console.log('[PARTNER SSE MESSAGE INCOMING]', e.data);
        const event = JSON.parse(e.data);
        handleIncomingEvent(event);
        
        if (localStorage.getItem('DEBUG_GPS') === 'true') {
          elSetText('#debug-sse-event', `${event.type} at ${new Date().toLocaleTimeString()}`);
        }
      } catch (err) {
        console.error('Failed to parse SSE event data:', err);
      }
    });

    state.eventSource.onerror = (err) => {
      console.warn('[PARTNER SSE CONNECT ERROR] SSE dropped connection. Reconnecting...');
      elSetText('#debug-sse-status', 'RECONNECTING / DISCONNECTED');
      const el = $('#debug-sse-status');
      if (el) el.style.color = 'var(--accent)';
    };
  }

  function stopEventSource() {
    if (state.eventSource) {
      console.log('[PARTNER SSE DISCONNECT] Closing active EventSource stream.');
      state.eventSource.close();
      state.eventSource = null;
    }
    elSetText('#debug-sse-status', 'DISCONNECTED');
    const el = $('#debug-sse-status');
    if (el) el.style.color = 'var(--accent)';
  }

  function handleIncomingEvent(event) {
    if (!state.token || !state.user) return;
    const { type, data } = event;

    // Real-time assignment synchronization
    if (type === 'assignment_change') {
      if (data.partnerId === state.user._id) {
        if (data.type === 'assigned') {
          showToast(`🔔 New Assignment received!`, 'success');
        } else if (data.type === 'cancelled') {
          showToast(`⚠️ Assignment cancelled!`, 'error');
          if (state.selectedOrderId === data.orderId) {
            state.selectedOrderId = null;
            elAddClass('#detail-active', 'hidden');
            elRemoveClass('#detail-fallback', 'hidden');
          }
        }
        if (state.dutyOn) {
          loadPartnerOrders();
        }
      }
    }
  }

  async function apiFetch(path, options = {}, retries = 3, delay = 1000) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }

    try {
      if (!navigator.onLine) {
        elRemoveClass('#offline-banner', 'hidden');
        throw new TypeError('Failed to fetch (offline)');
      }

      const activeBase = getApiBase();
      console.log(`[API FETCH] ${options.method || 'GET'} ${activeBase}${path}`);
      
      const controller = new AbortController();
      const timeoutMs = options.timeout || 2500;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(activeBase + path, { ...options, headers, signal: controller.signal });
      clearTimeout(timeoutId);
      elAddClass('#offline-banner', 'hidden'); // Hide banner on success

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Operation failed');
      }
      return data;
    } catch (err) {
      // Check if network error (fetch failed / CORS / offline / abort)
      const isNetworkError = err.name === 'AbortError' || err instanceof TypeError || err.message.includes('fetch') || err.message.includes('network');

      if (isNetworkError) {
        elRemoveClass('#offline-banner', 'hidden');

        // Rotate candidate base URL if network fetch failed
        if (currentBaseIndex < CANDIDATE_BASES.length - 1) {
          const failedBase = getApiBase();
          currentBaseIndex++;
          const newBase = getApiBase();
          console.warn(`⚠️ Network fetch to ${failedBase} failed/timed out. Rotating API base to ${newBase}...`);
          localStorage.setItem('API_BASE_OVERRIDE', newBase);
          return apiFetch(path, options, retries, delay);
        }

        if (retries > 0) {
          console.warn(`⚠️ Network connection issue. Retrying API ${path} in ${delay}ms... (${retries} attempts left)`);
          await new Promise(r => setTimeout(r, delay));
          return apiFetch(path, options, retries - 1, Math.round(delay * 1.5));
        }
      }
      throw err;
    }
  }

  // --- ROLE SELECTOR ---
  window.selectRole = (role) => {
    state.role = role;
    $$('.role-btn').forEach(btn => btn.classList.remove('active'));
    elAddClass(`#role-${role}`, 'active');
    
    if (role === 'warehouse') {
      elSetProp('#emp-id', 'placeholder', 'e.g. WH-001');
    } else {
      elSetProp('#emp-id', 'placeholder', 'e.g. PP-001');
    }
  };

  function startSyncTimer() {
    if (state.syncTimer) clearInterval(state.syncTimer);
    state.syncTimer = setInterval(() => {
      if (state.token && state.dutyOn && navigator.onLine) {
        loadPartnerOrders(true); // silent fetch
      }
    }, 30000); // Poll every 30 seconds (SSE handles real-time updates)
  }

  // --- LOGIN ---
  $('#login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const employeeId = $('#emp-id')?.value?.trim() || '';
    const password = $('#emp-pass')?.value || '';

    try {
      console.log('[LOGIN STEP 1] Submitting login request for employeeId:', employeeId);
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ employeeId, password })
      });

      console.log('[LOGIN STEP 2] Login API returned HTTP 200 OK:', {
        token: data.token ? 'JWT_PRESENT' : 'MISSING',
        userId: data.user?._id,
        userName: data.user?.name,
        role: data.user?.role
      });

      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('ops_token', data.token);
      localStorage.setItem('ops_user', JSON.stringify(data.user));

      showToast(`Welcome back, ${data.user.name}!`);

      // ─── STEP 3: NAVIGATE TO DASHBOARD UI IMMEDIATELY ──────────
      console.log('[LOGIN STEP 3] Executing showDashboard() navigation...');
      showDashboard();

      // ─── STEP 4: START BACKGROUND SERVICES POST-NAVIGATION ────
      if (data.user.role === 'partner') {
        state.dutyOn = true;
        localStorage.setItem('ops_duty', 'true');
        elSetProp('#duty-toggle', 'checked', true);
        updateDutyStatusUI();
        startGpsSimulation();
        startSyncTimer();
      }

      startEventSource();
      console.log('[LOGIN STEP 5] Login and dashboard initialization complete.');
    } catch (err) {
      console.error('[LOGIN ERROR] Submission failed:', err);
      showToast(err.message || 'Login failed', 'error');
    }
  });

  window.handleLogout = async () => {
    // ─── STEP 1: CLICK CONFIRMED ───────────────────────────────
    console.log('[LOGOUT] 1. Logout button click confirmed');
    console.log('[LOGOUT]    localStorage before clear:', JSON.stringify({ ...localStorage }));
    console.log('[LOGOUT]    ops_token:', localStorage.getItem('ops_token') ? 'EXISTS' : 'null');
    console.log('[LOGOUT]    ops_user:', localStorage.getItem('ops_user') ? 'EXISTS' : 'null');
    console.log('[LOGOUT]    state.token:', state.token ? 'EXISTS' : 'null');
    console.log('[LOGOUT]    state.user:', state.user ? JSON.stringify(state.user) : 'null');

    // ─── STEP 2: STOP STREAMS & TIMERS SYNCHRONOUSLY ──────────
    try { if (typeof stopEventSource === 'function') stopEventSource(); } catch (e) {}
    try { if (typeof stopGpsSimulation === 'function') stopGpsSimulation(); } catch (e) {}
    try { if (typeof stopPartnerEventSource === 'function') stopPartnerEventSource(); } catch (e) {}
    if (state.syncTimer) { clearInterval(state.syncTimer); state.syncTimer = null; }
    if (state.gpsTimer) { clearInterval(state.gpsTimer); state.gpsTimer = null; }
    console.log('[LOGOUT] 2. Streams and timers stopped');

    // ─── STEP 3: CAPTURE TOKEN FOR BACKGROUND API CALL ────────
    const tokenForApiCall = state.token;
    const userRoleForApiCall = state.user ? state.user.role : null;

    // ─── STEP 4: CLEAR IN-MEMORY STATE IMMEDIATELY ────────────
    state.token = null;
    state.user = null;
    state.activeOrders = [];
    state.selectedOrderId = null;
    state.extraDevices = [];
    state.whOrders = [];
    state.selectedWhOrderId = null;
    state.dutyOn = false;
    console.log('[LOGOUT] 3. In-memory state cleared');

    // ─── STEP 5: CLEAR ALL WEB STORAGE IMMEDIATELY ────────────
    try { localStorage.clear(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    console.log('[LOGOUT] 4. localStorage cleared:', JSON.stringify({ ...localStorage }));
    console.log('[LOGOUT]    sessionStorage cleared:', JSON.stringify({ ...sessionStorage }));

    // ─── STEP 6: CLEAR CAPACITOR NATIVE STORAGE (background) ──
    if (window.Capacitor && window.Capacitor.Plugins) {
      try { if (window.Capacitor.Plugins.Preferences) await window.Capacitor.Plugins.Preferences.clear(); } catch (e) {}
      try { if (window.Capacitor.Plugins.Storage) await window.Capacitor.Plugins.Storage.clear(); } catch (e) {}
      console.log('[LOGOUT] 5. Capacitor native storage cleared');
    }

    // ─── STEP 7: NOTIFY BACKEND — FIRE AND FORGET (NO AWAIT) ──
    // DO NOT await this — it must not block the UI redirect
    if (tokenForApiCall && userRoleForApiCall === 'partner') {
      fetch(API_BASE + '/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tokenForApiCall }
      }).then(res => {
        console.log('[LOGOUT] 6. Backend logout API status:', res.status);
      }).catch(err => {
        console.warn('[LOGOUT] 6. Backend logout API error (non-critical):', err.message);
      });
    }

    // ─── STEP 8: HARD NAVIGATE TO LOGIN — BLOCKS BACK BUTTON ──
    // window.location.replace() removes the dashboard from browser history
    // so pressing Back cannot return to the dashboard
    console.log('[LOGOUT] 7. Navigating to login page via window.location.replace()');
    console.log('[LOGOUT]    Target URL:', window.location.pathname);
    window.location.replace(window.location.pathname);
  };

  // ─── EVENT DELEGATION: belt-and-suspenders for Android WebView ─────────
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#logout-btn, .logout-btn');
    if (btn && typeof window.handleLogout === 'function') {
      e.preventDefault();
      e.stopImmediatePropagation();
      console.log('[LOGOUT] Event delegation: click on logout button confirmed');
      window.handleLogout();
    }
  }, true); // useCapture=true — fires before any other listener

  // Navigation guard against browser/webview back button
  window.addEventListener('popstate', () => {
    if (!state.token || !state.user) {
      elRemoveClass('#auth-screen', 'hidden');
      elAddClass('#app-screen', 'hidden');
      elAddClass('#partner-view', 'hidden');
      elAddClass('#warehouse-view', 'hidden');
      return;
    }

    const detailsScreen = $('#partner-order-details-screen');
    if (detailsScreen && !detailsScreen.classList.contains('hidden')) {
      closePartnerOrderDetails(false);
    }
  });

  // Guard Capacitor native Android back button
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('backButton', () => {
      if (!state.token || !state.user) {
        window.Capacitor.Plugins.App.exitApp();
        return;
      }

      const detailsScreen = $('#partner-order-details-screen');
      if (detailsScreen && !detailsScreen.classList.contains('hidden')) {
        closePartnerOrderDetails(true);
        return;
      }

      window.Capacitor.Plugins.App.exitApp();
    });
  }

  // --- DASHBOARD ROUTER ---
  function showDashboard() {
    if (!state.token || !state.user) {
      console.warn('[AUTH GUARD] Cannot display dashboard: User not authenticated.');
      elRemoveClass('#auth-screen', 'hidden');
      elAddClass('#app-screen', 'hidden');
      return;
    }

    elAddClass('#auth-screen', 'hidden');
    elRemoveClass('#app-screen', 'hidden');

    elSetText('#display-user-name', state.user.name || 'User');
    elSetText('#display-user-role', state.user.role === 'warehouse' ? 'Warehouse Auditor' : 'Pickup Partner');

    if (state.user.role === 'warehouse') {
      elAddClass('#partner-view', 'hidden');
      elRemoveClass('#warehouse-view', 'hidden');
      loadWarehouseOrders();
    } else {
      elRemoveClass('#partner-view', 'hidden');
      elAddClass('#warehouse-view', 'hidden');
      
      // Sync duty status checkbox toggle
      elSetProp('#duty-toggle', 'checked', state.dutyOn);
      updateDutyStatusUI();
      
      // Update Debug Info
      elSetText('#debug-partner-id', state.user.employeeId || state.user._id);
      startPartnerEventSource();

      if (state.dutyOn) {
        startGpsSimulation();
        startSyncTimer();
      }
      
      loadPartnerOrders();
    }
  }

  // --- PICKUP PARTNER FLOW ---
  async function loadPartnerStats() {
    if (!state.token) return;
    try {
      const stats = await apiFetch('/orders/stats');
      elSetText('#stat-today-pickups', stats.todayPickups);
      elSetText('#stat-completed-all', stats.completedAll);
      elSetText('#stat-pending', stats.pending);
      elSetText('#stat-cancelled', stats.cancelled);
      elSetText('#stat-total-devices', stats.totalDevicesCollected);
      elSetText('#stat-today-value', '₹' + stats.todayEstimatedValue.toLocaleString());
    } catch (err) {
      console.error('Failed to load partner dashboard statistics:', err);
    }
  }

  let currentFetchRequestId = 0;

  async function loadPartnerOrders(silent = false) {
    if (!state.token) return;
    // If not online duty, do not fetch
    if (!state.dutyOn) {
      state.activeOrders = [];
      renderPartnerJobs();
      return;
    }
    
    const requestId = ++currentFetchRequestId;

    try {
      if (!silent) {
        state.activeOrders = []; // Clear stale orders from previous tab
        elSetHtml('#partner-jobs-list', `
          <div style="display: flex; flex-direction: column; gap: 10px; padding: 10px;">
            <div class="skeleton" style="height: 120px; border-radius: 8px;"></div>
            <div class="skeleton" style="height: 120px; border-radius: 8px;"></div>
          </div>
        `);
      }
      const orders = await apiFetch('/orders?status=' + state.partnerTab);
      
      // Discard out-of-order response if tab was switched in flight
      if (requestId !== currentFetchRequestId) return;

      state.activeOrders = orders;
      
      renderPartnerJobs();
      loadPartnerStats();
    } catch (err) {
      if (requestId !== currentFetchRequestId) return;
      if (!silent) {
        showToast('Error loading orders: ' + err.message, 'error');
      }
    }
  }

  function getCardDistance(order) {
    const idStr = order.orderId || 'PO-2026-000001';
    let hash = 0;
    for (let i = 0; i < idStr.length; i++) {
      hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const stableKm = 1.5 + (Math.abs(hash) % 110) / 10.0;
    return `${stableKm.toFixed(1)} km`;
  }

  window.startNavigationFromCard = async (id) => {
    state.selectedOrderId = id;
    const current = state.activeOrders.find(o => o._id === id);
    if (current) showJobDetails(current);
    await window.startNavigation();
  };

  window.generateOtpFromCard = async (id) => {
    state.selectedOrderId = id;
    const current = state.activeOrders.find(o => o._id === id);
    if (current) showJobDetails(current);
    await window.triggerOtpGenerate();
  };

  function renderPartnerJobs() {
    const container = $('#partner-jobs-list');
    if (!container) return;
    
    if (!state.dutyOn) {
      container.innerHTML = `
        <div class="empty-jobs" style="text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 0.95rem;">
          <div style="font-size: 2.2rem; margin-bottom: 12px; filter: grayscale(1); opacity: 0.6;">💤</div>
          <div style="font-weight: 600; color: var(--text-main); margin-bottom: 4px;">No active duty</div>
          <div>Go Online to receive assignments.</div>
        </div>
      `;
      elAddClass('#detail-active', 'hidden');
      elRemoveClass('#detail-fallback', 'hidden');
      return;
    }

    // STRICT TAB FILTERING — Ensures an order only ever renders in its correct tab state
    const filteredOrders = state.activeOrders.filter(o => {
      if (state.partnerTab === 'pending') {
        return ['assigned', 'navigating', 'arrived'].includes(o.status);
      } else if (state.partnerTab === 'completed') {
        return ['picked_up', 'completed'].includes(o.status);
      } else if (state.partnerTab === 'cancelled') {
        return o.status === 'cancelled';
      }
      return false;
    });

    if (filteredOrders.length === 0) {
      let emptyMsg = 'No pending pickups';
      if (state.partnerTab === 'completed') emptyMsg = 'No completed pickups';
      if (state.partnerTab === 'cancelled') emptyMsg = 'No cancelled pickups';
      
      container.innerHTML = `
        <div class="empty-jobs" style="text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 0.95rem;">
          <div style="font-size: 2.2rem; margin-bottom: 12px; filter: grayscale(1); opacity: 0.6;">📦</div>
          <div>${emptyMsg}</div>
        </div>
      `;
      elAddClass('#detail-active', 'hidden');
      elRemoveClass('#detail-fallback', 'hidden');
      return;
    }

    container.innerHTML = filteredOrders.map(o => {
      const isSelected = o._id === state.selectedOrderId;
      const req = o.requestId || {};
      const seller = req.sellerName || 'Customer';
      const phone = req.phone || 'N/A';
      const address = req.address || 'No address';
      
      let cardInner = '';
      
      if (state.partnerTab === 'pending') {
        const devCount = 1 + (o.extraDevices ? o.extraDevices.length : 0);
        const assignedTime = new Date(o.createdAt).toLocaleString();
        const distStr = getCardDistance(o);
        let totalVal = 0;
        if (req.price) totalVal += parseInt(req.price.replace(/[^\d]/g, ''), 10) || 0;
        if (o.extraDevices) {
          o.extraDevices.forEach(ed => { totalVal += Number(ed.estimatedPrice) || 0; });
        }
        
        cardInner = `
          <div class="job-item-header" style="display: flex; justify-content: space-between; align-items: center;">
            <span class="job-po" style="font-weight: 700; color: var(--primary);">${o.orderId}</span>
            <span class="job-status-badge ${o.status}" style="font-size: 0.7rem; text-transform: uppercase; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); padding: 2px 6px; border-radius: 6px; color: var(--primary); font-weight: 600;">${o.status}</span>
          </div>
          <div class="job-customer" style="font-weight: 700; margin-top: 8px; font-size: 0.95rem; color: var(--text-main);">${seller}</div>
          <div class="job-phone" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">📞 ${phone}</div>
          <div class="job-address" style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;" title="${address}">📍 ${address}</div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 0.8rem; color: var(--text-muted); border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 8px;">
            <span>🚗 Distance: <strong>${distStr}</strong></span>
            <span>📱 Devices: <strong>${devCount}</strong></span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 0.8rem; color: var(--text-muted);">
            <span>💰 Est. Value: <strong style="color: var(--success);">₹${totalVal.toLocaleString()}</strong></span>
            <span style="font-size: 0.7rem; color: var(--text-muted);">🕒 ${assignedTime}</span>
          </div>

          <div class="card-actions-row" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
            <button class="btn btn-sm" onclick="event.stopPropagation(); startNavigationFromCard('${o._id}')" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 6px; color: var(--text-main); font-size: 0.75rem; padding: 6px 4px; cursor: pointer;">🧭 Nav</button>
            <button class="btn btn-sm" onclick="event.stopPropagation(); window.open('tel:${phone}')" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 6px; color: var(--text-main); font-size: 0.75rem; padding: 6px 4px; cursor: pointer;">📞 Call</button>
            <button class="btn btn-sm" onclick="event.stopPropagation(); generateOtpFromCard('${o._id}')" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 6px; color: var(--text-main); font-size: 0.75rem; padding: 6px 4px; cursor: pointer;">🔑 OTP</button>
            <button class="btn btn-sm" onclick="event.stopPropagation(); selectPartnerJob('${o._id}')" style="background: var(--primary); border: none; border-radius: 6px; color: white; font-size: 0.75rem; padding: 6px 4px; font-weight: 600; cursor: pointer;">📄 View</button>
          </div>
        `;
      } else if (state.partnerTab === 'completed') {
        const devCount = 1 + (o.extraDevices ? o.extraDevices.length : 0);
        const completionTime = new Date(o.completedAt || o.pickedUpAt || o.updatedAt).toLocaleString();
        let totalVal = 0;
        if (req.price) totalVal += parseInt(req.price.replace(/[^\d]/g, ''), 10) || 0;
        if (o.extraDevices) {
          o.extraDevices.forEach(ed => { totalVal += Number(ed.estimatedPrice) || 0; });
        }
        
        cardInner = `
          <div class="job-item-header" style="display: flex; justify-content: space-between; align-items: center;">
            <span class="job-po" style="font-weight: 700; color: var(--success);">${o.orderId}</span>
            <span class="job-status-badge ${o.warehouseStatus || 'pending'}" style="font-size: 0.7rem; text-transform: uppercase; background: ${o.warehouseStatus === 'verified' ? 'var(--success)' : o.warehouseStatus === 'discrepancy' ? 'var(--accent)' : 'var(--warning)'}; padding: 2px 6px; border-radius: 6px; color: white; font-weight: 600;">${o.warehouseStatus || 'Pending Audit'}</span>
          </div>
          <div class="job-customer" style="font-weight: 700; margin-top: 8px; font-size: 0.95rem; color: var(--text-main);">${seller}</div>
          <div class="job-meta-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 8px; font-size: 0.8rem; color: var(--text-muted); border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 8px;">
            <div>Devices: <strong style="color: var(--text-main);">${devCount}</strong></div>
            <div>Value: <strong style="color: var(--success);">₹${totalVal.toLocaleString()}</strong></div>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 6px;">
            ✅ Completed: ${completionTime}
          </div>

          <div class="card-actions-row" style="display: grid; grid-template-columns: 1fr; gap: 6px; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
            <button class="btn btn-sm" onclick="event.stopPropagation(); selectPartnerJob('${o._id}')" style="background: var(--primary); border: none; border-radius: 6px; color: white; font-size: 0.75rem; padding: 6px 4px; font-weight: 600; cursor: pointer; text-align: center;">📄 View Details (Read-only)</button>
          </div>
        `;
      } else if (state.partnerTab === 'cancelled') {
        const cancelTime = new Date(o.cancelledAt || o.updatedAt).toLocaleString();
        cardInner = `
          <div class="job-item-header" style="display: flex; justify-content: space-between; align-items: center;">
            <span class="job-po" style="font-weight: 700; color: var(--text-muted);">${o.orderId}</span>
            <span class="job-status-badge cancelled" style="font-size: 0.7rem; text-transform: uppercase; background: rgba(244, 63, 94, 0.15); color: var(--accent); border: 1px solid rgba(244, 63, 94, 0.3); padding: 2px 6px; border-radius: 6px; font-weight: 600;">${o.cancelledBy || 'system'}</span>
          </div>
          <div class="job-customer" style="font-weight: 700; margin-top: 8px; font-size: 0.95rem; color: var(--text-main);">${seller}</div>
          <div class="job-reason" style="font-size: 0.8rem; color: var(--accent); margin-top: 8px; font-style: italic; background: rgba(244, 63, 94, 0.04); padding: 8px; border-radius: 6px; border-left: 3px solid var(--accent);">
            Reason: "${o.cancellationReason || 'No reason provided'}"
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 6px;">
            ❌ Cancelled: ${cancelTime}
          </div>

          <div class="card-actions-row" style="display: grid; grid-template-columns: 1fr; gap: 6px; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
            <button class="btn btn-sm" onclick="event.stopPropagation(); selectPartnerJob('${o._id}')" style="background: var(--primary); border: none; border-radius: 6px; color: white; font-size: 0.75rem; padding: 6px 4px; font-weight: 600; cursor: pointer; text-align: center;">📄 View Details (Read-only)</button>
          </div>
        `;
      }

      return `
        <div class="job-item ${isSelected ? 'active' : ''}" onclick="selectPartnerJob('${o._id}')" style="padding: 12px; margin-bottom: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-card); cursor: pointer; transition: all 0.2s;">
          ${cardInner}
        </div>
      `;
    }).join('');

    // Render active list in partner-jobs-list
  }

  window.openPartnerOrderDetails = (orderId) => {
    state.selectedOrderId = orderId;
    state.extraDevices = [];

    const order = state.activeOrders.find(o => o._id === orderId);
    if (!order) return;

    elAddClass('#partner-dashboard-view', 'hidden');
    elRemoveClass('#partner-order-details-screen', 'hidden');

    elSetText('#det-header-po-id', order.orderId || 'PO-2026-000001');
    elSetText('#det-header-status-badge', (order.status || 'ASSIGNED').toUpperCase());

    showJobDetails(order);

    if (!history.state || history.state.screen !== 'partner-order-details') {
      history.pushState({ screen: 'partner-order-details', orderId }, '');
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  window.closePartnerOrderDetails = (popHistory = true) => {
    state.selectedOrderId = null;
    elRemoveClass('#partner-dashboard-view', 'hidden');
    elAddClass('#partner-order-details-screen', 'hidden');

    if (popHistory && history.state && history.state.screen === 'partner-order-details') {
      history.back();
    }

    renderPartnerJobs();
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  window.selectPartnerJob = (id) => {
    window.openPartnerOrderDetails(id);
  };

  window.switchPartnerTab = (tab) => {
    state.partnerTab = tab;
    $$('.job-list-tabs button').forEach(btn => btn.classList.remove('active'));
    elAddClass(`#btn-tab-${tab}`, 'active');
    
    // Clear selection & reset active orders screen state when switching tabs
    state.selectedOrderId = null;
    state.activeOrders = [];
    elRemoveClass('#partner-dashboard-view', 'hidden');
    elAddClass('#partner-order-details-screen', 'hidden');

    loadPartnerOrders();
  };

  window.triggerPartnerCancel = async () => {
    const reason = prompt("Please enter the reason for cancelling this pickup:");
    if (reason === null) return; // Prompt cancelled
    if (!reason.trim()) {
      showToast('Cancellation reason is required.', 'error');
      return;
    }
    
    try {
      await apiFetch(`/orders/${state.selectedOrderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim(), cancelledBy: 'partner' })
      });
      showToast('Pickup order cancelled successfully.', 'warning');
      window.closePartnerOrderDetails(false);
      loadPartnerOrders();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Map and coordinate variables
  let detailsMap = null;
  let detailsMapCustomerMarker = null;
  let detailsMapPartnerMarker = null;
  let detailsMapPolyline = null;

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  function getDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  async function loadDetailsMap(address) {
    if (!address) return;
    
    // Initialize map if not already done
    if (!detailsMap) {
      const mapContainer = document.getElementById('op-job-map');
      if (!mapContainer) {
        console.warn('op-job-map container not found');
        return;
      }
      detailsMap = L.map('op-job-map').setView([12.9716, 77.5946], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(detailsMap);
    }

    // Reset markers
    if (detailsMapCustomerMarker) detailsMap.removeLayer(detailsMapCustomerMarker);
    if (detailsMapPartnerMarker) detailsMap.removeLayer(detailsMapPartnerMarker);
    if (detailsMapPolyline) detailsMap.removeLayer(detailsMapPolyline);

    state.customerCoords = null;

    const geoWarning = $('#geocoding-warning');
    if (geoWarning) geoWarning.classList.add('hidden');

    try {
      // Query Nominatim geocoder
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        state.customerCoords = { lat, lng: lon };

        // Cache coordinates on the backend for automated geofencing
        apiFetch(`/orders/${state.selectedOrderId}/coordinates`, {
          method: 'POST',
          body: JSON.stringify({ latitude: lat, longitude: lon })
        }).catch(err => console.error('Failed to sync customer coordinates to backend:', err.message));

        // Point Google Maps navigation button to turn-by-turn coordinate route
        const linkMap = $('#link-map');
        if (linkMap) linkMap.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;

        // Plot Customer Location
        detailsMapCustomerMarker = L.marker([lat, lon])
          .bindPopup(`<strong>Customer Pickup Location</strong><br>${escapeHtml(address)}`)
          .addTo(detailsMap);

        // Center map on customer
        detailsMap.setView([lat, lon], 14);

        // Plot partner location if coordinates are resolved
        updateDetailsMapPartnerMarker();
      } else {
        if (state.simLat && state.simLng) {
          detailsMap.setView([state.simLat, state.simLng], 13);
        }
        console.warn('Geocoding search failed for address:', address);
        if (geoWarning) geoWarning.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Nominatim address geocoding failed:', err);
      if (geoWarning) geoWarning.classList.remove('hidden');
    }
  }

  function updateDetailsMapPartnerMarker() {
    if (!detailsMap || !state.simLat || !state.simLng) return;

    if (detailsMapPartnerMarker) detailsMap.removeLayer(detailsMapPartnerMarker);
    if (detailsMapPolyline) detailsMap.removeLayer(detailsMapPolyline);

    // Plot Partner Marker
    detailsMapPartnerMarker = L.marker([state.simLat, state.simLng])
      .bindPopup(`<strong>Your Live Location</strong>`)
      .addTo(detailsMap);

    // Draw route path to customer destination
    if (state.customerCoords) {
      const coords = [
        [state.simLat, state.simLng],
        [state.customerCoords.lat, state.customerCoords.lng]
      ];
      detailsMapPolyline = L.polyline(coords, { color: '#6366f1', weight: 4, opacity: 0.8 }).addTo(detailsMap);
      
      // Auto-fit map boundaries
      const bounds = L.latLngBounds(coords);
      detailsMap.fitBounds(bounds, { padding: [30, 30] });
    }
  }

  function showJobDetails(order) {
    elAddClass('#detail-fallback', 'hidden');
    elRemoveClass('#detail-active', 'hidden');

    elSetText('#det-po-id', order.orderId);
    elSetText('#det-header-po-id', order.orderId || 'PO-2026-000001');
    
    // Status text
    const statusText = {
      assigned: 'Assigned ⏳',
      navigating: 'Navigating 🛵',
      arrived: 'Arrived at Location 📍',
      picked_up: 'Picked Up 📦',
      completed: 'Completed 🎉',
      cancelled: 'Cancelled ❌'
    }[order.status] || order.status;
    
    elSetText('#det-status', statusText);
    elSetText('#det-header-status-badge', (order.status || 'ASSIGNED').toUpperCase().replace('_', ' '));

    const req = order.requestId || {};
    elSetText('#det-customer', req.sellerName || '—');
    elSetText('#det-phone', req.phone || '—');
    elSetText('#det-address', req.address || '—');
    elSetText('#det-device', `${req.brand || '—'} ${req.model || '—'}`);
    elSetText('#det-device-storage', req.storage || '—');
    elSetText('#det-device-price', req.price || '—');

     // Set Map & Call Anchors
    elSetProp('#link-map', 'href', `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(req.address || '')}`);
    elSetProp('#link-call', 'href', `tel:${req.phone || ''}`);
    elSetProp('#link-call-bottom', 'href', `tel:${req.phone || ''}`);

    // Load dynamic Map and Markers
    loadDetailsMap(req.address);

    // Read-only logic check
    const isReadOnly = ['completed', 'cancelled', 'picked_up'].includes(order.status) || order.warehouseVerified;
    if (isReadOnly) {
      elRemoveClass('#read-only-banner', 'hidden');
      elAddClass('#btn-start-nav', 'hidden');
      elAddClass('#btn-arrive', 'hidden');
      elAddClass('#btn-cancel-job', 'hidden');
      
      // Hide OTP verification section and add extra device button
      const otpVerifyBlock = $('.otp-verification-block');
      if (otpVerifyBlock) otpVerifyBlock.style.display = 'none';
      const btnAddDevice = $('#btn-add-device');
      if (btnAddDevice) btnAddDevice.style.display = 'none';

      if (order.status === 'cancelled') {
        elSetText('#read-only-banner-title', 'Order Cancelled ❌');
        const rTitle = $('#read-only-banner-title');
        if (rTitle) rTitle.style.color = 'var(--accent)';
        elSetText('#read-only-banner-desc', `Cancelled by ${order.cancelledBy || 'system'} on ${new Date(order.cancelledAt || order.updatedAt).toLocaleString()}.\nReason: "${order.cancellationReason || 'No reason provided'}"`);
      } else {
        elSetText('#read-only-banner-title', 'Order Completed / Collected ✅');
        const rTitle = $('#read-only-banner-title');
        if (rTitle) rTitle.style.color = 'var(--success)';
        const whStatusStr = order.warehouseStatus === 'verified' ? 'Verified Match' : order.warehouseStatus === 'discrepancy' ? 'Discrepancy Flags' : 'Pending Audit Check';
        elSetText('#read-only-banner-desc', `Collected on ${new Date(order.pickedUpAt || order.updatedAt).toLocaleString()}.\nRemarks: "${order.notes || 'No remarks recorded'}"\nWarehouse Audit Status: ${whStatusStr}`);
      }
    } else {
      elAddClass('#read-only-banner', 'hidden');
      const otpVerifyBlock = $('.otp-verification-block');
      if (otpVerifyBlock) otpVerifyBlock.style.display = 'block';
      const btnAddDevice = $('#btn-add-device');
      if (btnAddDevice) btnAddDevice.style.display = 'block';
      elRemoveClass('#btn-cancel-job', 'hidden');



      // Show/hide actions based on status
      if (order.status === 'assigned') {
        elRemoveClass('#btn-start-nav', 'hidden');
        elAddClass('#btn-arrive', 'hidden');
      } else if (order.status === 'navigating') {
        elAddClass('#btn-start-nav', 'hidden');
        elRemoveClass('#btn-arrive', 'hidden');
      } else {
        // Arrived
        elAddClass('#btn-start-nav', 'hidden');
        elAddClass('#btn-arrive', 'hidden');
      }
    }

    // Load extra devices list
    renderExtraDevices();

    // Reset verification form inputs
    elSetVal('#verification-code', '');
    elSetVal('#pickup-notes', order.notes || '');
    
    // Reset testing OTP block
    const devBanner = $('#otp-dev-banner');
    if (devBanner) devBanner.classList.add('hidden');
  }

  window.startNavigation = async () => {
    if (!state.selectedOrderId) return;
    try {
      const order = await apiFetch(`/orders/${state.selectedOrderId}/start`, {
        method: 'POST',
        body: JSON.stringify({
          latitude: state.simLat,
          longitude: state.simLng
        })
      });
      showToast('Navigation started! GPS tracking active.');
      // Automatically turn duty on if navigation starts
      if (!state.dutyOn) {
        state.dutyOn = true;
        elSetProp('#duty-toggle', 'checked', true);
        localStorage.setItem('ops_duty', 'true');
        updateDutyStatusUI();
        startGpsSimulation();
      }
      
      loadPartnerOrders();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.markArrived = async () => {
    if (!state.selectedOrderId) return;
    try {
      await apiFetch(`/orders/${state.selectedOrderId}/arrive`, {
        method: 'POST',
        body: JSON.stringify({
          latitude: state.simLat,
          longitude: state.simLng
        })
      });
      showToast('Status updated: Arrived at location!');
      loadPartnerOrders();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.openPickupConfirmModal = () => {
    elRemoveClass('#pickup-confirm-modal', 'hidden');
    elAddClass('#pickup-confirm-modal', 'open');
  };

  window.closePickupConfirmModal = () => {
    elAddClass('#pickup-confirm-modal', 'hidden');
    elRemoveClass('#pickup-confirm-modal', 'open');
  };

  window.executeDirectPickup = async () => {
    closePickupConfirmModal();
    const notesInput = $('#pickup-notes');
    const notes = notesInput ? notesInput.value.trim() : '';
    const finalPriceInput = $('#agreed-price');
    const finalPrice = finalPriceInput ? finalPriceInput.value.trim() : '';

    try {
      // Simulate trip duration & distance
      const distance = 3 + Math.round(Math.random() * 80) / 10; // e.g. 3.4 km
      const duration = 15 + Math.round(Math.random() * 30); // e.g. 25 mins

      const res = await apiFetch(`/orders/${state.selectedOrderId}/otp/verify`, {
        method: 'POST',
        body: JSON.stringify({
          otp: 'BYPASS',
          extraDevices: state.extraDevices,
          notes,
          remarks: notes,
          finalPrice,
          distanceTravelled: distance,
          durationMinutes: duration,
          latitude: state.simLat,
          longitude: state.simLng
        })
      });

      showToast('Order pickup completed successfully! 🎉', 'success');
      window.closePartnerOrderDetails(false);
      loadPartnerOrders();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // --- DEVICE ADDITION MODAL ---
  window.openDeviceModal = () => {
    elAddClass('#device-modal', 'open');
    const deviceForm = $('#device-form');
    if (deviceForm) deviceForm.reset();
    state.uploadedPhotoUrl = '';
    const previewBox = $('#preview-box');
    if (previewBox) previewBox.style.display = 'none';
    const cameraBtn = $('#camera-btn');
    if (cameraBtn) cameraBtn.style.display = 'flex';
  };

  window.closeDeviceModal = () => {
    elRemoveClass('#device-modal', 'open');
  };

  window.triggerPhotoUpload = () => {
    const fileInput = $('#file-input');
    if (fileInput) fileInput.click();
  };

  window.processPhoto = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target.result;
      
      try {
        showToast('Uploading photo...');
        const res = await apiFetch('/upload', {
          method: 'POST',
          body: JSON.stringify({ base64Data })
        });
        
        state.uploadedPhotoUrl = res.photoUrl;
        elSetProp('#photo-preview-img', 'src', res.photoUrl);
        const previewBox = $('#preview-box');
        if (previewBox) previewBox.style.display = 'block';
        const cameraBtn = $('#camera-btn');
        if (cameraBtn) cameraBtn.style.display = 'none';
        showToast('Photo uploaded successfully!');
      } catch (err) {
        showToast('Photo upload failed: ' + err.message, 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  window.removePhoto = () => {
    state.uploadedPhotoUrl = '';
    elSetProp('#photo-preview-img', 'src', '');
    const previewBox = $('#preview-box');
    if (previewBox) previewBox.style.display = 'none';
    const cameraBtn = $('#camera-btn');
    if (cameraBtn) cameraBtn.style.display = 'flex';
    elSetVal('#file-input', '');
  };

  window.handleDeviceAdd = (e) => {
    e.preventDefault();
    const brand = $('#dev-brand')?.value?.trim() || '';
    const model = $('#dev-model')?.value?.trim() || '';
    const storage = $('#dev-storage')?.value?.trim() || '';
    const condition = $('#dev-condition')?.value || '';
    const priceVal = $('#dev-price')?.value;
    const estimatedPrice = priceVal ? parseInt(priceVal, 10) : 0;
    const imei = $('#dev-imei')?.value?.trim() || '';

    state.extraDevices.push({
      brand,
      model,
      storage,
      condition,
      estimatedPrice,
      imei: imei || undefined,
      photoUrl: state.uploadedPhotoUrl || '/uploads/default-device.png'
    });

    renderExtraDevices();
    closeDeviceModal();
    showToast('Extra device added to pickup list');
  };

  function renderExtraDevices() {
    const container = $('#extra-devices-container');
    if (!container) return;
    if (state.extraDevices.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 12px; font-size: 0.8rem; color:var(--text-muted); border: 1px dashed rgba(255,255,255,0.05); border-radius:8px;">No extra devices collected.</div>`;
      return;
    }

    container.innerHTML = state.extraDevices.map((d, index) => `
      <div class="device-card">
        <div class="device-item-left">
          <img src="${d.photoUrl || '/uploads/default-device.png'}" class="device-img-thumbnail" alt="Device Photo">
          <div class="device-card-info">
            <h4>${d.brand} ${d.model}</h4>
            <p>Storage: ${d.storage} | Condition: ${d.condition} ${d.imei ? `| IMEI: ${d.imei}` : ''}</p>
          </div>
        </div>
        <div class="device-card-price">₹${d.estimatedPrice.toLocaleString()}</div>
      </div>
    `).join('');
  }

  // --- DUTY AND GPS SIMULATION ---
  function startPartnerEventSource() {
    startEventSource();
  }

  function stopPartnerEventSource() {
    stopEventSource();
  }

  window.toggleDuty = async () => {
    const dutyToggle = $('#duty-toggle');
    const isChecked = dutyToggle ? dutyToggle.checked : false;
    state.dutyOn = isChecked;
    localStorage.setItem('ops_duty', isChecked ? 'true' : 'false');
    
    console.log(`[CLIENT DUTY CHANGE] Toggle status changed: ${isChecked ? 'ON' : 'OFF'}`);
    updateDutyStatusUI();
    
    // Sync status to backend
    if (state.token && state.user && state.user.role === 'partner') {
      try {
        const reqBody = { online: isChecked };
        console.log(`[CLIENT DUTY API REQUEST] POST /api/operations/auth/duty | Body:`, reqBody);
        
        const response = await apiFetch('/auth/duty', {
          method: 'POST',
          body: JSON.stringify(reqBody)
        });
        
        console.log(`[CLIENT DUTY API RESPONSE] Response:`, response);
        showToast(`Duty status synced: ${response.online ? 'Online' : 'Offline'}`, 'success');
      } catch (err) {
        console.error('[CLIENT DUTY API ERROR] Failed to sync status:', err.message);
        showToast('Failed to update duty status on backend: ' + err.message, 'error');
      }
    }
    
    if (isChecked) {
      startGpsSimulation();
      startSyncTimer();
      loadPartnerOrders();
    } else {
      stopGpsSimulation();
      if (state.syncTimer) {
        clearInterval(state.syncTimer);
        state.syncTimer = null;
      }
      state.activeOrders = [];
      renderPartnerJobs();
    }
  };

  function updateDutyStatusUI() {
    elAddClass('#duty-dot', state.dutyOn ? 'active' : 'inactive');
    elRemoveClass('#duty-dot', state.dutyOn ? 'inactive' : 'active');
    
    elSetText('#debug-db-status', state.dutyOn ? 'ONLINE' : 'OFFLINE');
    const elDbStatus = $('#debug-db-status');
    if (elDbStatus) elDbStatus.style.color = state.dutyOn ? 'var(--success)' : 'var(--text-muted)';
    elSetText('#debug-last-seen', new Date().toLocaleTimeString());
    
    if (state.dutyOn) {
      elAddClass('#duty-dot', 'active');
      elSetText('#duty-text', 'On Duty — GPS Tracking Active');
      const txt = $('#duty-text');
      if (txt) txt.style.color = 'var(--success)';
    } else {
      elRemoveClass('#duty-dot', 'active');
      elSetText('#duty-text', 'Off Duty — GPS Off');
      const txt = $('#duty-text');
      if (txt) txt.style.color = 'var(--text-muted)';
    }
  }

  let lastGpsSentTime = 0;
  let lastLatitude = null;
  let lastLongitude = null;

  function cacheGpsUpdate(payload) {
    try {
      const cache = JSON.parse(localStorage.getItem('ops_gps_cache') || '[]');
      if (cache.length >= 100) cache.shift(); // Limit cache to 100 points
      cache.push({ ...payload, timestamp: payload.timestamp || new Date().toISOString() });
      localStorage.setItem('ops_gps_cache', JSON.stringify(cache));
      console.log(`[GPS CACHE] Saved point offline. Total cached: ${cache.length}`);
    } catch (e) {
      console.error('Failed to cache GPS point:', e);
    }
  }

  async function syncCachedGps() {
    if (!navigator.onLine) return;
    try {
      const cache = JSON.parse(localStorage.getItem('ops_gps_cache') || '[]');
      if (cache.length === 0) return;

      console.log(`[GPS SYNC] Found ${cache.length} cached location points. Syncing...`);
      localStorage.setItem('ops_gps_cache', '[]'); // Clear to prevent race conditions

      for (const payload of cache) {
        try {
          const response = await apiFetch('/gps/update', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          if (localStorage.getItem('DEBUG_GPS') === 'true') {
            elSetText('#debug-api-upload', `Synced (200) at ${new Date().toLocaleTimeString()}`);
            if (response && response.lastUpdated) {
              elSetText('#debug-db-update', new Date(response.lastUpdated).toLocaleTimeString());
            }
          }
        } catch (err) {
          const failedIndex = cache.indexOf(payload);
          const remaining = cache.slice(failedIndex);
          localStorage.setItem('ops_gps_cache', JSON.stringify(remaining));
          console.error(`[GPS SYNC] Retry failed. Re-cached ${remaining.length} points.`);
          if (localStorage.getItem('DEBUG_GPS') === 'true') {
            elSetText('#debug-api-upload', `Sync fail: ${err.message}`);
          }
          break;
        }
      }
    } catch (e) {
      console.error('GPS offline sync failed:', e);
    }
  }

  function startGpsSimulation() {
    stopGpsSimulation();
    
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.', 'error');
      elSetProp('#duty-toggle', 'checked', false);
      state.dutyOn = false;
      updateDutyStatusUI();
      return;
    }

    const options = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    };

    const onGpsSuccess = async (position) => {
      state.simLat = position.coords.latitude;
      state.simLng = position.coords.longitude;
      
      const speed = position.coords.speed;
      const accuracy = position.coords.accuracy;
      const heading = position.coords.heading;
      const timestamp = new Date(position.timestamp).toISOString();

      console.log(`[RAW GPS CALLBACK] Time: ${timestamp} | Lat: ${state.simLat} | Lng: ${state.simLng} | Acc: ${accuracy}m | Speed: ${speed} m/s | Heading: ${heading}`);
      
      if (localStorage.getItem('DEBUG_GPS') === 'true') {
        elSetText('#debug-gps-time', timestamp);
        elSetText('#debug-coords', `${state.simLat.toFixed(6)}, ${state.simLng.toFixed(6)}`);
        elSetText('#debug-speed', speed !== null && speed !== undefined ? `${speed.toFixed(2)} m/s` : 'N/A');
        elSetText('#debug-accuracy', accuracy !== null && accuracy !== undefined ? `${accuracy.toFixed(1)}m` : 'N/A');
        elSetText('#debug-heading', heading !== null && heading !== undefined ? `${heading}°` : 'N/A');
      } else {
        elSetText('#debug-gps-time', timestamp);
        elSetText('#debug-coords', `${state.simLat.toFixed(6)}, ${state.simLng.toFixed(6)}`);
      }

      updateDetailsMapPartnerMarker();

      const now = Date.now();
      
      // Battery Optimization: Ignore noisy GPS signals (accuracy > 100m)
      if (accuracy !== null && accuracy > 100) {
        console.warn(`[GPS FILTER DISCARD] Discarded due to low accuracy: ${accuracy}m (> 100m limit)`);
        return;
      }

      // Check distance moved since last upload (in meters)
      let movedDistance = 0;
      if (lastLatitude !== null && lastLongitude !== null) {
        movedDistance = getDistanceInKm(lastLatitude, lastLongitude, state.simLat, state.simLng) * 1000;
      }

      // Enforce battery & network optimization filters (20m movement or 20s elapsed)
      const disableFilters = false; 
      
      const shouldUpload = disableFilters ||
                           lastLatitude === null || 
                           movedDistance >= 20 || 
                           (now - lastGpsSentTime >= 20000 && movedDistance >= 2);

      if (!shouldUpload) {
        console.log(`[GPS FILTER DISCARD] Discarded because movement (${movedDistance.toFixed(1)}m) and time elapsed did not meet threshold.`);
        return;
      }

      console.log(`[GPS FILTER ACCEPT] Uploading coordinates: Lat: ${state.simLat}, Lng: ${state.simLng} | Delta movement: ${movedDistance.toFixed(1)}m`);

      lastGpsSentTime = now;
      lastLatitude = state.simLat;
      lastLongitude = state.simLng;

        let etaStr = 'N/A';
        if (state.customerCoords && state.customerCoords.lat) {
          const dist = getDistanceInKm(state.simLat, state.simLng, state.customerCoords.lat, state.customerCoords.lng);
          const mins = Math.max(1, Math.round((dist / 30) * 60)); // 30 km/h average speed
          etaStr = mins + " mins";
        }

        let batteryPct = null;
        if (navigator.getBattery) {
          try {
            const battery = await navigator.getBattery();
            batteryPct = Math.round(battery.level * 100);
            if (localStorage.getItem('DEBUG_GPS') === 'true') {
              elSetText('#debug-battery', `${batteryPct}%`);
            }
          } catch (e) {}
        }

        const payload = {
          latitude: state.simLat,
          longitude: state.simLng,
          eta: etaStr,
          battery: batteryPct,
          speed: speed !== null && speed !== undefined ? speed : undefined,
          accuracy: accuracy !== null && accuracy !== undefined ? accuracy : undefined,
          heading: heading !== null && heading !== undefined ? heading : undefined,
          timestamp: timestamp
        };

        // If we are offline or have items in the cache, queue it to maintain order
        const cache = JSON.parse(localStorage.getItem('ops_gps_cache') || '[]');
        if (!navigator.onLine || cache.length > 0) {
          cacheGpsUpdate(payload);
          if (navigator.onLine) {
            await syncCachedGps();
          }
          return;
        }

        try {
          const response = await apiFetch('/gps/update', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          if (localStorage.getItem('DEBUG_GPS') === 'true') {
            elSetText('#debug-api-upload', `Success (200) at ${new Date().toLocaleTimeString()}`);
            if (response && response.lastUpdated) {
              elSetText('#debug-db-update', new Date(response.lastUpdated).toLocaleTimeString());
            } else {
              elSetText('#debug-db-update', new Date().toLocaleTimeString());
            }
          }
          await syncCachedGps();
        } catch (err) {
          console.error('GPS telemetry sync error:', err.message);
          cacheGpsUpdate(payload);
          if (localStorage.getItem('DEBUG_GPS') === 'true') {
            elSetText('#debug-api-upload', `Failed: ${err.message}`);
          }
        }
      };

    const onGpsError = (error) => {
      console.error('GPS tracking error:', error);
      if (error.code === error.PERMISSION_DENIED) {
        showToast('Location permission denied. Real GPS is required to be On Duty.', 'error');
        elSetProp('#duty-toggle', 'checked', false);
        state.dutyOn = false;
        localStorage.setItem('ops_duty', 'false');
        updateDutyStatusUI();
        stopGpsSimulation();
      } else {
        showToast('GPS Signal weak. Retrying location lock...');
      }
    };

    state.gpsWatchId = navigator.geolocation.watchPosition(onGpsSuccess, onGpsError, options);
  }

  function stopGpsSimulation() {
    if (state.gpsWatchId) {
      navigator.geolocation.clearWatch(state.gpsWatchId);
      state.gpsWatchId = null;
    }
  }

  // --- WAREHOUSE AUDITS PORTAL ---
  async function loadWarehouseOrders() {
    try {
      const orders = await apiFetch('/warehouse/orders');
      state.whOrders = orders;
      elSetText('#wh-orders-count', orders.length);
      
      renderWarehouseOrders();
    } catch (err) {
      showToast('Warehouse fetch error: ' + err.message, 'error');
    }
  }

  function renderWarehouseOrders() {
    const container = $('#wh-orders-list');
    if (!container) return;

    const whSearch = $('#wh-search');
    const query = whSearch ? whSearch.value : '';
    const filtered = filterOrdersBySearch(state.whOrders, query);

    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-jobs">No audit-ready orders.</div>`;
      elAddClass('#wh-active', 'hidden');
      elRemoveClass('#wh-fallback', 'hidden');
      return;
    }

    container.innerHTML = filtered.map(o => {
      const isSelected = o._id === state.selectedWhOrderId;
      const partnerName = o.partnerId ? o.partnerId.name : 'Unknown';
      const itemsCount = 1 + (o.extraDevices ? o.extraDevices.length : 0);
      
      return `
        <div class="job-item ${isSelected ? 'active' : ''}" onclick="selectWarehouseOrder('${o._id}')">
          <div class="job-item-header">
            <span class="job-po">${o.orderId}</span>
            <span class="job-status-badge ${o.status}">${o.status}</span>
          </div>
          <div class="job-customer">Agent: ${partnerName}</div>
          <div class="job-address">${itemsCount} Total Device(s) collected</div>
        </div>
      `;
    }).join('');

    if (state.selectedWhOrderId) {
      const current = state.whOrders.find(o => o._id === state.selectedWhOrderId);
      if (current) {
        showWarehouseDetails(current);
      } else {
        state.selectedWhOrderId = null;
        elAddClass('#wh-active', 'hidden');
        elRemoveClass('#wh-fallback', 'hidden');
      }
    } else {
      elAddClass('#wh-active', 'hidden');
      elRemoveClass('#wh-fallback', 'hidden');
    }
  }

  window.filterWarehouseOrders = () => {
    renderWarehouseOrders();
  };

  function filterOrdersBySearch(orders, query) {
    if (!query) return orders;
    const q = query.trim().toLowerCase();
    return orders.filter(o => o.orderId.toLowerCase().includes(q));
  }

  window.selectWarehouseOrder = (id) => {
    state.selectedWhOrderId = id;
    renderWarehouseOrders();
  };

  // Holds temporary states of devices status during audit
  let whDevicesAuditStatus = [];

  function showWarehouseDetails(order) {
    elAddClass('#wh-fallback', 'hidden');
    elRemoveClass('#wh-active', 'hidden');

    elSetText('#wh-det-po', order.orderId);
    elSetText('#wh-det-partner', order.partnerId ? `${order.partnerId.name} (${order.partnerId.employeeId})` : 'N/A');
    elSetText('#wh-det-distance', `${order.distanceTravelled || 0} km`);
    elSetVal('#wh-notes', order.warehouseNotes || '');

    // Collate devices list (original device + extra devices)
    whDevicesAuditStatus = [];

    // 1. Add Original device
    const req = order.requestId || {};
    whDevicesAuditStatus.push({
      uid: 'original',
      brand: req.brand || 'Unknown',
      model: req.model || 'Unknown',
      storage: req.storage || '—',
      condition: 'Customer Registered',
      estimatedPrice: req.priceNum || 0,
      photoUrl: '/uploads/default-device.png',
      status: 'received' // default
    });

    // 2. Add Extra devices
    if (order.extraDevices) {
      order.extraDevices.forEach((d, idx) => {
        whDevicesAuditStatus.push({
          uid: `extra_${idx}`,
          brand: d.brand,
          model: d.model,
          storage: d.storage,
          condition: d.condition,
          estimatedPrice: d.estimatedPrice,
          imei: d.imei,
          photoUrl: d.photoUrl,
          status: 'received' // default
        });
      });
    }

    // Apply pre-existing status if already audited
    if (order.warehouseVerified && order.warehouseDevices && order.warehouseDevices.length > 0) {
      // Find matches by array indices
      order.warehouseDevices.forEach((d, idx) => {
        if (whDevicesAuditStatus[idx]) {
          whDevicesAuditStatus[idx].status = d.status;
        }
      });
    }

    renderWarehouseAuditDevices();
  }

  function renderWarehouseAuditDevices() {
    const container = $('#wh-audit-devices-list');
    if (!container) return;
    container.innerHTML = whDevicesAuditStatus.map((d, index) => `
      <div class="audit-item">
        <div class="audit-item-header">
          <div>
            <h4 style="font-weight:700;">${d.brand} ${d.model}</h4>
            <span style="font-size:0.75rem; color:var(--primary); font-weight:600;">
              ${d.uid === 'original' ? '⭐️ Original Request Device' : `📱 Extra Device ${index}`}
            </span>
          </div>
          
          <div class="audit-status-selector">
            <button class="audit-status-btn received ${d.status === 'received' ? 'active' : ''}" onclick="toggleAuditStatus(${index}, 'received')">Received</button>
            <button class="audit-status-btn missing ${d.status === 'missing' ? 'active' : ''}" onclick="toggleAuditStatus(${index}, 'missing')">Missing</button>
            <button class="audit-status-btn damaged ${d.status === 'damaged' ? 'active' : ''}" onclick="toggleAuditStatus(${index}, 'damaged')">Damaged</button>
          </div>
        </div>
        
        <div class="audit-meta-grid">
          <div class="audit-meta-item"><span>Storage:</span> ${d.storage}</div>
          <div class="audit-meta-item"><span>Condition:</span> ${d.condition}</div>
          <div class="audit-meta-item"><span>Price:</span> ₹${d.estimatedPrice.toLocaleString()}</div>
          <div class="audit-meta-item"><span>IMEI:</span> ${d.imei || '—'}</div>
        </div>
      </div>
    `).join('');
  }

  window.toggleAuditStatus = (index, status) => {
    if (whDevicesAuditStatus[index]) {
      whDevicesAuditStatus[index].status = status;
      renderWarehouseAuditDevices();
    }
  };

  window.submitWarehouseAudit = async () => {
    if (!state.selectedWhOrderId) return;
    const notes = $('#wh-notes')?.value?.trim() || '';

    try {
      await apiFetch(`/warehouse/orders/${state.selectedWhOrderId}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          warehouseDevices: whDevicesAuditStatus,
          warehouseNotes: notes
        })
      });

      showToast('Warehouse audit submitted successfully!');
      state.selectedWhOrderId = null;
      loadWarehouseOrders();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // --- INITIALIZATION ---
  (function init() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('DEBUG_GPS')) {
      localStorage.setItem('DEBUG_GPS', urlParams.get('DEBUG_GPS'));
    }
    const isDebugGps = localStorage.getItem('DEBUG_GPS') === 'true';
    const debugPanel = $('#gps-debug-panel');
    if (debugPanel) {
      debugPanel.style.display = isDebugGps ? 'block' : 'none';
    }

    if (state.token && state.user) {
      startEventSource();
      showDashboard();
    } else {
      elRemoveClass('#auth-screen', 'hidden');
    }
  })();

})();
