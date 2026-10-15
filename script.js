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
const ADMIN_VERSION = 'v2.0';

// Set to false if you want anyone to be able to open the Add/Edit form (old behaviour).
const REQUIRE_ADMIN_FOR_EDIT = true;
const MAX_SHOTS = 8;       // max preview screenshots per app
const NEW_DAYS  = 7;       // "NEW" / "UPDATED" badge window

// Platforms / download targets
const OS_META = {
  android: { label: 'Android APK', short: 'APK',     icon: '📱' },
  windows: { label: 'Windows',     short: 'Windows', icon: '🖥' },
  macos:   { label: 'macOS',       short: 'macOS',   icon: '🍎' },
  linux:   { label: 'Linux',       short: 'Linux',   icon: '🐧' }
};
const DESKTOP_OS = ['windows', 'macos', 'linux'];

// ── STATE ──
let apps = [];          // live-synced from Firebase
let currentFilter = 'all';
let platformFilter = 'all';   // all | android | desktop
let sortMode = 'featured';    // featured | downloads | rating | az
let favOnly = false;
let selectedEmoji = '📱';
let currentAppId = null;
let currentShots = [];
let lightboxIndex = 0;
let dbRef = null;
let fbDb = null;
let settingsRef = null;
let isAdmin = false;
let paywallInitialCheckDone = false;
let pendingDeepKey = null;

// Add / Edit form state
let editingKey = null;
let formPlatform = 'android';
let formShots = [];

const shotCache = {};   // key -> { stamp, shots }

// Paywall / support-ad state (synced from Firebase settings/paywall, or localStorage in demo mode)
let paywallSettings = {
  enabled: false,
  title: '💛 SUPPORT VVYNAS VANE',
  message: 'If you enjoy using this app, consider sending a small tip to keep it alive and updated. Totally optional — the store stays free either way.',
  mpesaNumber: '',
  paypalAddress: ''
};

const EMOJIS = ['📱','🎮','🛠','🎵','📷','🌐','💬','📊','🔒','🚀','⚡','🎯','🌍','💡','🎨','📚','🏃','🎬','🛒','🔧','💎','🌟','🤖','🧩','📡','🎪','🔑','💰','🏆','🎭','🖥','⌨️','🗂','📝','🧮','🛡'];

// ── ADMIN CONFIG ──
const ADMIN_EMAIL      = 'simonmainamwangi2023@gmail.com';
const EMAILJS_SERVICE_ID  = 'service_mgrwinh';
const EMAILJS_TEMPLATE_ID = 'template_x1i7skk';
const EMAILJS_PUBLIC_KEY  = 'lYSZa1-dirD6Yl8JA';

let pendingOtp = null;
let otpExpiry  = null;
let otpCooldown = false;

