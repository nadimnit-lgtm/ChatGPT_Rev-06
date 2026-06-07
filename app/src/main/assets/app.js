/* =========================================================================
   Azkar TV Display Rev06 — TV / phone / tablet WebView
   Thin Indo-Pak Arabic rendering · compact salah ribbon · clean categories
   Favorites · long-text handling · settings save/apply · D-pad navigation
   ========================================================================= */
'use strict';

const MODE = (new URLSearchParams(location.search).get('mode') || 'app');
const SCREENSAVER = MODE === 'screensaver';
if (SCREENSAVER) document.body.classList.add('screensaver');

const TYPES = ['azkar', 'duas', 'kalima'];
const ICONS = { azkar: '📿', duas: '🤲', kalima: '☪' };
const TYPE_LABEL = { azkar: 'Azkar', duas: 'Duas', kalima: 'Kalima' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clone = obj => JSON.parse(JSON.stringify(obj));
const $ = id => document.getElementById(id);
const card = () => $('card');
const body = () => $('body');

/* ---------------- persistent settings ---------------- */
const SETTINGS_KEY = 'azkar_settings_v2';
const FAVORITES_KEY = 'azkar_favorites_v1';
const DEFAULTS = {
  theme: 'light',
  timerSec: 60,
  ar: 1,
  tr: 1,
  en: 1,
  autoRotate: true,
  rotateType: true,
  showTranslit: true,
  showSalah: true,
  showChips: false,
  tajweed: true
};

let S = loadSettings();
let draftSettings = null;

function loadSettings() {
  try {
    const cached = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (cached) return Object.assign({}, DEFAULTS, cached);
  } catch (e) {}
  return Object.assign({}, DEFAULTS);
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S)); } catch (e) {}
}

const TOGNAMES = {
  autoRotate: 'Auto-rotate',
  rotateType: 'Rotate types after last item',
  showTranslit: 'Transliteration',
  showSalah: 'Salah ribbon',
  showChips: 'Show Category Chips',
  tajweed: 'Tajweed colours'
};

function applySettings(persist) {
  document.documentElement.setAttribute('data-theme', S.theme);
  document.documentElement.style.setProperty('--ar-scale', S.ar);
  document.documentElement.style.setProperty('--tr-scale', S.tr);
  document.documentElement.style.setProperty('--en-scale', S.en);
  document.body.classList.toggle('hide-tr', !S.showTranslit);
  document.body.classList.toggle('hide-salah', !S.showSalah);
  document.body.classList.toggle('show-chips', !!S.showChips);
  document.body.classList.toggle('hide-tajweed', !S.tajweed);
  if (persist) saveSettings();
  if (DATA) { renderType(); renderItem(); }
  startRotate();
  if (settingsOpen) syncSettingsUI();
}

/* ---------------- location detection ---------------- */
const DEFAULT_GEO = { lat: 24.7136, lng: 46.6753, tz: null, city: 'Riyadh', country: 'Saudi Arabia' };
let GEO = loadGeo();
function loadGeo() {
  try {
    const cached = JSON.parse(localStorage.getItem('azkar_geo'));
    if (cached && cached.lat) return cached;
  } catch (e) {}
  return Object.assign({}, DEFAULT_GEO);
}
function saveGeo(g) { try { localStorage.setItem('azkar_geo', JSON.stringify(g)); } catch (e) {} }
function netText(on) {
  if (on) return GEO.city ? `Online • ${GEO.city}` : 'Online';
  return 'Offline • Last saved';
}
function setNet(on) {
  const dot = $('net-dot'), label = $('net-label');
  if (!dot || !label) return;
  dot.className = 'dot ' + (on ? 'online' : 'offline');
  label.textContent = netText(on);
}
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]); }
function parseUtc(s) {
  if (!s) return null;
  const m = /([+-])(\d{2})(\d{2})/.exec(s);
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * (+m[2] + (+m[3]) / 60);
}
async function detectLocation() {
  try {
    const r = await withTimeout(fetch('https://ipapi.co/json/'), 6000);
    const j = await r.json();
    if (j && j.latitude) return { lat: +j.latitude, lng: +j.longitude, tz: parseUtc(j.utc_offset), city: j.city || '', country: j.country_name || '' };
  } catch (e) {}
  try {
    const r = await withTimeout(fetch('http://ip-api.com/json/'), 6000);
    const j = await r.json();
    if (j && j.lat) return { lat: +j.lat, lng: +j.lon, tz: (j.offset != null ? j.offset / 3600 : null), city: j.city || '', country: j.country || '' };
  } catch (e) {}
  return null;
}

