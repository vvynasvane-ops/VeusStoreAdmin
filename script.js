// ════════════════════════════════════════════════════
//  FIREBASE CONFIG
// ════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDGzpcAHboI2Ggj6g49jcf1x7so8J3F0qk",
    authDomain: "vvynasapks.firebaseapp.com",
    projectId: "vvynasapks",
    storageBucket: "vvynasapks.firebasestorage.app",
    messagingSenderId: "503135907630",
    appId: "1:503135907630:web:173b8bca54968830d8d4bf",
    measurementId: "G-37ZZNK561M"
};

// ════════════════════════════════════════════════════
//  DETECT DEMO MODE (config not set yet)
// ════════════════════════════════════════════════════
const DEMO_MODE = FIREBASE_CONFIG.apiKey === "YOUR_API_KEY";

// ── ADMIN BUILD VERSION ──
// Bump this whenever the admin panel ships a change. When it doesn't match
// the value the browser last saw, the red badge on the Admin button lights
// up to flag "something's new here" — it clears once the admin opens the panel.
const ADMIN_VERSION = 'v1.1';

// ── STATE ──
let apps = [];          // live-synced from Firebase
let currentFilter = 'all';
let selectedEmoji = '📱';
let currentAppId = null;
let currentDownloadUrl = '';
let dbRef = null;
let settingsRef = null;
let isAdmin = false;
let paywallInitialCheckDone = false;

// Paywall / support-ad state (synced from Firebase settings/paywall, or localStorage in demo mode)
let paywallSettings = {
  enabled: false,
  title: '💛 SUPPORT VVYNAS VANE',
  message: 'If you enjoy using this app, consider sending a small tip to keep it alive and updated. Totally optional — the store stays free either way.',
  mpesaNumber: '',
  paypalAddress: ''
};

const EMOJIS = ['📱','🎮','🛠','🎵','📷','🌐','💬','📊','🔒','🚀','⚡','🎯','🌍','💡','🎨','📚','🏃','🎬','🛒','🔧','💎','🌟','🤖','🧩','📡','🎪','🔑','💰','🏆','🎭'];

// ── ADMIN CONFIG ──
const ADMIN_EMAIL      = 'simonmainamwangi2023@gmail.com';
const EMAILJS_SERVICE_ID  = 'service_mgrwinh';
const EMAILJS_TEMPLATE_ID = 'template_x1i7skk';
const EMAILJS_PUBLIC_KEY  = 'lYSZa1-dirD6Yl8JA';

let pendingOtp = null;
let otpExpiry  = null;
let otpCooldown = false;

// ════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════
function init() {
  buildEmojiPicker();
  buildStarfield();
  loadSettings();
  checkAdminUpdateBadge();

  if (typeof emailjs !== 'undefined') {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  }

  if (DEMO_MODE) {
    // Run on localStorage so the page still works before Firebase is configured
    showSyncBar('⚠ DEMO MODE — data is local only. Configure Firebase for cross-device sync.', 'error', 0);
    apps = JSON.parse(localStorage.getItem('vvynas_apps') || '[]');
    renderApps();
    loadPaywallDemo();
  } else {
    initFirebase();
  }
}

// ── ADMIN UPDATE BADGE ──
// Shows a small red dot on the Admin nav button when the shipped
// ADMIN_VERSION is newer than the one this browser last acknowledged.
function checkAdminUpdateBadge() {
  const seen = localStorage.getItem('vvynas_admin_version_seen');
  const badge = document.getElementById('adminUpdateBadge');
  if (!badge) return;
  badge.classList.toggle('hidden', seen === ADMIN_VERSION);
}

function acknowledgeAdminUpdate() {
  localStorage.setItem('vvynas_admin_version_seen', ADMIN_VERSION);
  const badge = document.getElementById('adminUpdateBadge');
  if (badge) badge.classList.add('hidden');
}