// ════════════════════════════════════════════════════
//  SMALL HELPERS
// ════════════════════════════════════════════════════
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function appKey(a) { return a.fbKey || a.id; }
function findApp(id) { return apps.find(x => x.fbKey === id || x.id === id); }
function platformOf(a) { return ['android', 'desktop', 'both'].includes(a.platform) ? a.platform : 'android'; }
function hasAndroid(a) { return platformOf(a) !== 'desktop'; }
function hasDesktop(a) { return platformOf(a) !== 'android'; }
function fmtNum(n) {
  n = +n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
function normalizeUrl(u) {
  u = (u || '').trim();
  if (!u) return '';
  if (/^(javascript|data|vbscript):/i.test(u)) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
}
function detectOS() {
  const u = navigator.userAgent || '';
  if (/android/i.test(u)) return 'android';
  if (/iphone|ipad|ipod/i.test(u)) return null;
  if (/windows/i.test(u)) return 'windows';
  if (/macintosh|mac os/i.test(u)) return 'macos';
  if (/linux|x11|cros/i.test(u)) return 'linux';
  return null;
}
function getLinks(a) {
  const links = [];
  if (hasAndroid(a)) {
    const u = normalizeUrl(a.url);
    if (u) links.push({ os: 'android', url: u });
  }
  if (hasDesktop(a)) {
    const d = a.desktopUrls || {};
    DESKTOP_OS.forEach(os => { const u = normalizeUrl(d[os]); if (u) links.push({ os, url: u }); });
  }
  return links;
}
function ratingOf(a) {
  const r = a.rating;
  if (!r || !r.count) return { avg: 0, count: 0 };
  return { avg: r.sum / r.count, count: r.count };
}
function starsText(avg) {
  const full = Math.round(avg);
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
}
function daysSince(iso) {
  const t = Date.parse(iso || '');
  return isNaN(t) ? Infinity : (Date.now() - t) / 86400000;
}
function badgeOf(a) {
  if (daysSince(a.added) <= NEW_DAYS) return 'new';
  if (a.updated && daysSince(a.updated) <= NEW_DAYS && Date.parse(a.updated) - Date.parse(a.added) > 86400000) return 'updated';
  return '';
}
function getFavs() { return new Set(lsGet('vvynas_favs', [])); }
function getRated() { return lsGet('vvynas_rated', {}); }

// ════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════
function init() {
  buildEmojiPicker();
  buildStarfield();
  loadSettings();
  checkAdminUpdateBadge();
  readDeepLink();
  window.addEventListener('hashchange', () => { readDeepLink(); tryOpenDeepLink(); });

  // Default the platform tab to the visitor's device (they can still switch)
  const os = detectOS();
  if (os === 'android') setPlatform('android', document.querySelector('.plat-tab[data-p="android"]'));
  else if (os) setPlatform('desktop', document.querySelector('.plat-tab[data-p="desktop"]'));

  if (typeof emailjs !== 'undefined') {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  }

  if (DEMO_MODE) {
    // Run on localStorage so the page still works before Firebase is configured
    showSyncBar('⚠ DEMO MODE — data is local only. Configure Firebase for cross-device sync.', 'error', 0);
    apps = JSON.parse(localStorage.getItem('vvynas_apps') || '[]');
    renderApps();
    tryOpenDeepLink();
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
    fbDb = db;
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
      tryOpenDeepLink();
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
function sortApps(list) {
  const t = a => Date.parse(a.updated || a.added || '') || 0;
  const by = {
    featured:  (a, b) => (!!b.featured - !!a.featured) || (t(b) - t(a)),
    downloads: (a, b) => (+b.downloads || 0) - (+a.downloads || 0) || (t(b) - t(a)),
    rating:    (a, b) => ratingOf(b).avg - ratingOf(a).avg || ratingOf(b).count - ratingOf(a).count,
    az:        (a, b) => (a.name || '').localeCompare(b.name || '')
  };
  return list.slice().sort(by[sortMode] || by.featured);
}

function renderApps() {
  const grid = document.getElementById('app-grid');
  const empty = document.getElementById('emptyState');
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const favs = getFavs();

  let filtered = apps.filter(a => {
    const p = platformOf(a);
    const matchPlat = platformFilter === 'all' || p === 'both' || p === platformFilter;
    const matchCat = currentFilter === 'all' || a.category === currentFilter;
    const hay = [a.name, a.desc, a.tags, a.category, a.dev].join(' ').toLowerCase();
    const matchSearch = !search || hay.includes(search);
    const matchFav = !favOnly || favs.has(appKey(a));
    return matchPlat && matchCat && matchSearch && matchFav;
  });
  filtered = sortApps(filtered);

  grid.innerHTML = filtered.length
    ? filtered.map((a, i) => appCard(a, i, favs)).join('')
    : '';

  empty.classList.toggle('show', filtered.length === 0);
  const et = document.getElementById('emptyTitle'), es = document.getElementById('emptySub');
  if (et && es) {
    if (apps.length && filtered.length === 0) { et.textContent = 'Nothing matches'; es.textContent = 'Try another platform, category, or search term.'; }
    else { et.textContent = 'No apps yet'; es.textContent = 'Click "＋ Add App" to publish your first Android or desktop app'; }
  }

  document.getElementById('totalApps').textContent = apps.length;
  const cats = [...new Set(apps.map(a=>a.category).filter(Boolean))];
  document.getElementById('totalCats').textContent = cats.length || 0;
  const totalDl = apps.reduce((s, a) => s + (+a.downloads || 0), 0);
  const dlEl = document.getElementById('totalDownloads');
  if (dlEl) dlEl.textContent = fmtNum(totalDl);
  rebuildFilters();

  // keep an open detail modal live
  if (currentAppId) {
    const a = findApp(currentAppId);
    if (a && document.getElementById('detailModal').classList.contains('open')) {
      fillDetail(a);
      refreshShotsIfChanged(a);
    }
  }
}

function platformChips(a) {
  const chips = [];
  if (hasAndroid(a)) chips.push('<span class="plat-chip android">📱 Android</span>');
  if (hasDesktop(a)) {
    const d = a.desktopUrls || {};
    const icons = DESKTOP_OS.filter(os => d[os]).map(os => OS_META[os].icon).join(' ');
    chips.push(`<span class="plat-chip desktop">🖥 Desktop${icons ? ' ' + icons : ''}</span>`);
  }
  return chips.join('');
}

function appCard(a, i, favs) {
  const k = esc(appKey(a));
  const tags = (a.tags || '').split(',').map(t=>t.trim()).filter(Boolean);
  const r = ratingOf(a);
  const badge = badgeOf(a);
  const links = getLinks(a);
  const isFav = favs.has(appKey(a));
  let btnLabel = '⬇ GET';
  if (links.length === 1) btnLabel = links[0].os === 'android' ? '⬇ APK' : '⬇ ' + OS_META[links[0].os].short.toUpperCase();
  const shots = a.shotCount ? `<span class="meta-pill">🖼 ${+a.shotCount}</span>` : '';
  return `
  <div class="app-card${a.featured ? ' is-featured' : ''}" style="animation-delay:${i*0.06}s" onclick="openDetail('${k}')">
    <div class="card-banner">
      <span class="card-banner-icon">${esc(a.icon)}</span>
      ${a.featured ? '<span class="featured-ribbon">★ FEATURED</span>' : ''}
      ${badge ? `<span class="new-badge ${badge}">${badge === 'new' ? 'NEW' : 'UPDATED'}</span>` : ''}
      <button class="fav-btn${isFav ? ' on' : ''}" title="Favorite" onclick="event.stopPropagation();toggleFav('${k}')">${isFav ? '♥' : '♡'}</button>
    </div>
    <div class="card-body">
      <div class="app-icon-row">
        <div class="app-icon">${esc(a.icon)}</div>
        <div class="app-meta">
          <div class="app-name">${esc(a.name)}</div>
          <div class="app-dev">${esc(a.dev || 'Vvynas Vane')}</div>
        </div>
      </div>
      <div class="plat-row">${platformChips(a)}</div>
      <p class="app-desc">${esc(a.desc || 'No description available.')}</p>
      ${tags.length ? `<div class="app-tags">${tags.slice(0,3).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="card-meta">
        ${r.count ? `<span class="meta-pill star">★ ${r.avg.toFixed(1)} <small>(${r.count})</small></span>` : ''}
        <span class="meta-pill">⬇ ${fmtNum(a.downloads)}</span>
        ${shots}
      </div>
      <div class="card-footer">
        <div>
          <div class="app-size">${esc(a.size || '—')}</div>
          <div class="app-version">${esc(a.version || 'v1.0')}</div>
        </div>
        <button class="download-btn" onclick="event.stopPropagation();cardDownload('${k}')">${btnLabel}</button>
      </div>
    </div>
  </div>`;
}

function rebuildFilters() {
  const cats = ['all', ...new Set(apps.map(a=>a.category).filter(Boolean))];
  const bar = document.getElementById('categoryFilters');
  bar.innerHTML = cats.map(c=>`<button class="filter-btn${c===currentFilter?' active':''}" data-c="${esc(c)}" onclick="setFilter(this.dataset.c,this)">${c==='all'?'All categories':esc(c)}</button>`).join('');
}

function setFilter(cat, el) {
  currentFilter = cat;
  renderApps();
}
function setPlatform(p, el) {
  platformFilter = p;
  document.querySelectorAll('.plat-tab').forEach(b => b.classList.toggle('active', b.dataset.p === p));
  renderApps();
}
function setSort(v) { sortMode = v; renderApps(); }
function toggleFavFilter() {
  favOnly = !favOnly;
  const b = document.getElementById('favToggle');
  if (b) b.classList.toggle('active', favOnly);
  renderApps();
}
function filterApps() { renderApps(); }

// ── FAVORITES ──
function toggleFav(key) {
  const favs = getFavs();
  if (favs.has(key)) favs.delete(key); else favs.add(key);
  lsSet('vvynas_favs', [...favs]);
  renderApps();
  const a = findApp(key);
  if (a && currentAppId === key) fillDetail(a);
  showToast(favs.has(key) ? '♥ Added to favorites' : 'Removed from favorites', favs.has(key));
}

// ── DEEP LINKS (#app=KEY) ──
function readDeepLink() {
  const m = /[#&]app=([^&]+)/.exec(location.hash || '');
  pendingDeepKey = m ? decodeURIComponent(m[1]) : null;
}
function tryOpenDeepLink() {
  if (!pendingDeepKey || !apps.length) return;
  const a = findApp(pendingDeepKey);
  pendingDeepKey = null;
  if (a) openDetail(appKey(a));
}

// ════════════════════════════════════════════════════
//  ADD / EDIT APP
// ════════════════════════════════════════════════════
function requireAdmin() {
  if (REQUIRE_ADMIN_FOR_EDIT && !isAdmin) {
    showToast('🔐 Admin login required.');
    openAdminModal();
    return false;
  }
  return true;
}

function openAddModal() {
  if (!requireAdmin()) return;
  editingKey = null;
  clearForm();
  document.getElementById('addModalTitle').textContent = '⬆ UPLOAD NEW APP';
  document.getElementById('publishBtn').textContent = '⬆ PUBLISH APP';
  document.getElementById('addModal').classList.add('open');
}

async function openEditModal() {
  if (!requireAdmin()) return;
  const a = findApp(currentAppId);
  if (!a) return;
  editingKey = appKey(a);
  clearForm();
  const set = (id, v) => { document.getElementById(id).value = v || ''; };
  set('appName', a.name); set('appDev', a.dev); set('appVersion', a.version);
  set('appSize', a.size); set('appCategory', a.category); set('appDesc', a.desc);
  set('appTags', a.tags); set('appUrl', a.url);
  const d = a.desktopUrls || {};
  set('urlWindows', d.windows); set('urlMacos', d.macos); set('urlLinux', d.linux);
  set('appReq', a.minReq); set('appSha', a.sha256); set('appWhatsNew', a.whatsNew);
  document.getElementById('appFeatured').checked = !!a.featured;
  selectedEmoji = a.icon || '📱';
  buildEmojiPicker();
  setFormPlatform(platformOf(a));
  formShots = (await loadShots(a)).slice();
  renderFormShots();
  document.getElementById('addModalTitle').textContent = '✎ EDIT APP';
  document.getElementById('publishBtn').textContent = '💾 SAVE CHANGES';
  closeDetailModal();
  document.getElementById('addModal').classList.add('open');
}

function closeAddModal() {
  document.getElementById('addModal').classList.remove('open');
  editingKey = null;
  clearForm();
}

function clearForm() {
  ['appName','appDev','appVersion','appSize','appCategory','appDesc','appTags','appUrl',
   'urlWindows','urlMacos','urlLinux','appReq','appSha','appWhatsNew','shotUrl'].forEach(id=>{
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('appFeatured').checked = false;
  selectedEmoji = '📱';
  buildEmojiPicker();
  formShots = [];
  renderFormShots();
  setFormPlatform('android');
  const btn = document.getElementById('publishBtn');
  btn.disabled = false;
  btn.textContent = editingKey ? '💾 SAVE CHANGES' : '⬆ PUBLISH APP';
}

function setFormPlatform(p) {
  formPlatform = p;
  document.querySelectorAll('#platformSeg button').forEach(b => b.classList.toggle('active', b.dataset.p === p));
  document.getElementById('grpAndroidUrl').style.display = (p === 'desktop') ? 'none' : 'block';
  document.getElementById('grpDesktopUrls').style.display = (p === 'android') ? 'none' : 'block';
}

// ── Screenshot manager (form) ──
function renderFormShots() {
  const grid = document.getElementById('shotGrid');
  const count = document.getElementById('shotCount');
  if (count) count.textContent = `${formShots.length}/${MAX_SHOTS}`;
  grid.innerHTML = formShots.map((s, i) => `
    <div class="shot-thumb">
      <img src="${esc(s)}" alt="Screenshot ${i+1}">
      ${i === 0 ? '<span class="shot-cover">COVER</span>' : ''}
      <div class="shot-tools">
        <button type="button" title="Move earlier" onclick="moveShot(${i},-1)" ${i===0?'disabled':''}>◀</button>
        <button type="button" title="Move later" onclick="moveShot(${i},1)" ${i===formShots.length-1?'disabled':''}>▶</button>
        <button type="button" title="Remove" class="del" onclick="removeShot(${i})">✕</button>
      </div>
    </div>`).join('') || '<div class="shot-empty">No previews yet — add screenshots so users can see the app before installing.</div>';
}

function moveShot(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= formShots.length) return;
  [formShots[i], formShots[j]] = [formShots[j], formShots[i]];
  renderFormShots();
}
function removeShot(i) { formShots.splice(i, 1); renderFormShots(); }

function compressImage(file, maxDim = 1100, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); // flatten transparency
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleShotFiles(input) {
  const files = [...(input.files || [])].filter(f => f.type.startsWith('image/'));
  input.value = '';
  if (!files.length) return;
  const room = MAX_SHOTS - formShots.length;
  if (room <= 0) { showToast(`Maximum ${MAX_SHOTS} screenshots.`); return; }
  if (files.length > room) showToast(`Only ${room} more fit — extras skipped.`);
  showToast('⏳ Processing images…', true);
  for (const f of files.slice(0, room)) {
    try { formShots.push(await compressImage(f)); }
    catch (e) { console.error(e); showToast('Could not read ' + f.name); }
  }
  renderFormShots();
}

function addShotUrl() {
  const el = document.getElementById('shotUrl');
  const u = normalizeUrl(el.value);
  if (!u) { showToast('Enter an image URL first.'); return; }
  if (formShots.length >= MAX_SHOTS) { showToast(`Maximum ${MAX_SHOTS} screenshots.`); return; }
  formShots.push(u);
  el.value = '';
  renderFormShots();
}

// ── Screenshot storage (kept in its own node so the app list stays light) ──
function readLocalShots() { return lsGet('vvynas_shots', {}); }

async function loadShots(a) {
  const k = appKey(a);
  const stamp = (a.updated || a.added || '') + '|' + (a.shotCount || 0);
  if (shotCache[k] && shotCache[k].stamp === stamp) return shotCache[k].shots;
  let shots = [];
  if (a.shotCount) {
    if (DEMO_MODE) {
      shots = readLocalShots()[k] || [];
    } else {
      try {
        const snap = await fbDb.ref('screenshots/' + k).once('value');
        const v = snap.val();
        shots = Array.isArray(v) ? v.filter(Boolean) : (v ? Object.values(v) : []);
      } catch (e) { console.error('Screenshot load error', e); }
    }
  }
  shotCache[k] = { stamp, shots };
  return shots;
}

async function saveShots(key, shots) {
  if (DEMO_MODE) {
    const m = readLocalShots();
    if (shots.length) m[key] = shots; else delete m[key];
    if (!lsSet('vvynas_shots', m)) throw new Error('Local storage full — use fewer/smaller screenshots or configure Firebase.');
  } else {
    await fbDb.ref('screenshots/' + key).set(shots.length ? shots : null);
  }
  delete shotCache[key];
}

async function saveApp() {
  if (!requireAdmin()) return;
  const name = document.getElementById('appName').value.trim();
  if (!name) { showToast('App name is required!'); return; }
  const val = id => document.getElementById(id).value.trim();

  const desktopUrls = {};
  if (formPlatform !== 'android') {
    [['windows','urlWindows'],['macos','urlMacos'],['linux','urlLinux']].forEach(([os, id]) => { if (val(id)) desktopUrls[os] = val(id); });
  }
  const nowIso = new Date().toISOString();

  const data = {
    name,
    dev:      val('appDev')      || 'Vvynas Vane',
    version:  val('appVersion')  || 'v1.0',
    size:     val('appSize')     || 'Unknown',
    category: val('appCategory') || 'General',
    desc:     val('appDesc')     || 'No description.',
    tags:     val('appTags'),
    platform: formPlatform,
    url:      formPlatform === 'desktop' ? '' : val('appUrl'),
    minReq:   val('appReq'),
    sha256:   val('appSha').replace(/\s+/g, ''),
    whatsNew: val('appWhatsNew'),
    featured: document.getElementById('appFeatured').checked,
    icon:     selectedEmoji,
    shotCount: formShots.length,
    updated:  nowIso
  };

  const btn = document.getElementById('publishBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Saving…';
  const resetBtn = () => { btn.disabled = false; btn.textContent = editingKey ? '💾 SAVE CHANGES' : '⬆ PUBLISH APP'; };

  try {
    if (editingKey) {
      const existing = findApp(editingKey);
      if (!existing) throw new Error('App no longer exists.');
      if (DEMO_MODE) {
        Object.assign(existing, data, { desktopUrls: Object.keys(desktopUrls).length ? desktopUrls : undefined });
        if (!Object.keys(desktopUrls).length) delete existing.desktopUrls;
        await saveShots(editingKey, formShots);
        localStorage.setItem('vvynas_apps', JSON.stringify(apps));
        renderApps();
      } else {
        await dbRef.child(editingKey).update({ ...data, desktopUrls: Object.keys(desktopUrls).length ? desktopUrls : null });
        await saveShots(editingKey, formShots);
      }
      const k = editingKey;
      closeAddModal();
      showToast('✅ App updated — synced to all devices!', true);
      openDetail(k);
    } else {
      const app = { id: 'app_' + Date.now(), ...data, added: nowIso, downloads: 0 };
      if (Object.keys(desktopUrls).length) app.desktopUrls = desktopUrls;
      if (DEMO_MODE) {
        apps.unshift(app);
        await saveShots(app.id, formShots);
        localStorage.setItem('vvynas_apps', JSON.stringify(apps));
        renderApps();
        closeAddModal();
        showToast('✅ App published (demo mode)!', true);
      } else {
        const ref = dbRef.push();           // Firebase push → triggers real-time update on ALL devices
        await ref.set(app);
        await saveShots(ref.key, formShots);
        closeAddModal();
        showToast('✅ App published — visible on all devices!', true);
      }
    }
  } catch (err) {
    console.error(err);
    showToast('❌ ' + (err && err.message ? err.message : 'Failed to save. Check connection.'));
    resetBtn();
  }
}

// ════════════════════════════════════════════════════
//  DETAIL MODAL
// ════════════════════════════════════════════════════
function openDetail(id) {
  const a = findApp(id);
  if (!a) return;
  currentAppId = appKey(a);
  currentShots = [];
  document.getElementById('shotsSection').style.display = 'none';
  document.getElementById('shotStrip').innerHTML = '';
  fillDetail(a);
  document.getElementById('detailModal').classList.add('open');
  document.getElementById('detailDeleteBtn').style.display = isAdmin ? 'inline-flex' : 'none';
  document.getElementById('detailEditBtn').style.display = isAdmin ? 'inline-flex' : 'none';
  loadShots(a).then(shots => { if (currentAppId === appKey(a)) renderShotStrip(shots); });
}

function refreshShotsIfChanged(a) {
  loadShots(a).then(shots => {
    if (currentAppId !== appKey(a)) return;
    if (JSON.stringify(shots) !== JSON.stringify(currentShots)) renderShotStrip(shots);
  });
}

function renderShotStrip(shots) {
  currentShots = shots;
  const sec = document.getElementById('shotsSection');
  sec.style.display = shots.length ? 'block' : 'none';
  document.getElementById('shotStrip').innerHTML = shots.map((s, i) =>
    `<button type="button" class="shot-item" onclick="openLightbox(${i})"><img src="${esc(s)}" alt="Preview ${i+1}" loading="lazy"></button>`).join('');
}

function fillDetail(a) {
  const k = appKey(a);
  const r = ratingOf(a);
  document.getElementById('detailBannerIcon').textContent = a.icon;
  document.getElementById('detailIcon').textContent = a.icon;
  document.getElementById('detailName').textContent = a.name;
  document.getElementById('detailDev').textContent = a.dev || '';
  document.getElementById('detailPlats').innerHTML = platformChips(a);
  document.getElementById('detailFeatured').style.display = a.featured ? 'inline-block' : 'none';
  document.getElementById('detailVersion').textContent = a.version || '—';
  document.getElementById('detailSize').textContent = a.size || '—';
  document.getElementById('detailCat').textContent = a.category || '—';
  document.getElementById('detailDl').textContent = fmtNum(a.downloads);
  document.getElementById('detailRatingStat').textContent = r.count ? `★ ${r.avg.toFixed(1)}` : '—';
  document.getElementById('detailDesc').textContent = a.desc || '';

  const wn = document.getElementById('detailWhatsNew');
  document.getElementById('whatsNewBox').style.display = a.whatsNew ? 'block' : 'none';
  wn.textContent = a.whatsNew || '';

  const hasReq = !!(a.minReq || a.sha256);
  document.getElementById('reqBox').style.display = hasReq ? 'block' : 'none';
  document.getElementById('detailReq').innerHTML = a.minReq
    ? `<div class="info-row"><span class="info-key">Requirements</span><span class="info-val">${esc(a.minReq)}</span></div>` : '';
  document.getElementById('detailSha').innerHTML = a.sha256
    ? `<div class="info-row"><span class="info-key">SHA-256</span><span class="info-val mono" id="shaVal">${esc(a.sha256)}</span><button class="mini-btn" onclick="copyText(document.getElementById('shaVal').textContent)">📋</button></div>` : '';

  const tags = (a.tags||'').split(',').map(t=>t.trim()).filter(Boolean);
  document.getElementById('detailTags').innerHTML = tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('');

  renderRate(a);
  renderDownloads(a);
  const fav = getFavs().has(k);
  const fb = document.getElementById('detailFavBtn');
  fb.textContent = fav ? '♥ Saved' : '♡ Save';
  fb.classList.toggle('on', fav);
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('open');
  currentAppId = null;
}

// ── Download buttons (per platform) ──
function renderDownloads(a) {
  const box = document.getElementById('detailDownloads');
  const links = getLinks(a);
  const pref = detectOS();
  if (!links.length) { box.innerHTML = '<div class="dl-empty">No download links have been added yet.</div>'; return; }
  links.sort((x, y) => (y.os === pref) - (x.os === pref));
  box.innerHTML = links.map(l => `
    <button class="dl-btn${l.os === pref ? ' rec' : ''}" onclick="downloadOs('${l.os}')">
      <span class="dl-ico">${OS_META[l.os].icon}</span>
      <span class="dl-label">${OS_META[l.os].label}</span>
      ${l.os === pref ? '<span class="rec-tag">YOUR DEVICE</span>' : ''}
      <span class="dl-arrow">⬇</span>
    </button>`).join('');
}

function downloadOs(os) {
  const a = findApp(currentAppId);
  if (a) startDownload(a, os);
}

function cardDownload(id) {
  const a = findApp(id);
  if (!a) return;
  const links = getLinks(a);
  if (!links.length) { showToast('No download link set yet.'); return; }
  if (links.length === 1) { startDownload(a, links[0].os); return; }
  // several platforms → let the visitor choose (their own device is highlighted)
  const pref = detectOS();
  const match = links.find(l => l.os === pref);
  if (match && platformFilter !== 'all') { startDownload(a, match.os); return; }
  openDetail(id);
}

function startDownload(a, os) {
  const link = getLinks(a).find(l => l.os === os);
  if (!link) { showToast('No link for ' + OS_META[os].label + '.'); return; }
  window.open(link.url, '_blank', 'noopener');
  showToast('⬇ Download started — ' + OS_META[os].label, true);
  trackDownload(a, os);
}

// ── Download counter ──
function trackDownload(a, os) {
  const k = appKey(a);
  if (DEMO_MODE) {
    a.downloads = (+a.downloads || 0) + 1;
    a.dl = a.dl || {}; a.dl[os] = (+a.dl[os] || 0) + 1;
    localStorage.setItem('vvynas_apps', JSON.stringify(apps));
    renderApps();
    return;
  }
  const inc = v => (+v || 0) + 1;
  dbRef.child(k).child('downloads').transaction(inc).catch(e => console.warn('Counter blocked by rules?', e));
  dbRef.child(k).child('dl').child(os).transaction(inc).catch(() => {});
}

// ── Ratings ──
function renderRate(a) {
  const k = appKey(a);
  const mine = getRated()[k] || 0;
  const r = ratingOf(a);
  const row = document.getElementById('rateRow');
  row.innerHTML = `
    <div class="rate-stars" role="radiogroup" aria-label="Rate this app">
      ${[1,2,3,4,5].map(n => `<button type="button" class="${n <= mine ? 'on' : ''}" aria-label="${n} star${n>1?'s':''}" onclick="rateApp(${n})">★</button>`).join('')}
    </div>
    <div class="rate-text">${r.count ? `<b>${r.avg.toFixed(1)}</b> · ${r.count} rating${r.count>1?'s':''}` : 'No ratings yet'}${mine ? ` · you gave ${mine}★` : ''}</div>`;
}

function rateApp(n) {
  const a = findApp(currentAppId);
  if (!a) return;
  const k = appKey(a);
  const rated = getRated();
  const old = rated[k] || 0;
  if (old === n) return;
  rated[k] = n;
  lsSet('vvynas_rated', rated);

  const apply = cur => {
    cur = cur || { sum: 0, count: 0 };
    if (old) cur.sum += n - old; else { cur.sum += n; cur.count += 1; }
    return cur;
  };
  if (DEMO_MODE) {
    a.rating = apply(a.rating ? { ...a.rating } : null);
    localStorage.setItem('vvynas_apps', JSON.stringify(apps));
    renderApps();
  } else {
    dbRef.child(k).child('rating').transaction(apply).catch(e => { console.warn(e); showToast('Rating could not be saved.'); });
  }
  renderRate(a);
  showToast('★ Thanks for rating!', true);
}

// ── Share ──
function copyText(text) {
  const done = () => showToast('📋 Copied!', true);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(text, done));
  else legacyCopy(text, done);
}
function legacyCopy(text, cb) {
  const t = document.createElement('textarea');
  t.value = text; document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); cb(); } catch (e) { showToast('Copy failed.'); }
  t.remove();
}
function shareCurrent() {
  const a = findApp(currentAppId);
  if (!a) return;
  const url = location.origin + location.pathname + '#app=' + encodeURIComponent(appKey(a));
  if (navigator.share) {
    navigator.share({ title: a.name, text: `${a.name} — ${a.desc || ''}`.slice(0, 140), url }).catch(() => {});
  } else {
    copyText(url);
  }
}

// ── Lightbox ──
function openLightbox(i) {
  if (!currentShots.length) return;
  lightboxIndex = i;
  updateLightbox();
  document.getElementById('lightbox').classList.add('open');
}
function updateLightbox() {
  document.getElementById('lightboxImg').src = currentShots[lightboxIndex];
  document.getElementById('lightboxCount').textContent = `${lightboxIndex + 1} / ${currentShots.length}`;
  const multi = currentShots.length > 1;
  document.getElementById('lbPrev').style.display = multi ? 'flex' : 'none';
  document.getElementById('lbNext').style.display = multi ? 'flex' : 'none';
}
function lightboxStep(d) {
  if (!currentShots.length) return;
  lightboxIndex = (lightboxIndex + d + currentShots.length) % currentShots.length;
  updateLightbox();
}
function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); }
document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  if (!lb || !lb.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') lightboxStep(-1);
  else if (e.key === 'ArrowRight') lightboxStep(1);
});
(function lightboxSwipe() {
  const lb = document.getElementById('lightbox');
  let sx = null;
  lb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) lightboxStep(dx < 0 ? 1 : -1);
    sx = null;
  }, { passive: true });
  lb.addEventListener('click', e => { if (e.target === lb || e.target.id === 'lightboxStage') closeLightbox(); });
})();

// ── Delete ──
async function deleteCurrentApp() {
  if (!currentAppId) return;
  if (!confirm('Delete this app from the store? This affects ALL devices.')) return;

  if (DEMO_MODE) {
    const k = currentAppId;
    apps = apps.filter(a => a.id !== k && a.fbKey !== k);
    localStorage.setItem('vvynas_apps', JSON.stringify(apps));
    saveShots(k, []).catch(() => {});
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
    fbDb.ref('screenshots/' + a.fbKey).remove().catch(() => {});
    delete shotCache[a.fbKey];
    closeDetailModal();
    showToast('🗑 App deleted from all devices.', true);
  } catch (err) {
    console.error(err);
    showToast('❌ Delete failed. Check connection.');
  }
}

// ════════════════════════════════════════════════════
//  ADMIN ANALYTICS + BACKUP
// ════════════════════════════════════════════════════
function analyticsHtml() {
  const total = apps.reduce((s, a) => s + (+a.downloads || 0), 0);
  const byOs = { android: 0, windows: 0, macos: 0, linux: 0 };
  apps.forEach(a => { Object.keys(byOs).forEach(os => { byOs[os] += +((a.dl || {})[os]) || 0; }); });
  const nAndroid = apps.filter(a => platformOf(a) === 'android').length;
  const nDesktop = apps.filter(a => platformOf(a) === 'desktop').length;
  const nBoth    = apps.filter(a => platformOf(a) === 'both').length;
  const rated = apps.filter(a => ratingOf(a).count);
  const totalVotes = rated.reduce((s, a) => s + ratingOf(a).count, 0);
  const avg = totalVotes ? rated.reduce((s, a) => s + (a.rating.sum), 0) / totalVotes : 0;
  const top = apps.slice().sort((a, b) => (+b.downloads || 0) - (+a.downloads || 0)).slice(0, 5).filter(a => +a.downloads > 0);
  const max = top.length ? (+top[0].downloads || 1) : 1;
  const osMax = Math.max(1, ...Object.values(byOs));

  return `
    <div class="an-grid">
      <div class="an-card"><div class="an-num">${apps.length}</div><div class="an-key">Apps</div></div>
      <div class="an-card"><div class="an-num">${fmtNum(total)}</div><div class="an-key">Downloads</div></div>
      <div class="an-card"><div class="an-num">${totalVotes ? avg.toFixed(1) + '★' : '—'}</div><div class="an-key">Avg rating</div></div>
      <div class="an-card"><div class="an-num">${apps.filter(a => a.featured).length}</div><div class="an-key">Featured</div></div>
    </div>
    <div class="an-split">📱 Android-only <b>${nAndroid}</b> · 🖥 Desktop-only <b>${nDesktop}</b> · 🔀 Both <b>${nBoth}</b></div>
    <div class="an-sub">Downloads by platform</div>
    ${Object.keys(byOs).map(os => `
      <div class="an-bar-row"><span class="an-bar-label">${OS_META[os].icon} ${OS_META[os].short}</span>
        <span class="an-bar"><i style="width:${Math.round(byOs[os] / osMax * 100)}%"></i></span><span class="an-bar-val">${fmtNum(byOs[os])}</span></div>`).join('')}
    <div class="an-sub">Top apps</div>
    ${top.length ? top.map(a => `
      <div class="an-bar-row"><span class="an-bar-label">${esc(a.icon)} ${esc(a.name)}</span>
        <span class="an-bar"><i style="width:${Math.round((+a.downloads) / max * 100)}%"></i></span><span class="an-bar-val">${fmtNum(a.downloads)}</span></div>`).join('')
      : '<div class="dl-empty">No downloads recorded yet.</div>'}`;
}

function downloadBlob(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportBackup() {
  if (!isAdmin) return;
  showToast('⏳ Preparing backup…', true);
  try {
    let shots = {};
    if (DEMO_MODE) shots = readLocalShots();
    else { const s = await fbDb.ref('screenshots').once('value'); shots = s.val() || {}; }
    const payload = {
      kind: 'vvynas-store-backup', version: 2, exportedAt: new Date().toISOString(),
      apps: apps.map(a => { const c = { ...a }; const key = appKey(a); delete c.fbKey; c._key = key; return c; }),
      screenshots: shots,
      paywall: paywallSettings
    };
    downloadBlob(`vvynas-store-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload));
    showToast('💾 Backup downloaded', true);
  } catch (e) { console.error(e); showToast('❌ Backup failed.'); }
}

function importBackupPick() { document.getElementById('importFile').click(); }

async function importBackup(input) {
  const file = input.files[0];
  input.value = '';
  if (!file || !isAdmin) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.kind !== 'vvynas-store-backup' || !Array.isArray(data.apps)) throw new Error('Not a Vvynas Store backup file.');
    const existingIds = new Set(apps.map(a => a.id));
    const fresh = data.apps.filter(a => a && a.name && !existingIds.has(a.id));
    if (!fresh.length) { showToast('Nothing new to import — all apps already exist.'); return; }
    if (!confirm(`Import ${fresh.length} app(s)? Apps already in the store are skipped.`)) return;

    for (const a of fresh) {
      const oldKey = a._key; delete a._key; delete a.fbKey;
      const shots = (data.screenshots && data.screenshots[oldKey]) ? [].concat(Object.values(data.screenshots[oldKey])) : [];
      if (DEMO_MODE) {
        a.id = a.id || 'app_' + Date.now() + Math.random().toString(36).slice(2, 6);
        apps.unshift(a);
        await saveShots(a.id, shots);
      } else {
        const ref = dbRef.push();
        await ref.set(a);
        await saveShots(ref.key, shots);
      }
    }
    if (DEMO_MODE) { localStorage.setItem('vvynas_apps', JSON.stringify(apps)); renderApps(); }
    showToast(`✅ Imported ${fresh.length} app(s)`, true);
    renderAdminModalBody();
  } catch (e) { console.error(e); showToast('❌ ' + (e.message || 'Import failed.')); }
}