/* ---------------- prayer-time math, Umm al-Qura style ---------------- */
const FAJR_ANGLE = 18.5, ISHA_INTERVAL = 90, ASR_FACTOR = 1;
const PT = (function () {
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const dsin = d => Math.sin(d * D2R), dcos = d => Math.cos(d * D2R), dtan = d => Math.tan(d * D2R);
  const darcsin = x => R2D * Math.asin(x), darccos = x => R2D * Math.acos(x);
  const darctan2 = (y, x) => R2D * Math.atan2(y, x), darccot = x => R2D * Math.atan(1 / x);
  const fix = (a, b) => { a -= b * Math.floor(a / b); return a < 0 ? a + b : a; };
  const fixAngle = a => fix(a, 360), fixHour = a => fix(a, 24);
  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }
  function sun(jd) {
    const D = jd - 2451545.0;
    const g = fixAngle(357.529 + 0.98560028 * D);
    const q = fixAngle(280.459 + 0.98564736 * D);
    const L = fixAngle(q + 1.915 * dsin(g) + 0.020 * dsin(2 * g));
    const e = 23.439 - 0.00000036 * D;
    const RA = darctan2(dcos(e) * dsin(L), dcos(L)) / 15;
    return { decl: darcsin(dsin(e) * dsin(L)), eqt: q / 15 - fixHour(RA) };
  }
  function times(date, lat, lng, tz) {
    const jd = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / (15 * 24);
    const midDay = t => fixHour(12 - sun(jd + t).eqt);
    const angleTime = (a, t, ccw) => {
      const decl = sun(jd + t).decl;
      const v = (-dsin(a) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat));
      return midDay(t) + (ccw ? -1 : 1) * darccos(v) / 15;
    };
    const asr = (f, t) => {
      const decl = sun(jd + t).decl;
      return angleTime(-darccot(f + dtan(Math.abs(lat - decl))), t, false);
    };
    const adj = h => h + tz - lng / 15;
    const mg = angleTime(0.833, 18 / 24, false);
    return {
      Fajr: adj(angleTime(FAJR_ANGLE, 5 / 24, true)),
      Dhuhr: adj(midDay(12 / 24)),
      Asr: adj(asr(ASR_FACTOR, 13 / 24)),
      Maghrib: adj(mg),
      Isha: adj(mg + ISHA_INTERVAL / 60)
    };
  }
  return { times };
})();

