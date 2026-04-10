/* ========== SCRAPME APP.JS — backend-powered ========== */
(() => {
  'use strict';

  const API_BASE = 'https://scrapme-backend.onrender.com/api';

  // ─── STATE ──────────────────────────────────────────
  let currentUser = null;
  let sellData = { brand: '', model: '', storage: '', sellerName: '', phone: '', address: '' };
  let timerInterval = null;
  let isSubmitting = false; // Prevent duplicate form submissions

  // ─── DOM REFS ───────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const header = $('#main-header');
  const hamburgerBtn = $('#hamburger-btn');
  const mobileMenu = $('#mobile-menu');
  const authModal = $('#auth-modal');
  const authClose = $('#auth-close');
  const tabLogin = $('#tab-login');
  const tabSignup = $('#tab-signup');
  const loginForm = $('#login-form');
  const signupForm = $('#signup-form');
  const sellModal = $('#sell-modal');
  const sellClose = $('#sell-close');

  // ─── API HELPER ─────────────────────────────────────
  async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('dp_token');
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = API_BASE + path;
    console.log(`API Request: ${options.method || 'GET'} ${url}`, options.body ? JSON.parse(options.body) : '');

    try {
      const res = await fetch(url, { ...options, headers });
      console.log(`API Response: ${res.status} ${res.statusText} for ${url}`);

      // Try to parse JSON, but handle non-JSON responses
      let data;
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.warn(`Non-JSON response from ${url}:`, text.substring(0, 200));
        throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}`);
      }

      if (!res.ok) {
        // For validation errors, provide more detailed message
        if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
          const errorMessages = data.errors.map(err => err.message).join(', ');
          throw new Error(`Validation failed: ${errorMessages}`);
        }
        throw new Error(data.message || `Request failed with status ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`API Error for ${url}:`, err.message, err);
      // Re-throw with more context if it's a network error
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error(`Network error: Cannot connect to server. Please check your internet connection and try again.`);
      }
      throw err;
    }
  }

  // ─── HELPERS ────────────────────────────────────────
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function playSuccessSound() {
    try {
      // Check if audio context is available
      if (!window.AudioContext && !window.webkitAudioContext) {
        playHTML5Fallback();
        return;
      }

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Handle suspended state (requires user interaction in some browsers)
      if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
          playOscillatorSound(audioContext);
        }).catch(() => {
          playHTML5Fallback();
        });
      } else {
        playOscillatorSound(audioContext);
      }
    } catch (error) {
      console.warn('Audio playback failed:', error);
      // Try HTML5 fallback
      playHTML5Fallback();
    }
  }

  function playOscillatorSound(audioContext) {
    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Pleasant success tone (800Hz)
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.type = 'sine';

      // Volume envelope (fade in/out)
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);

      setTimeout(() => {
        oscillator.disconnect();
        gainNode.disconnect();
      }, 600);
    } catch (e) {
      playHTML5Fallback();
    }
  }

  function playHTML5Fallback() {
    try {
      // Create a simple beep using Web Audio API with simpler settings
      if (window.AudioContext || window.webkitAudioContext) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);

        setTimeout(() => {
          oscillator.disconnect();
          gainNode.disconnect();
        }, 200);
      } else {
        // Final fallback - try using a data URL beep
        const beep = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ');
        beep.volume = 0.2;
        beep.play().catch(() => { });
      }
    } catch (e) {
      // Audio completely unsupported - silent fail
    }
  }

  function openModal(modal) { modal.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal(modal) { modal.classList.remove('open'); document.body.style.overflow = ''; }
  function closeMobileMenu() { mobileMenu.classList.remove('open'); hamburgerBtn.classList.remove('active'); }

  // ─── HEADER SCROLL ──────────────────────────────────
  window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 10));

  // ─── HAMBURGER ──────────────────────────────────────
  hamburgerBtn.addEventListener('click', () => {
    hamburgerBtn.classList.toggle('active');
    mobileMenu.classList.toggle('open');
  });

  // ─── NAV LINKS ──────────────────────────────────────
  function handleNavClick(e) {
    const section = e.currentTarget.getAttribute('data-section');
    closeMobileMenu();
    if (section === 'profile') {
      if (!currentUser) { openAuthModal('login'); return; }
      showSection('profile');
      return;
    }
    showSection('home');
    setTimeout(() => { const el = document.getElementById(section); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 50);
  }
  $$('.nav-link, .mobile-link').forEach(link => link.addEventListener('click', handleNavClick));

  // ─── SHOW SECTIONS ──────────────────────────────────
  function showSection(name) {
    const profileSection = $('#profile');
    const mainSections = [$('#home'), $$('.brand-marquee')[0], $('#how-it-works'), $$('.features')[0],
    $('#about-us'), $$('.testimonials')[0], $$('.cta-section')[0], $$('.footer')[0]];

    if (name === 'profile') {
      mainSections.forEach(s => { if (s) s.style.display = 'none'; });
      profileSection.style.display = 'block';
      loadAndRenderProfile();
    } else {
      profileSection.style.display = 'none';
      mainSections.forEach(s => { if (s) s.style.display = ''; });
    }
    $$('.nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = $(`.nav-link[data-section="${name}"]`);
    if (activeLink) activeLink.classList.add('active');
  }

  // ─── AUTH UI ────────────────────────────────────────
  function updateAuthUI() {
    const isLoggedIn = !!currentUser;
    [$('#header-login-btn'), $('#header-signup-btn'), $('#mobile-auth-actions')]
      .forEach(el => { if (el) el.style.display = isLoggedIn ? 'none' : ''; });
    $('#user-menu').style.display = isLoggedIn ? 'block' : 'none';
    [$('#nav-profile'), $('#mobile-nav-profile')].forEach(el => { if (el) el.style.display = isLoggedIn ? '' : 'none'; });
    $('#mobile-user-actions').style.display = isLoggedIn ? 'flex' : 'none';
    if (isLoggedIn) {
      $('#user-initial').textContent = currentUser.name.charAt(0).toUpperCase();
      $('#dropdown-name').textContent = currentUser.name;
      $('#dropdown-email').textContent = currentUser.email;
    }
  }

  // ─── AUTH MODAL ─────────────────────────────────────
  const forgotForm = $('#forgot-form');
  const resetForm = $('#reset-form');
  let resetEmail = ''; // store email between forgot → reset steps

  function openAuthModal(tab = 'login') { openModal(authModal); switchAuthTab(tab); }
  function switchAuthTab(tab) {
    tabLogin.classList.toggle('active', tab === 'login');
    tabSignup.classList.toggle('active', tab === 'signup');
    loginForm.style.display = tab === 'login' ? 'block' : 'none';
    signupForm.style.display = tab === 'signup' ? 'block' : 'none';
    forgotForm.style.display = tab === 'forgot' ? 'block' : 'none';
    resetForm.style.display = tab === 'reset' ? 'block' : 'none';
  }

  $('#header-login-btn').addEventListener('click', () => openAuthModal('login'));
  $('#header-signup-btn').addEventListener('click', () => openAuthModal('signup'));
  $('#mobile-login-btn').addEventListener('click', () => { closeMobileMenu(); openAuthModal('login'); });
  $('#mobile-signup-btn').addEventListener('click', () => { closeMobileMenu(); openAuthModal('signup'); });
  authClose.addEventListener('click', () => closeModal(authModal));
  tabLogin.addEventListener('click', () => switchAuthTab('login'));
  tabSignup.addEventListener('click', () => switchAuthTab('signup'));
  $('#switch-to-signup').addEventListener('click', (e) => { e.preventDefault(); switchAuthTab('signup'); });
  $('#switch-to-login').addEventListener('click', (e) => { e.preventDefault(); switchAuthTab('login'); });
  $('#switch-to-forgot').addEventListener('click', (e) => { e.preventDefault(); switchAuthTab('forgot'); });
  $('#forgot-back-to-login').addEventListener('click', (e) => { e.preventDefault(); switchAuthTab('login'); });
  $('#reset-back-to-forgot').addEventListener('click', (e) => { e.preventDefault(); switchAuthTab('forgot'); });

  // Forgot password submit
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#forgot-email').value.trim();
    if (!email) { showToast('Please enter your email', 'error'); return; }
    try {
      const data = await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      resetEmail = email;
      showToast('Reset code sent! Check server console for the code.');
      switchAuthTab('reset');
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Reset password submit
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('#reset-code').value.trim();
    const newPassword = $('#reset-new-password').value.trim();
    if (!code || !newPassword) { showToast('Please fill all fields', 'error'); return; }
    if (newPassword.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
    // Validate password requirements: uppercase, lowercase, number
    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    if (!hasUpperCase || !hasLowerCase || !hasNumber) {
      showToast('Password must contain uppercase, lowercase letters and a number', 'error');
      return;
    }
    try {
      await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email: resetEmail, code, newPassword }) });
      showToast('Password reset successful! Please login.');
      resetForm.reset();
      switchAuthTab('login');
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Login submit - with duplicate request prevention
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Prevent multiple submissions
    if (isSubmitting) return;
    isSubmitting = true;

    const email = $('#login-email').value.trim();
    const password = $('#login-password').value.trim();

    // Validation
    if (!email || !password) {
      showToast('Please fill all fields', 'error');
      isSubmitting = false;
      return;
    }

    // Get button and update UI
    const button = $('#login-btn');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Logging in...';

    try {
      const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      localStorage.setItem('dp_token', data.token);
      currentUser = data.user;
      closeModal(authModal);
      updateAuthUI();
      showToast(`Welcome back, ${data.user.name}!`);
      loginForm.reset();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      // Always reset button state
      isSubmitting = false;
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  // Signup submit - with duplicate request prevention
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Prevent multiple submissions
    if (isSubmitting) return;
    isSubmitting = true;

    // Get form data
    const name = $('#signup-name').value.trim();
    const email = $('#signup-email').value.trim();
    const password = $('#signup-password').value.trim();

    // Validation
    if (!name || !email || !password) {
      showToast('Please fill all fields', 'error');
      isSubmitting = false;
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      isSubmitting = false;
      return;
    }

    // Validate password requirements: uppercase, lowercase, number
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasUpperCase || !hasLowerCase || !hasNumber) {
      showToast('Password must contain uppercase, lowercase letters and a number', 'error');
      isSubmitting = false;
      return;
    }

    // Get button and update UI
    const button = $('#signup-btn');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Creating Account...';

    try {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      });

      localStorage.setItem('dp_token', data.token);
      currentUser = data.user;
      closeModal(authModal);
      updateAuthUI();
      showToast(`Account created! Welcome, ${data.user.name}!`);
      signupForm.reset();

    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      // Always reset button state
      isSubmitting = false;
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  // User menu
  $('#user-avatar-btn').addEventListener('click', (e) => { e.stopPropagation(); $('#user-dropdown').classList.toggle('show'); });
  document.addEventListener('click', () => $('#user-dropdown').classList.remove('show'));
  $('#dropdown-profile').addEventListener('click', (e) => { e.preventDefault(); showSection('profile'); $('#user-dropdown').classList.remove('show'); });
  $('#dropdown-sell').addEventListener('click', (e) => { e.preventDefault(); $('#user-dropdown').classList.remove('show'); openSellModal(); });
  $('#dropdown-logout').addEventListener('click', (e) => { e.preventDefault(); logout(); });
  $('#mobile-logout-btn').addEventListener('click', () => { closeMobileMenu(); logout(); });

  function logout() {
    currentUser = null;
    localStorage.removeItem('dp_token');
    updateAuthUI();
    showSection('home');
    showToast('Logged out successfully');
    $('#user-dropdown').classList.remove('show');
  }

  // ─── SELL PHONE FLOW ───────────────────────────────
  function openSellModal() {
    if (!currentUser) { openAuthModal('login'); showToast('Please login first to sell your phone', 'error'); return; }
    resetSellForm();
    openModal(sellModal);
    goToStep(1);
  }

  sellClose.addEventListener('click', () => { closeModal(sellModal); if (timerInterval) clearInterval(timerInterval); });

  ['hero-sell-btn', 'cta-sell-btn', 'profile-sell-btn', 'mobile-sell-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => { closeMobileMenu(); openSellModal(); });
  });

  $('#hero-how-btn').addEventListener('click', () => document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' }));

  function resetSellForm() {
    sellData = { brand: '', model: '', storage: '', sellerName: '', phone: '', address: '' };
    $('#phone-brand').value = '';
    $('#phone-model').value = '';
    $$('input[name="storage"]').forEach(r => r.checked = false);
    $('#seller-name').value = currentUser ? currentUser.name : '';
    $('#seller-phone').value = '';
    $('#seller-address').value = '';
    if (timerInterval) clearInterval(timerInterval);
  }

  function goToStep(step) {
    $$('.sell-step').forEach(s => s.style.display = 'none');
    let stepId;
    if (step === 5) stepId = 'sell-step-wait';
    else if (step === 6) stepId = 'sell-step-result';
    else stepId = 'sell-step-' + step;

    const stepEl = document.getElementById(stepId);
    if (stepEl) stepEl.style.display = 'flex';
    else { console.error('Step not found:', stepId); return; }

    $$('.progress-step').forEach(ps => {
      const s = parseInt(ps.dataset.step);
      ps.classList.remove('active', 'completed');
      if (s < step) ps.classList.add('completed');
      else if (s === step) ps.classList.add('active');
    });
    for (let i = 1; i <= 3; i++) {
      const fill = document.getElementById('pline-' + i);
      if (fill) fill.style.width = (i < step) ? '100%' : '0%';
    }
    const pw = $('.progress-bar-wrapper');
    if (pw) pw.style.display = (step >= 5) ? 'none' : 'block';

    if (step === 3) { $('#instant-price-card').style.display = 'none'; showPriceLoading(); }

    // Play success sound when showing the result step (step 6)
    if (step === 6) {
      setTimeout(() => {
        playSuccessSound();
      }, 300); // Small delay to ensure UI is visible first
    }

    const modalEl = $('.sell-modal');
    if (modalEl) modalEl.scrollTop = 0;
  }

  $('#step1-next').addEventListener('click', () => {
    const brand = $('#phone-brand').value;
    const model = $('#phone-model').value.trim();
    if (!brand) { showToast('Please select a brand', 'error'); return; }
    if (!model) { showToast('Please enter the model name', 'error'); return; }
    sellData.brand = brand; sellData.model = model; goToStep(2);
  });

  $('#step2-next').addEventListener('click', () => {
    const selected = document.querySelector('input[name="storage"]:checked');
    if (!selected) { showToast('Please select a storage capacity', 'error'); return; }
    sellData.storage = selected.value; goToStep(3);
  });
  $('#step2-back').addEventListener('click', () => goToStep(1));

  function showPriceLoading() {
    const overlay = $('#price-loading-overlay');
    const bar = $('#price-loading-bar');
    bar.style.transition = 'none'; bar.style.width = '0%';
    overlay.style.display = 'flex';
    $('#instant-price-card').style.display = 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = 'width 15s linear'; bar.style.width = '100%';
    }));
    setTimeout(() => { overlay.style.display = 'none'; showInstantPrice(); }, 15000);
  }

  function getFixedPrice(storage) {
    const prices = { '32GB': 400, '64GB': 700, '128GB': 1000, '256GB': 1400, '512GB': 2000, '1TB': 2500 };
    return prices[storage] || 500;
  }

  function showInstantPrice() {
    const card = $('#instant-price-card');
    const amount = $('#instant-price-amount');
    if (!card || !sellData.storage) return;
    amount.textContent = '₹' + getFixedPrice(sellData.storage).toLocaleString('en-IN');
    card.style.display = 'flex';

    // Play success sound when instant price is shown
    setTimeout(() => {
      playSuccessSound();
    }, 300);
  }

  $('#step3-next').addEventListener('click', () => goToStep(4));
  $('#step3-back').addEventListener('click', () => goToStep(2));

  $('#step4-submit').addEventListener('click', async () => {
    const name = $('#seller-name').value.trim();
    const phone = $('#seller-phone').value.trim();
    const address = $('#seller-address').value.trim();
    if (!name) { showToast('Please enter your full name', 'error'); return; }
    if (!phone) { showToast('Please enter your phone number', 'error'); return; }
    if (!address) { showToast('Please enter your pickup address', 'error'); return; }
    sellData.sellerName = name; sellData.phone = phone; sellData.address = address;
    try {
      await submitAndShowResult();
    } catch (err) {
      console.error('Submit error:', err);
      showToast(err.message || 'Something went wrong. Please try again.', 'error');
    }
  });
  $('#step4-back').addEventListener('click', () => goToStep(3));

  async function submitAndShowResult() {
    // Validate required fields
    const required = ['brand', 'model', 'storage', 'sellerName', 'phone', 'address'];
    const missing = required.filter(field => !sellData[field] || sellData[field].trim() === '');
    if (missing.length > 0) {
      throw new Error(`Please fill in: ${missing.join(', ')}`);
    }

    // Ensure user is authenticated
    if (!currentUser) {
      throw new Error('Please login to submit a request');
    }

    const price = getFixedPrice(sellData.storage);
    const formattedPrice = '₹' + price.toLocaleString('en-IN');

    $('#result-amount').textContent = formattedPrice;
    $('#result-model').textContent = `${sellData.brand} ${sellData.model} (${sellData.storage})`;
    $('#result-phone').textContent = sellData.phone;
    $('#result-address').textContent = sellData.address;

    try {
      await apiFetch('/requests', {
        method: 'POST',
        body: JSON.stringify({
          brand: sellData.brand, model: sellData.model, storage: sellData.storage,
          sellerName: sellData.sellerName, phone: sellData.phone, address: sellData.address
        })
      });
      goToStep(6);
    } catch (error) {
      // Re-throw with more context
      throw new Error(`Submission failed: ${error.message}`);
    }
  }

  $('#result-done').addEventListener('click', () => { closeModal(sellModal); showToast('Your sell request has been recorded! 🎉'); });

  // ─── PROFILE (API-powered) ──────────────────────────
  async function loadAndRenderProfile() {
    if (!currentUser) return;
    $('#profile-avatar-large').textContent = currentUser.name.charAt(0).toUpperCase();
    $('#profile-name').textContent = currentUser.name;
    $('#profile-email').textContent = currentUser.email;

    const list = $('#requests-list');
    list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">Loading...</div>`;

    try {
      const requests = await apiFetch('/requests/mine');
      if (requests.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><h4>No Requests Yet</h4><p>You haven't submitted any sell requests. Click "Sell My Phone" to get started!</p></div>`;
      } else {
        const statusText = { pending: '⏳ Pending', evaluated: '📋 Evaluated', approved: '✅ Approved', completed: '🎉 Completed', rejected: '❌ Rejected' };
        list.innerHTML = requests.map(r => {
          const msgHtml = r.lastAdminMessage
            ? `<div class="request-message"><span class="msg-badge">💬 Admin:</span> ${r.lastAdminMessage.text}</div>` : '';
          return `<div class="request-card">
            <div class="request-info">
              <h4>${r.brand} ${r.model} · ${r.storage}</h4>
              <p>Submitted on ${r.date || new Date(r.createdAt).toLocaleDateString('en-IN')}</p>
              ${msgHtml}
            </div>
            <span class="request-status status-${r.status}">${statusText[r.status] || r.status}</span>
            <span class="request-price">${r.price}</span>
          </div>`;
        }).join('');
      }
    } catch (err) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h4>Could not load requests</h4><p>${err.message}</p></div>`;
    }
  }

  // ─── MODAL OVERLAY CLICKS ──────────────────────────
  authModal.addEventListener('click', (e) => { if (e.target === authModal) closeModal(authModal); });
  sellModal.addEventListener('click', (e) => { if (e.target === sellModal) { closeModal(sellModal); if (timerInterval) clearInterval(timerInterval); } });

  // ─── INIT ──────────────────────────────────────────
  async function init() {
    const token = localStorage.getItem('dp_token');
    if (token) {
      try { currentUser = await apiFetch('/auth/me'); }
      catch { localStorage.removeItem('dp_token'); currentUser = null; }
    }
    updateAuthUI();
  }

  // Terms & Conditions Modal
  const termsModal = document.getElementById('terms-modal');
  const termsLink = document.getElementById('terms-link');
  const termsClose = document.getElementById('terms-close');
  const termsAgree = document.getElementById('terms-agree');

  if (termsLink && termsModal) {
    termsLink.addEventListener('click', (e) => {
      e.preventDefault();
      termsModal.style.display = 'flex';
    });

    termsClose.addEventListener('click', () => {
      termsModal.style.display = 'none';
    });

    termsAgree.addEventListener('click', () => {
      termsModal.style.display = 'none';
      showToast('Terms acknowledged', 'success');
    });

    // Close modal when clicking outside
    termsModal.addEventListener('click', (e) => {
      if (e.target === termsModal) {
        termsModal.style.display = 'none';
      }
    });
  }

  init();
})();