// ════════════════════════════════════════════════════
//  ADMIN MODAL (open / render)
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
          You are logged in as admin.<br>You can add, edit and delete apps — changes sync to all devices instantly.
        </p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap;">
          <button class="otp-send-btn" onclick="closeAdminModal();openAddModal()">＋ Add App</button>
        </div>
        <p style="color:var(--text-muted);font-size:0.7rem;margin-top:14px;font-family:'Share Tech Mono',monospace;letter-spacing:1px;">
          Admin panel ${ADMIN_VERSION}
        </p>
      </div>

      <hr class="admin-section-divider">
      <div class="admin-subtitle">📊 Store Analytics</div>
      ${analyticsHtml()}

      <hr class="admin-section-divider">
      <div class="admin-subtitle">💾 Backup &amp; Restore</div>
      <p style="color:var(--text-muted);font-size:0.78rem;line-height:1.6;margin-bottom:14px;">
        Export every app, screenshot and the support-ad settings to a JSON file. Importing merges — apps already in the store are skipped.
      </p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="otp-send-btn" onclick="exportBackup()">⬇ Export Backup</button>
        <button class="otp-send-btn" onclick="importBackupPick()">⬆ Import Backup</button>
        <input type="file" id="importFile" accept="application/json,.json" style="display:none" onchange="importBackup(this)">
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
  const editBtn = document.getElementById('detailEditBtn');
  if (editBtn) editBtn.style.display = 'none';
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