const SALAH = [
  { key: 'Fajr', ar: 'الفجر', ic: '🌅' },
  { key: 'Dhuhr', ar: 'الظهر', ic: '☀️' },
  { key: 'Asr', ar: 'العصر', ic: '🌤️' },
  { key: 'Maghrib', ar: 'المغرب', ic: '🌇' },
  { key: 'Isha', ar: 'العشاء', ic: '🌙' }
];
let prayerHours = {};
function fix24(h) { h %= 24; return h < 0 ? h + 24 : h; }
function fmt12(hf) {
  hf = fix24(hf);
  let h = Math.floor(hf), m = Math.round((hf - h) * 60);
  if (m === 60) { m = 0; h = (h + 1) % 24; }
  const ap = h >= 12 ? 'pm' : 'am';
  let hh = h % 12; if (hh === 0) hh = 12;
  return hh + ':' + String(m).padStart(2, '0') + ' ' + ap;
}
function formatDateDDMMMYYYY(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
}
function computeTimes() {
  const tz = (GEO.tz != null) ? GEO.tz : -new Date().getTimezoneOffset() / 60;
  prayerHours = PT.times(new Date(), GEO.lat, GEO.lng, tz);
  $('loc-label').textContent = GEO.city ? (GEO.city + (GEO.country ? ', ' + GEO.country : '')) : 'Current Location';
  setNet(navigator.onLine);
}
let alertedToday = {};
function tickClock() {
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
  const ap = h >= 12 ? 'pm' : 'am';
  let hh = h % 12; if (hh === 0) hh = 12;
  $('hdr-date').textContent = formatDateDDMMMYYYY(now);
  $('hdr-time').textContent = `${hh}:${String(m).padStart(2, '0')} ${ap}`;

  const nowH = h + m / 60 + s / 3600;
  const order = SALAH.map(p => prayerHours[p.key]);
  let nextIndex = -1;
  for (let i = 0; i < order.length; i++) if (order[i] > nowH) { nextIndex = i; break; }

  let nextKey, nextH, currentIndex, currentH;
  if (nextIndex === -1) {
    nextKey = 'Fajr'; nextH = order[0] + 24; currentIndex = 4; currentH = order[4];
  } else {
    nextKey = SALAH[nextIndex].key; nextH = order[nextIndex];
    currentIndex = nextIndex === 0 ? 4 : nextIndex - 1;
    currentH = nextIndex === 0 ? order[4] - 24 : order[currentIndex];
  }
  const currentKey = SALAH[currentIndex].key;
  $('current-name').textContent = currentKey;
  $('current-status').textContent = `since ${fmt12(currentH)}`;
  $('next-name').textContent = nextKey;
  $('next-time').textContent = fmt12(nextH);

  let diff = Math.max(0, Math.round((nextH - nowH) * 3600));
  const dh = Math.floor(diff / 3600); diff -= dh * 3600;
  const dm = Math.floor(diff / 60), ds = diff - dm * 60;
  $('countdown').textContent = [dh, dm, ds].map(x => String(x).padStart(2, '0')).join(':');

  const today = now.toDateString();
  if (alertedToday.day !== today) alertedToday = { day: today };
  for (const p of SALAH) {
    const sec = Math.round(prayerHours[p.key] * 3600), nowSec = Math.round(nowH * 3600);
    if (!alertedToday[p.key] && nowSec >= sec && nowSec - sec <= 2) {
      alertedToday[p.key] = true;
      firePrayerAlert(p);
    }
  }
}

/* ---------------- alert + chime ---------------- */
let alertTimer = null;
function firePrayerAlert(p) {
  $('alert-name').textContent = p.key;
  $('alert-ar').textContent = p.ar;
  $('alert').classList.add('show');
  chime();
  clearTimeout(alertTimer);
  alertTimer = setTimeout(dismissAlert, 60000);
}
function dismissAlert() { $('alert').classList.remove('show'); }
function alertOpen() { return $('alert').classList.contains('show'); }
let audioCtx = null;
function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = audioCtx.currentTime + i * 0.45;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.65);
    });
  } catch (e) {}
}

/* ---------------- tajweed colour helper ---------------- */
const TJ = (function () {
  const COMB = c => (c >= 0x064B && c <= 0x0655) || c === 0x0670 || (c >= 0x06D6 && c <= 0x06ED);
  const SHADDA = 0x0651, SUKUN = 0x0652, MADDAH = 0x0653, TANWIN = [0x064B, 0x064C, 0x064D];
  const isLetter = c => c >= 0x0621 && c <= 0x064A;
  const QALQ = '\u0642\u0637\u0628\u062C\u062F', IDGHAM = '\u064A\u0631\u0645\u0644\u0648\u0646';
  const IQLAB = '\u0628', IZHAR = '\u0621\u0647\u0639\u062D\u063A\u062E\u0623\u0625\u0622\u0627', LONG = '\u0627\u0648\u064A';
  function units(t) {
    const u = []; let cur = null;
    for (const ch of String(t || '')) {
      const c = ch.codePointAt(0);
      if (COMB(c) && cur) { cur.s += ch; cur.marks.push(c); }
      else { cur = { base: c, s: ch, marks: [] }; u.push(cur); }
    }
    return u;
  }
  function nextLetter(u, i) { for (let j = i + 1; j < u.length; j++) if (isLetter(u[j].base)) return u[j].base; return 0; }
  function classify(u, i) {
    const it = u[i], b = it.base, mk = it.marks;
    const has = c => mk.indexOf(c) >= 0;
    const tanwin = TANWIN.some(t => has(t));
    if (has(SHADDA) && (b === 0x0646 || b === 0x0645)) return 'ghunnah';
    if ((b === 0x0646 && has(SUKUN)) || tanwin) {
      const s = String.fromCodePoint(nextLetter(u, i));
      if (IQLAB.indexOf(s) >= 0) return 'iqlab';
      if (IDGHAM.indexOf(s) >= 0) return 'idgham';
      if (IZHAR.indexOf(s) >= 0) return null;
      return 'ikhfa';
    }
    if (QALQ.indexOf(String.fromCodePoint(b)) >= 0 && has(SUKUN)) return 'qalqalah';
    if (b === 0x0622 || has(MADDAH)) return 'madd';
    if (LONG.indexOf(String.fromCodePoint(b)) >= 0 && mk.length === 0) return 'madd';
    return null;
  }
  function colour(t) {
    const u = units(t); let out = '';
    for (let i = 0; i < u.length; i++) {
      const c = classify(u, i);
      out += c ? `<span class="tj-${c}">${u[i].s}</span>` : u[i].s;
    }
    return out;
  }
  return { colour };
})();
function arHtml(t) { return S.tajweed ? TJ.colour(t) : escapeHtml(t || ''); }
function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------------- content + single-card view ---------------- */
const FILES = { azkar: 'content/azkar.json', duas: 'content/duas.json', kalima: 'content/kalima.json' };
let DATA = null;
const cur = { type: 'azkar', cat: 0, item: 0 };