// ── STARFIELD ──
function buildStarfield() {
  const sf = document.getElementById('starfield');
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 2 + 0.5;
    s.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;top:${Math.random()*100}%;animation-duration:${2+Math.random()*4}s;animation-delay:${Math.random()*4}s;opacity:${Math.random()*0.4+0.1};`;
    sf.appendChild(s);
  }
}

// ── EMOJI PICKER ──
function buildEmojiPicker() {
  const p = document.getElementById('emojiPicker');
  p.innerHTML = EMOJIS.map(e => `<div class="emoji-opt${e===selectedEmoji?' selected':''}" onclick="selectEmoji('${e}',this)">${e}</div>`).join('');
}

function selectEmoji(emoji, el) {
  selectedEmoji = emoji;
  document.querySelectorAll('.emoji-opt').forEach(x=>x.classList.remove('selected'));
  el.classList.add('selected');
}

// ════════════════════════════════════════════════════
//  FIREBASE — realtime listeners
// ════════════════════════════════════════════════════
function initFirebase() {
  try {
    const fbApp = firebase.initializeApp(FIREBASE_CONFIG);
    const db = firebase.database(fbApp);
    dbRef = db.ref('apps');
    settingsRef = db.ref('settings/paywall');

    showSyncBar('⏳ CONNECTING…', 'syncing', 0);

    // Connection state monitor
    db.ref('.info/connected').on('value', snap => {
      if (snap.val() === true) {
        showSyncBar('● LIVE — all changes sync across devices', 'connected', 3000);
      } else {
        showSyncBar('○ OFFLINE — reconnecting…', 'error', 0);
      }
    });

    // Real-time listener — fires on ANY change from ANY device
    dbRef.on('value', snap => {
      const data = snap.val();
      if (data) {
        // Firebase returns an object keyed by push-IDs; convert to sorted array
        apps = Object.entries(data)
          .map(([fbKey, app]) => ({ ...app, fbKey }))
          .sort((a, b) => (b.added || '').localeCompare(a.added || ''));
      } else {
        apps = [];
      }
      renderApps();
    }, err => {
      console.error('Firebase read error:', err);
      showSyncBar('❌ DATABASE ERROR — check Firebase rules', 'error', 0);
    });

    // Paywall / support-ad settings listener
    settingsRef.on('value', snap => {
      const data = snap.val();
      if (data) paywallSettings = { ...paywallSettings, ...data };
      // Reflect current values in the admin editor if it's open
      populatePaywallAdminForm();
      // Show the popup once per page load/launch — not on every live edit
      if (!paywallInitialCheckDone) {
        paywallInitialCheckDone = true;
        maybeShowPaywall();
      }
    }, err => {
      console.error('Firebase settings read error:', err);
    });

  } catch (err) {
    console.error('Firebase init error:', err);
    showSyncBar('❌ FIREBASE CONFIG ERROR — check your config', 'error', 0);
  }
}

// ── SYNC BAR ──
let syncBarTimer = null;
function showSyncBar(msg, type, autohideMs) {
  const bar = document.getElementById('syncBar');
  bar.textContent = msg;
  bar.className = `show ${type}`;
  if (syncBarTimer) clearTimeout(syncBarTimer);
  if (autohideMs > 0) {
    syncBarTimer = setTimeout(() => { bar.classList.remove('show'); }, autohideMs);
  }
}

// ════════════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════════════
function renderApps() {
  const grid = document.getElementById('app-grid');
  const empty = document.getElementById('emptyState');
  const search = document.getElementById('searchInput').value.toLowerCase();

  let filtered = apps.filter(a => {
    const matchCat = currentFilter === 'all' || a.category === currentFilter;
    const matchSearch = !search || a.name.toLowerCase().includes(search) || (a.desc||'').toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  grid.innerHTML = filtered.length
    ? filtered.map((a, i) => appCard(a, i)).join('')
    : '';

  empty.classList.toggle('show', filtered.length === 0);

  document.getElementById('totalApps').textContent = apps.length;
  const cats = [...new Set(apps.map(a=>a.category).filter(Boolean))];
  document.getElementById('totalCats').textContent = cats.length || 0;
  rebuildFilters();
}

function appCard(a, i) {
  const tags = (a.tags || '').split(',').map(t=>t.trim()).filter(Boolean);
  const safeId = (a.id || a.fbKey || '').replace(/['"]/g, '');
  return `
  <div class="app-card" style="animation-delay:${i*0.06}s" onclick="openDetail('${safeId}')">
    <div class="card-banner"><span class="card-banner-icon">${a.icon}</span></div>
    <div class="card-body">
      <div class="app-icon-row">
        <div class="app-icon">${a.icon}</div>
        <div class="app-meta">
          <div class="app-name">${a.name}</div>
          <div class="app-dev">${a.dev || 'Vvynas Vane'}</div>
        </div>
      </div>
      <p class="app-desc">${a.desc || 'No description available.'}</p>
      ${tags.length ? `<div class="app-tags">${tags.slice(0,3).map(t=>`<span class="tag">${t}</span>`).join('')}</div>` : ''}
      <div class="card-footer">
        <div>
          <div class="app-size">${a.size || '—'}</div>
          <div class="app-version">${a.version || 'v1.0'}</div>
        </div>
        <button class="download-btn" onclick="event.stopPropagation();downloadApp('${safeId}')">⬇ APK</button>
      </div>
    </div>
  </div>`;
}

function rebuildFilters() {
  const cats = ['all', ...new Set(apps.map(a=>a.category).filter(Boolean))];
  const bar = document.getElementById('categoryFilters');
  bar.innerHTML = cats.map(c=>`<button class="filter-btn${c===currentFilter?' active':''}" onclick="setFilter('${c}',this)">${c==='all'?'All':c}</button>`).join('');
}

function setFilter(cat, el) {
  currentFilter = cat;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderApps();
}

function filterApps() { renderApps(); }

// ════════════════════════════════════════════════════
//  ADD APP
// ════════════════════════════════════════════════════
function openAddModal() {
  document.getElementById('addModal').classList.add('open');
}
function closeAddModal() {
  document.getElementById('addModal').classList.remove('open');
  clearForm();
}
function clearForm() {
  ['appName','appDev','appVersion','appSize','appCategory','appDesc','appTags','appUrl'].forEach(id=>{
    document.getElementById(id).value = '';
  });
  selectedEmoji = '📱';
  buildEmojiPicker();
  const btn = document.getElementById('publishBtn');
  btn.disabled = false;
  btn.textContent = '⬆ PUBLISH APP';
}

async function saveApp() {
  const name = document.getElementById('appName').value.trim();
  if (!name) { showToast('App name is required!'); return; }

  const app = {
    id: 'app_' + Date.now(),
    name,
    dev:      document.getElementById('appDev').value.trim()      || 'Vvynas Vane',
    version:  document.getElementById('appVersion').value.trim()  || 'v1.0',
    size:     document.getElementById('appSize').value.trim()     || 'Unknown',
    category: document.getElementById('appCategory').value.trim() || 'General',
    desc:     document.getElementById('appDesc').value.trim()     || 'No description.',
    tags:     document.getElementById('appTags').value.trim(),
    url:      document.getElementById('appUrl').value.trim(),
    icon:     selectedEmoji,
    added:    new Date().toISOString()
  };

  const btn = document.getElementById('publishBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Publishing…';

  if (DEMO_MODE) {
    apps.unshift(app);
    localStorage.setItem('vvynas_apps', JSON.stringify(apps));
    renderApps();
    closeAddModal();
    showToast('✅ App published (demo mode)!', true);
  } else {
    try {
      await dbRef.push(app);   // Firebase push → triggers real-time update on ALL devices
      closeAddModal();
      showToast('✅ App published — visible on all devices!', true);
    } catch (err) {
      console.error(err);
      showToast('❌ Failed to publish. Check connection.');
      btn.disabled = false;
      btn.textContent = '⬆ PUBLISH APP';
    }
  }
}

// ════════════════════════════════════════════════════
//  DETAIL MODAL
// ════════════════════════════════════════════════════
function findApp(id) {
  return apps.find(x => x.id === id || x.fbKey === id);
}

function openDetail(id) {
  const a = findApp(id);
  if (!a) return;
  currentAppId = id;
  currentDownloadUrl = a.url;

  document.getElementById('detailBannerIcon').textContent = a.icon;
  document.getElementById('detailIcon').textContent = a.icon;
  document.getElementById('detailName').textContent = a.name;
  document.getElementById('detailDev').textContent = a.dev;
  document.getElementById('detailVersion').textContent = a.version;
  document.getElementById('detailSize').textContent = a.size;
  document.getElementById('detailCat').textContent = a.category;
  document.getElementById('detailDesc').textContent = a.desc;

  const tags = (a.tags||'').split(',').map(t=>t.trim()).filter(Boolean);
  document.getElementById('detailTags').innerHTML = tags.map(t=>`<span class="tag">${t}</span>`).join('');
  document.getElementById('detailModal').classList.add('open');
  document.getElementById('detailDeleteBtn').style.display = isAdmin ? 'inline-flex' : 'none';
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('open');
  currentAppId = null;
}

function doDownload() {
  if (!currentDownloadUrl) { showToast('No download URL set for this app.'); return; }
  window.open(currentDownloadUrl, '_blank');
  showToast('⬇ Download started!', true);
}

function downloadApp(id) {
  const a = findApp(id);
  if (!a) return;
  if (!a.url) { showToast('No APK link set.'); return; }
  window.open(a.url, '_blank');
  showToast('⬇ Downloading…', true);
}

async function deleteCurrentApp() {
  if (!currentAppId) return;
  if (!confirm('Delete this app from the store? This affects ALL devices.')) return;

  if (DEMO_MODE) {
    apps = apps.filter(a => a.id !== currentAppId && a.fbKey !== currentAppId);
    localStorage.setItem('vvynas_apps', JSON.stringify(apps));
    renderApps();
    closeDetailModal();
    showToast('🗑 App removed.');
    return;
  }

  // Find the Firebase key
  const a = findApp(currentAppId);
  if (!a || !a.fbKey) { showToast('Cannot find app in database.'); return; }

  try {
    await dbRef.child(a.fbKey).remove();
    closeDetailModal();
    showToast('🗑 App deleted from all devices.', true);
  } catch (err) {
    console.error(err);
    showToast('❌ Delete failed. Check connection.');
  }
}

// ════════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════════
function openSettings()  { document.getElementById('settingsPanel').classList.add('open'); document.getElementById('settingsOverlay').classList.add('open'); }
function closeSettings() { document.getElementById('settingsPanel').classList.remove('open'); document.getElementById('settingsOverlay').classList.remove('open'); }

function setTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  document.getElementById('darkBtn').classList.toggle('active', mode==='dark');
  document.getElementById('lightBtn').classList.toggle('active', mode==='light');
  localStorage.setItem('vvynas_theme', mode);
}

function setBgColor(color, el) {
  if (color === 'linear') {
    document.documentElement.style.setProperty('--user-bg-color', '#0a0015');
    document.body.style.backgroundImage = 'linear-gradient(135deg,#0a0015,#001422)';
    document.documentElement.style.setProperty('--user-bg-image', 'linear-gradient(135deg,#0a0015,#001422)');
  } else {
    document.documentElement.style.setProperty('--user-bg-color', color);
    document.body.style.backgroundColor = color;
    clearBgImageStyle();
  }
  document.querySelectorAll('.swatch').forEach(s=>s.classList.remove('active'));
  if (el) el.classList.add('active');
  localStorage.setItem('vvynas_bg_color', color);
}

function setBgImage(url, el) {
  document.documentElement.style.setProperty('--user-bg-image', `url('${url}')`);
  document.body.style.backgroundImage = `url('${url}')`;
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundAttachment = 'fixed';
  document.querySelectorAll('.bg-img-opt').forEach(x=>x.classList.remove('active'));
  if (el) el.classList.add('active');
  localStorage.setItem('vvynas_bg_img', url);
}

function clearBgImage(el) {
  clearBgImageStyle();
  document.querySelectorAll('.bg-img-opt').forEach(x=>x.classList.remove('active'));
  if (el) el.classList.add('active');
  localStorage.removeItem('vvynas_bg_img');
}

function clearBgImageStyle() {
  document.documentElement.style.setProperty('--user-bg-image', 'none');
  document.body.style.backgroundImage = 'none';
}

function uploadBgImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => { setBgImage(e.target.result, null); showToast('🖼 Background updated!', true); };
  reader.readAsDataURL(file);
}

function loadSettings() {
  const theme = localStorage.getItem('vvynas_theme') || 'dark';
  setTheme(theme);
  const bgColor = localStorage.getItem('vvynas_bg_color');
  if (bgColor) setBgColor(bgColor, null);
  const bgImg = localStorage.getItem('vvynas_bg_img');
  if (bgImg) setBgImage(bgImg, null);
}

// ════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════
function showToast(msg, yellow=false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (yellow ? ' yellow' : '');
  setTimeout(()=>{ t.className = ''; }, 2800);
}

// ════════════════════════════════════════════════════
//  PAYWALL / SUPPORT AD
//  Shown on every page load/refresh when enabled.
//  Editable live from the Admin panel — syncs to the
//  public user file instantly via Firebase.
// ════════════════════════════════════════════════════
function loadPaywallDemo() {
  const saved = localStorage.getItem('vvynas_paywall');
  if (saved) {
    try { paywallSettings = { ...paywallSettings, ...JSON.parse(saved) }; } catch(e) {}
  }
  populatePaywallAdminForm();
  maybeShowPaywall();
}

function maybeShowPaywall() {
  if (!paywallSettings.enabled) return;
  if (!paywallSettings.message && !paywallSettings.mpesaNumber && !paywallSettings.paypalAddress) return;

  document.getElementById('paywallTitle').textContent = paywallSettings.title || '💛 SUPPORT VVYNAS VANE';
  document.getElementById('paywallMessage').textContent = paywallSettings.message || '';

  const mpesaGroup = document.getElementById('paywallMpesaGroup');
  if (paywallSettings.mpesaNumber) {
    document.getElementById('paywallMpesaInput').value = paywallSettings.mpesaNumber;
    mpesaGroup.style.display = 'block';
  } else {
    mpesaGroup.style.display = 'none';
  }

  const paypalGroup = document.getElementById('paywallPaypalGroup');
  if (paywallSettings.paypalAddress) {
    document.getElementById('paywallPaypalInput').value = paywallSettings.paypalAddress;
    paypalGroup.style.display = 'block';
  } else {
    paypalGroup.style.display = 'none';
  }

  document.getElementById('paywallModal').classList.add('open');
}

function closePaywallModal() {
  document.getElementById('paywallModal').classList.remove('open');
}

function copyPaywallField(inputId) {
  const input = document.getElementById(inputId);
  input.select();
  input.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('📋 Copied to clipboard!', true);
  }).catch(() => {
    document.execCommand('copy');
    showToast('📋 Copied to clipboard!', true);
  });
}

// Fill the admin editor fields with the currently-synced settings
function populatePaywallAdminForm() {
  const enabledEl = document.getElementById('pwEnabled');
  if (!enabledEl) return; // admin editor not open right now
  enabledEl.checked = !!paywallSettings.enabled;
  document.getElementById('pwTitle').value = paywallSettings.title || '';
  document.getElementById('pwMessage').value = paywallSettings.message || '';
  document.getElementById('pwMpesa').value = paywallSettings.mpesaNumber || '';
  document.getElementById('pwPaypal').value = paywallSettings.paypalAddress || '';
}

async function savePaywallSettings() {
  const updated = {
    enabled: document.getElementById('pwEnabled').checked,
    title: document.getElementById('pwTitle').value.trim() || '💛 SUPPORT VVYNAS VANE',
    message: document.getElementById('pwMessage').value.trim(),
    mpesaNumber: document.getElementById('pwMpesa').value.trim(),
    paypalAddress: document.getElementById('pwPaypal').value.trim()
  };

  const btn = document.getElementById('pwSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }

  paywallSettings = { ...paywallSettings, ...updated };

  if (DEMO_MODE) {
    localStorage.setItem('vvynas_paywall', JSON.stringify(paywallSettings));
    showToast('✅ Support ad settings saved!', true);
    if (btn) { btn.disabled = false; btn.textContent = '💾 SAVE SUPPORT AD'; }
    return;
  }

  try {
    await settingsRef.set(paywallSettings);
    showToast('✅ Support ad saved — synced to all devices!', true);
  } catch (err) {
    console.error(err);
    showToast('❌ Failed to save. Check connection.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 SAVE SUPPORT AD'; }
  }
}

function previewPaywall() {
  maybeShowPaywall();
}

// ════════════════════════════════════════════════════
//  ADMIN (OTP flow unchanged, + paywall editor)
// ════════════════════════════════════════════════════
function openAdminModal()  { document.getElementById('adminModal').classList.add('open'); renderAdminModalBody(); acknowledgeAdminUpdate(); }
function closeAdminModal() { document.getElementById('adminModal').classList.remove('open'); }

function renderAdminModalBody() {
  const body = document.getElementById('adminModalBody');
  if (isAdmin) {
    body.innerHTML = `
      <div style="text-align:center;padding:10px 0 20px;">
        <div style="font-size:2.5rem;margin-bottom:12px;">✅</div>
        <div class="admin-badge">ADMIN ACTIVE</div>
        <p style="color:var(--text-secondary);font-size:0.85rem;margin:16px 0 4px;line-height:1.6;">
          You are logged in as admin.<br>You can add and delete apps — changes sync to all devices instantly.
        </p>
        <p style="color:var(--text-muted);font-size:0.7rem;margin-top:10px;font-family:'Share Tech Mono',monospace;letter-spacing:1px;">
          Admin panel ${ADMIN_VERSION}
        </p>
      </div>

      <hr class="admin-section-divider">
      <div class="admin-subtitle">💛 Support / Paywall Ad</div>
      <p style="color:var(--text-muted);font-size:0.78rem;line-height:1.6;margin-bottom:14px;">
        This message pops up for every visitor (including you) the next time they open or refresh the app. Add your M-Pesa number and/or PayPal address so people can copy it and send support directly. Turn it off any time.
      </p>

      <div class="toggle-row">
        <span>Show support ad on next launch</span>
        <label class="switch">
          <input type="checkbox" id="pwEnabled">
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="form-group">
        <label class="form-label">Popup Title</label>
        <input class="form-input" id="pwTitle" type="text" placeholder="💛 SUPPORT VVYNAS VANE">
      </div>
      <div class="form-group">
        <label class="form-label">Message</label>
        <textarea class="form-textarea" id="pwMessage" placeholder="Tell users why / how they can support you…"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">📱 M-Pesa Number</label>
        <input class="form-input" id="pwMpesa" type="text" placeholder="e.g. 0712 345 678">
      </div>
      <div class="form-group">
        <label class="form-label">💳 PayPal Address</label>
        <input class="form-input" id="pwPaypal" type="text" placeholder="e.g. you@example.com">
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-primary" id="pwSaveBtn" onclick="savePaywallSettings()">💾 SAVE SUPPORT AD</button>
        <button class="otp-send-btn" onclick="previewPaywall()" style="flex-shrink:0;">👁 Preview</button>
      </div>

      <hr class="admin-section-divider">
      <button class="btn-danger" style="width:100%;" onclick="logoutAdmin()">🔓 Logout Admin</button>
      `;
    populatePaywallAdminForm();
  } else {
    body.innerHTML = `
      <p style="color:var(--text-secondary);font-size:0.84rem;margin-bottom:20px;line-height:1.6;">
        A one-time password will be sent to the admin email. Enter it below to unlock admin controls.
      </p>
      <div class="form-group">
        <label class="form-label">Admin Email</label>
        <input class="form-input" value="${ADMIN_EMAIL}" readonly style="opacity:0.6;cursor:not-allowed;">
      </div>
      <div class="form-group">
        <label class="form-label">One-Time Password</label>
        <div class="otp-input-row">
          <input class="form-input" id="otpInput" type="text" maxlength="6" placeholder="——————" oninput="this.value=this.value.replace(/[^0-9]/g,'')">
          <button class="otp-send-btn" id="otpSendBtn" onclick="sendOtp()">📨 Send OTP</button>
        </div>
        <div class="otp-info" id="otpInfo">Click "Send OTP" to receive a code at the admin email.</div>
      </div>
      <button class="btn-primary" onclick="verifyOtp()" style="margin-top:8px;">🔐 VERIFY & LOGIN</button>`;
  }
}

function generateOtp() { return Math.floor(100000 + Math.random() * 900000).toString(); }

async function sendOtp() {
  if (otpCooldown) return;
  const btn  = document.getElementById('otpSendBtn');
  const info = document.getElementById('otpInfo');

  if (EMAILJS_SERVICE_ID === 'YOUR_SERVICE_ID') {
    pendingOtp = generateOtp();
    otpExpiry = Date.now() + 5 * 60 * 1000;
    showToast(`DEV MODE — OTP: ${pendingOtp}`, true);
    info.textContent = '⚠ Dev mode: OTP shown in toast.';
    startCooldown(btn, info);
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Sending…';
  pendingOtp = generateOtp();
  otpExpiry = Date.now() + 5 * 60 * 1000;

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: ADMIN_EMAIL,
      otp_code: pendingOtp,
      app_name: 'Vvynas Vane APK Store',
    });
    info.textContent = `✅ OTP sent to ${ADMIN_EMAIL}. Valid for 5 minutes.`;
    showToast('📨 OTP sent!', true);
    startCooldown(btn, info);
  } catch (err) {
    pendingOtp = null;
    btn.disabled = false;
    btn.textContent = '📨 Send OTP';
    info.textContent = '❌ Failed to send email. Check EmailJS config.';
    showToast('Failed to send OTP email.');
  }
}

function startCooldown(btn, info) {
  otpCooldown = true;
  let seconds = 60;
  btn.disabled = true;
  const interval = setInterval(() => {
    seconds--;
    btn.textContent = `⏳ ${seconds}s`;
    if (seconds <= 0) {
      clearInterval(interval);
      btn.disabled = false;
      btn.textContent = '📨 Resend OTP';
      otpCooldown = false;
    }
  }, 1000);
}

function verifyOtp() {
  const entered = (document.getElementById('otpInput').value || '').trim();
  const info = document.getElementById('otpInfo');
  if (!pendingOtp) { showToast('Please request an OTP first.'); return; }
  if (Date.now() > otpExpiry) { pendingOtp = null; showToast('OTP expired.'); info.textContent = '⚠ OTP expired.'; return; }
  if (entered !== pendingOtp) { showToast('❌ Incorrect OTP.'); info.textContent = '❌ Incorrect code.'; return; }
  isAdmin = true;
  pendingOtp = null;
  updateAdminUI();
  renderAdminModalBody();
  showToast('🔐 Admin access granted!', true);
}

function logoutAdmin() {
  isAdmin = false;
  updateAdminUI();
  closeAdminModal();
  const delBtn = document.getElementById('detailDeleteBtn');
  if (delBtn) delBtn.style.display = 'none';
  showToast('Admin logged out.');
}

function updateAdminUI() {
  const dot = document.getElementById('adminDot');
  if (dot) dot.classList.toggle('online', isAdmin);
}

// ── CLOSE MODALS ON OVERLAY CLICK ──
document.getElementById('addModal').addEventListener('click',    function(e){ if(e.target===this) closeAddModal(); });
document.getElementById('detailModal').addEventListener('click', function(e){ if(e.target===this) closeDetailModal(); });
document.getElementById('adminModal').addEventListener('click',  function(e){ if(e.target===this) closeAdminModal(); });
document.getElementById('paywallModal').addEventListener('click', function(e){ if(e.target===this) closePaywallModal(); });

init();

// ════════════════════════════════════════════════════
//  SMALL-SCREEN MENU  (orbit burger + command deck)
// ════════════════════════════════════════════════════
(function initNavMenu() {
  const burger = document.getElementById('navBurger');
  const menu   = document.getElementById('navMenu');
  const scrim  = document.getElementById('navScrim');
  const pip    = document.getElementById('burgerPip');
  const badge  = document.getElementById('adminUpdateBadge');
  const search = document.getElementById('searchInput');
  const ver    = document.getElementById('menuVersion');
  if (!burger || !menu || !scrim) return;

  const mq = window.matchMedia('(max-width: 960px)');

  function setMenu(open) {
    menu.classList.toggle('open', open);
    burger.classList.toggle('open', open);
    scrim.classList.toggle('show', open);
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  burger.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
  scrim.addEventListener('click', () => setMenu(false));

  // Tapping an action closes the drawer (the button's own onclick runs first)
  menu.addEventListener('click', e => { if (e.target.closest('.nav-btn')) setMenu(false); });

  // Search: close the drawer on Enter / the keyboard's Search key so results are visible
  if (search) search.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); search.blur(); setMenu(false); }
  });

  // Escape closes and hands focus back to the burger
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu.classList.contains('open')) { setMenu(false); burger.focus(); }
  });

  // Swipe up on the drawer to dismiss it
  let startY = null;
  menu.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
  menu.addEventListener('touchend', e => {
    if (startY !== null && startY - e.changedTouches[0].clientY > 60) setMenu(false);
    startY = null;
  }, { passive: true });

  // Rotating / resizing to a wide screen resets everything
  const onChange = () => { if (!mq.matches) setMenu(false); };
  mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);

  // Mirror the admin "new build" red dot onto the burger while the drawer is closed
  function syncPip() { if (pip && badge) pip.classList.toggle('hidden', badge.classList.contains('hidden')); }
  if (badge) new MutationObserver(syncPip).observe(badge, { attributes: true, attributeFilter: ['class'] });
  syncPip();

  if (ver && typeof ADMIN_VERSION !== 'undefined') ver.textContent = ADMIN_VERSION;
})();