function loadJSON(url) {
  return fetch(url).then(r => r.json()).catch(() => new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.onreadystatechange = () => {
      if (x.readyState === 4) {
        try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(e); }
      }
    };
    x.send();
  }));
}
function currentData() { return DATA[cur.type]; }
function currentCat() { return currentData().categories[cur.cat]; }
function currentItem() { return currentCat().items[cur.item]; }

function renderType() {
  if (!DATA) return;
  const data = currentData();
  card().dataset.type = cur.type;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.type === cur.type));
  $('card-ic').textContent = ICONS[cur.type];
  $('card-title').textContent = data.title || TYPE_LABEL[cur.type];
  renderChips();
}
function renderChips() {
  const chips = $('chips');
  chips.innerHTML = '';
  currentData().categories.forEach((category, index) => {
    const chip = document.createElement('button');
    chip.className = 'chip focusable';
    chip.textContent = category.label;
    chip.onclick = () => { cur.cat = index; cur.item = 0; renderItem(); resetRotate(); setFocus(card()); };
    chips.appendChild(chip);
  });
}
function renderItem() {
  if (!DATA) return;
  const cat = currentCat(), it = currentItem();
  document.querySelectorAll('#chips .chip').forEach((c, i) => c.classList.toggle('on', i === cur.cat));
  $('card-sub').textContent = cat.label || '';

  const title = it.name || cat.label || TYPE_LABEL[cur.type];
  const rep = it.rep ? `<span class="rep">${escapeHtml(it.rep)}</span>` : '';
  body().scrollTop = 0;
  body().classList.remove('long-content');
  body().innerHTML =
    `<div class="item-name">${escapeHtml(title)}${rep}</div>` +
    `<div class="ar">${arHtml(it.ar)}</div>` +
    `<div class="tr">${escapeHtml(it.tr || '')}</div>` +
    `<div class="en">${escapeHtml(it.en || '')}</div>` +
    `<div class="src">${escapeHtml(it.src || '')}</div>`;

  $('foot-pos').textContent = `${cur.item + 1} / ${cat.items.length} · ${cat.label}`;
  updateFavoriteButton();
  window.requestAnimationFrame(fitArabic);
}
function fitArabic() {
  const b = body();
  const ar = b.querySelector('.ar');
  if (!ar) return;
  b.classList.remove('long-content');
  ar.style.fontSize = '';

  const length = (ar.textContent || '').replace(/\s+/g, '').length;
  let size = parseFloat(getComputedStyle(ar).fontSize);
  const minSize = window.innerWidth <= 900 || window.matchMedia('(orientation:portrait)').matches ? 24 : 30;

  if (length > 240) size *= 0.72;
  else if (length > 170) size *= 0.80;
  else if (length > 110) size *= 0.88;
  ar.style.fontSize = Math.max(minSize, Math.floor(size)) + 'px';

  let guard = 70;
  while (b.scrollHeight > b.clientHeight + 2 && parseFloat(ar.style.fontSize) > minSize && guard-- > 0) {
    const next = parseFloat(ar.style.fontSize) - 2;
    ar.style.fontSize = Math.max(minSize, next) + 'px';
  }
  if (b.scrollHeight > b.clientHeight + 2) b.classList.add('long-content');
}
function switchType(t) {
  cur.type = t; cur.cat = 0; cur.item = 0;
  renderType(); renderItem(); resetRotate(); setFocus(card());
}
function nextType(t) { return TYPES[(TYPES.indexOf(t) + 1) % TYPES.length]; }
function prevType(t) { return TYPES[(TYPES.indexOf(t) + TYPES.length - 1) % TYPES.length]; }
function switchCategory(delta) {
  if (!DATA) return;
  const cats = currentData().categories;
  if (cats.length <= 1) return;
  cur.cat = (cur.cat + delta + cats.length) % cats.length;
  cur.item = 0;
  renderItem(); resetRotate(); setFocus(card());
}
function step(delta) {
  let data = currentData(), cat = currentCat();
  let structural = false;
  cur.item += delta;
  if (cur.item >= cat.items.length) {
    cur.item = 0; cur.cat++; structural = true;
    if (cur.cat >= data.categories.length) {
      cur.cat = 0;
      if (S.rotateType) cur.type = nextType(cur.type);
    }
  } else if (cur.item < 0) {
    cur.cat--; structural = true;
    if (cur.cat < 0) {
      if (S.rotateType) cur.type = prevType(cur.type);
      cur.cat = DATA[cur.type].categories.length - 1;
    }
    cur.item = DATA[cur.type].categories[cur.cat].items.length - 1;
  }
  if (structural) renderType();
  renderItem();
}
const nextItem = () => step(1), prevItem = () => step(-1);

/* ---------------- favorites ---------------- */
let favorites = loadFavorites();
function loadFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY)) || []); } catch (e) { return new Set(); }
}
function saveFavorites() {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); } catch (e) {}
}
function hashText(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}
function favoriteKey(type, catIndex, itemIndex) {
  const item = DATA[type].categories[catIndex].items[itemIndex];
  return `${type}:${hashText((item.name || '') + '|' + (item.ar || '') + '|' + (item.src || ''))}`;
}
function currentFavoriteKey() { return favoriteKey(cur.type, cur.cat, cur.item); }
function isCurrentFavorite() { return favorites.has(currentFavoriteKey()); }
function updateFavoriteButton() {
  const btn = $('fav-toggle');
  if (!btn || !DATA) return;
  const on = isCurrentFavorite();
  btn.textContent = on ? '★' : '☆';
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-label', on ? 'Remove favorite' : 'Add favorite');
  btn.title = on ? 'Remove favorite' : 'Add favorite';
}
function toggleFavorite() {
  if (!DATA) return;
  const key = currentFavoriteKey();
  if (favorites.has(key)) favorites.delete(key); else favorites.add(key);
  saveFavorites();
  updateFavoriteButton();
}
function favoriteEntries() {
  const entries = [];
  if (!DATA) return entries;
  TYPES.forEach(type => {
    DATA[type].categories.forEach((cat, ci) => {
      cat.items.forEach((it, ii) => {
        const key = favoriteKey(type, ci, ii);
        if (favorites.has(key)) entries.push({ key, type, ci, ii, cat, it });
      });
    });
  });
  return entries;
}
function jumpTo(type, ci, ii) {
  cur.type = type; cur.cat = ci; cur.item = ii;
  closeOverlay(); renderType(); renderItem(); resetRotate(); setFocus(card());
}

/* ---------------- rotation ---------------- */
let paused = false, rotTimer = null;
function busy() { return overlayOpen || settingsOpen || alertOpen(); }
function startRotate() {
  clearInterval(rotTimer);
  const run = (S.autoRotate || SCREENSAVER) && !paused;
  if (!run) return;
  let sec = S.timerSec;
  if (SCREENSAVER) sec = Math.min(sec, 30);
  rotTimer = setInterval(() => { if (!busy()) nextItem(); }, sec * 1000);
}
function resetRotate() { startRotate(); }
function togglePause() {
  paused = !paused;
  $('pause').textContent = paused ? '► Resume' : '❚❚ Pause';
  startRotate();
}

/* ---------------- view-all / favorites overlay ---------------- */
let overlayOpen = false;
function addOverlayItem(list, type, ci, ii, catg, it) {
  const d = document.createElement('div');
  d.className = 'ov-item focusable';
  d.tabIndex = 0;
  d.innerHTML =
    `<div class="ov-meta">${escapeHtml(TYPE_LABEL[type])} • ${escapeHtml(catg.label || '')}</div>` +
    `<div class="ar">${arHtml(it.ar)}</div>` +
    `<div class="tr">${escapeHtml(it.tr || '')}</div>` +
    `<div class="en">${escapeHtml(it.en || '')}</div>` +
    `<div class="src">${escapeHtml(it.src || '')}</div>`;
  d.onclick = () => jumpTo(type, ci, ii);
  list.appendChild(d);
}
function openOverlay(type, mode) {
  const list = $('ov-list');
  list.innerHTML = '';
  if (mode === 'favorites') {
    $('ov-title').textContent = 'Favorites';
    $('ov-sub').textContent = `${favorites.size} saved item${favorites.size === 1 ? '' : 's'}`;
    const favs = favoriteEntries();
    if (!favs.length) {
      const empty = document.createElement('div');
      empty.className = 'ov-empty';
      empty.textContent = 'No favorites saved yet. Use the star in the card footer or long-press the card on mobile.';
      list.appendChild(empty);
    } else {
      favs.forEach(f => addOverlayItem(list, f.type, f.ci, f.ii, f.cat, f.it));
    }
  } else {
    const data = DATA[type];
    $('ov-title').textContent = data.title;
    $('ov-sub').textContent = data.subtitle || '';
    data.categories.forEach((catg, ci) => {
      const hd = document.createElement('div');
      hd.className = 'ov-cat'; hd.textContent = catg.label; list.appendChild(hd);
      catg.items.forEach((it, ii) => addOverlayItem(list, type, ci, ii, catg, it));
    });
  }
  list.scrollTop = 0;
  $('overlay').classList.add('show');
  overlayOpen = true;
  const first = list.querySelector('.focusable');
  if (first) setFocus(first);
}
function closeOverlay() { $('overlay').classList.remove('show'); overlayOpen = false; setFocus(card()); }

/* ---------------- settings panel with Save & Apply only ---------------- */
let settingsOpen = false;
function getDraft() { if (!draftSettings) draftSettings = clone(S); return draftSettings; }
function openSettings() {
  draftSettings = clone(S);
  settingsOpen = true;
  $('settings').classList.add('show');
  syncSettingsUI();
  $('set-status').textContent = 'Changes apply only after Save & Apply.';
  setFocus($('set-save'));
}
function closeSettings() {
  draftSettings = null;
  settingsOpen = false;
  $('settings').classList.remove('show');
  startRotate(); setFocus(card());
}
function saveAndApplySettings() {
  S = Object.assign({}, DEFAULTS, getDraft());
  applySettings(true);
  $('set-status').textContent = 'Saved and applied.';
  setFocus($('set-close'));
}
function syncSettingsUI() {
  const D = settingsOpen ? getDraft() : S;
  document.querySelectorAll('#theme-row .opt').forEach(o => o.classList.toggle('on', o.dataset.theme === D.theme));
  document.querySelectorAll('#timer-presets .opt').forEach(o => o.classList.toggle('on', +o.dataset.min * 60 === D.timerSec));
  $('cust-val').textContent = D.timerSec;
  $('ar-pct').textContent = Math.round(D.ar * 100) + '%';
  $('tr-pct').textContent = Math.round(D.tr * 100) + '%';
  $('en-pct').textContent = Math.round(D.en * 100) + '%';
  document.querySelectorAll('.toggle').forEach(t => {
    const key = t.dataset.tog;
    t.textContent = `${TOGNAMES[key]}: ${D[key] ? 'On' : 'Off'}`;
    t.classList.toggle('on', !!D[key]);
  });
}
function markPending() { $('set-status').textContent = 'Unsaved changes. Press Save & Apply to update the display.'; syncSettingsUI(); }
function initSettings() {
  $('gear').onclick = openSettings;
  $('set-close').onclick = closeSettings;
  $('set-save').onclick = saveAndApplySettings;
  document.querySelectorAll('#timer-presets .opt').forEach(o => o.onclick = () => { getDraft().timerSec = +o.dataset.min * 60; markPending(); });
  $('cust-dn').onclick = () => { getDraft().timerSec = clamp(getDraft().timerSec - 15, 10, 3600); markPending(); };
  $('cust-up').onclick = () => { getDraft().timerSec = clamp(getDraft().timerSec + 15, 10, 3600); markPending(); };
  $('cust-apply').onclick = () => { markPending(); };
  document.querySelectorAll('#theme-row .opt').forEach(o => o.onclick = () => { getDraft().theme = o.dataset.theme; markPending(); });
  document.querySelectorAll('[data-font]').forEach(b => b.onclick = () => {
    const f = b.dataset.font;
    getDraft()[f] = clamp(+(getDraft()[f] + (+b.dataset.d) * 0.1).toFixed(2), 0.6, 2.0);
    markPending();
  });
  document.querySelectorAll('.toggle').forEach(t => t.onclick = () => { const D = getDraft(); D[t.dataset.tog] = !D[t.dataset.tog]; markPending(); });
}

/* ---------------- card touch: swipe category + long-press favorite ---------------- */
let touchStart = null, longPressTimer = null, longPressDone = false;
function initCardGestures() {
  const el = card();
  el.onclick = () => setFocus(el);
  el.addEventListener('pointerdown', ev => {
    if (ev.target.closest('button')) return;
    setFocus(el);
    longPressDone = false;
    touchStart = { x: ev.clientX, y: ev.clientY, t: Date.now() };
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (!touchStart) return;
      longPressDone = true;
      toggleFavorite();
      if (navigator.vibrate) navigator.vibrate(35);
    }, 700);
  });
  el.addEventListener('pointermove', ev => {
    if (!touchStart) return;
    if (Math.abs(ev.clientX - touchStart.x) > 12 || Math.abs(ev.clientY - touchStart.y) > 12) clearTimeout(longPressTimer);
  });
  el.addEventListener('pointerup', ev => {
    clearTimeout(longPressTimer);
    if (!touchStart || longPressDone) { touchStart = null; return; }
    const dx = ev.clientX - touchStart.x;
    const dy = ev.clientY - touchStart.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) switchCategory(dx < 0 ? 1 : -1);
    touchStart = null;
  });
  el.addEventListener('pointercancel', () => { clearTimeout(longPressTimer); touchStart = null; });
}

/* ---------------- spatial remote navigation ---------------- */
let curFocus = null;
function visibleFocusables() {
  const scope = settingsOpen ? $('settings') : (overlayOpen ? $('overlay') : $('shift'));
  return [...scope.querySelectorAll('.focusable')].filter(el => {
    if (el.offsetParent === null && !el.classList.contains('card')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}
function setFocus(el) {
  if (!el) return;
  document.querySelectorAll('.focusable.focused').forEach(e => e.classList.remove('focused'));
  el.classList.add('focused'); curFocus = el;
  if (el.scrollIntoView && el !== card()) el.scrollIntoView({ block: 'nearest' });
}
function ctr(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function move(dir) {
  const list = visibleFocusables(); if (!list.length) return;
  if (!curFocus || list.indexOf(curFocus) < 0) { setFocus(list[0]); return; }
  const c = ctr(curFocus); let best = null, score = Infinity;
  for (const el of list) {
    if (el === curFocus) continue;
    const t = ctr(el), dx = t.x - c.x, dy = t.y - c.y;
    let ok, pri, sec;
    if (dir === 'right') { ok = dx > 6; pri = dx; sec = Math.abs(dy); }
    else if (dir === 'left') { ok = dx < -6; pri = -dx; sec = Math.abs(dy); }
    else if (dir === 'down') { ok = dy > 6; pri = dy; sec = Math.abs(dx); }
    else { ok = dy < -6; pri = -dy; sec = Math.abs(dx); }
    if (!ok) continue;
    const sc = pri + sec * 2;
    if (sc < score) { score = sc; best = el; }
  }
  if (best) setFocus(best);
}
function scrollCardIfNeeded(dir) {
  if (curFocus !== card()) return false;
  const b = body();
  if (!b || b.scrollHeight <= b.clientHeight + 4) return false;
  const max = b.scrollHeight - b.clientHeight;
  if (dir === 'down' && b.scrollTop < max - 2) { b.scrollTop += b.clientHeight * 0.35; return true; }
  if (dir === 'up' && b.scrollTop > 2) { b.scrollTop -= b.clientHeight * 0.35; return true; }
  return false;
}
function onBack() {
  if (alertOpen()) { dismissAlert(); return true; }
  if (settingsOpen) { closeSettings(); return true; }
  if (overlayOpen) { closeOverlay(); return true; }
  return false;
}
window.onTvBack = onBack;

document.addEventListener('keydown', e => {
  if (alertOpen()) { dismissAlert(); e.preventDefault(); return; }
  const k = e.key;

  if (overlayOpen && !settingsOpen) {
    if (k === 'ArrowDown') { if (!curFocus || curFocus === $('ov-list')) $('ov-list').scrollTop += $('ov-list').clientHeight * 0.5; else move('down'); e.preventDefault(); }
    else if (k === 'ArrowUp') { if (!curFocus || curFocus === $('ov-list')) $('ov-list').scrollTop -= $('ov-list').clientHeight * 0.5; else move('up'); e.preventDefault(); }
    else if (k === 'ArrowRight') { move('right'); e.preventDefault(); }
    else if (k === 'ArrowLeft') { move('left'); e.preventDefault(); }
    else if (k === 'Enter') { if (curFocus && curFocus.classList.contains('ov-item')) curFocus.click(); else closeOverlay(); e.preventDefault(); }
    else if (k === 'Escape' || k === 'Backspace') { closeOverlay(); e.preventDefault(); }
    return;
  }

  if (!settingsOpen && curFocus === card() && (k === 'ArrowRight' || k === 'ArrowLeft')) {
    switchCategory(k === 'ArrowRight' ? 1 : -1);
    e.preventDefault(); return;
  }
  if (!settingsOpen && (k === 'ArrowDown' || k === 'ArrowUp') && scrollCardIfNeeded(k === 'ArrowDown' ? 'down' : 'up')) {
    e.preventDefault(); return;
  }

  switch (k) {
    case 'ArrowRight': move('right'); e.preventDefault(); break;
    case 'ArrowLeft': move('left'); e.preventDefault(); break;
    case 'ArrowDown': move('down'); e.preventDefault(); break;
    case 'ArrowUp': move('up'); e.preventDefault(); break;
    case 'Enter': if (curFocus) curFocus.click(); e.preventDefault(); break;
    case 'Escape': case 'Backspace': onBack(); e.preventDefault(); break;
  }
});

/* ---------------- burn-in protection ---------------- */
const SHIFTS = [[0, 0], [8, 4], [-6, 8], [6, -6], [-8, -4], [4, 6]];
let shiftIdx = 0;
function burnInShift() {
  shiftIdx = (shiftIdx + 1) % SHIFTS.length;
  const [x, y] = SHIFTS[shiftIdx];
  $('shift').style.transform = `translate(${x}px, ${y}px)`;
}

/* ---------------- boot ---------------- */
function start() {
  applySettings(false);
  setNet(navigator.onLine);
  computeTimes(); tickClock();
  setInterval(tickClock, 1000);
  setInterval(computeTimes, 30 * 60 * 1000);

  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchType(t.dataset.type));
  $('prev').onclick = prevItem;
  $('next').onclick = nextItem;
  $('pause').onclick = togglePause;
  $('viewall').onclick = () => openOverlay(cur.type, 'all');
  $('fav-view').onclick = () => openOverlay(cur.type, 'favorites');
  $('fav-toggle').onclick = toggleFavorite;
  initSettings();
  initCardGestures();

  Promise.all(TYPES.map(n => loadJSON(FILES[n]).then(d => [n, d]))).then(pairs => {
    DATA = {}; pairs.forEach(([n, d]) => DATA[n] = d);
    renderType(); renderItem(); setFocus(card()); startRotate();
  }).catch(err => { body().innerHTML = '<div style="color:#b00">Content failed to load: ' + escapeHtml(err) + '</div>'; });

  setInterval(burnInShift, SCREENSAVER ? 20000 : 30000);
  window.addEventListener('resize', fitArabic);

  detectLocation().then(g => {
    if (g) { GEO = g; saveGeo(g); setNet(true); computeTimes(); }
    else setNet(false);
  }).catch(() => setNet(false));
  window.addEventListener('online', () => { setNet(true); detectLocation().then(g => { if (g) { GEO = g; saveGeo(g); computeTimes(); } }); });
  window.addEventListener('offline', () => setNet(false));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
