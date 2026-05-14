'use strict';
const DIRECT_FILE_RE = /\.(mkv|mp4|webm|avi|mov|m4v|ts|flv|wmv|m2ts|mts|ogv|3gp)(\?.*)?$/i;
let config = { mpcPath:'', ytdlpPath:'', history:[], queue:[], theme:'dark' };
let urlProbeTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  applyTheme('dark');
  window.api.onConfigLoaded(data => {
    config = data; applyTheme(config.theme || 'dark');
    checkSetupWarning(); renderHistory(); renderQueue(); loadSettings(); loadYtdlpVersion();
  });
  window.api.onHistoryUpdated(h => { config.history = h; renderHistory(); });

  document.getElementById('btn-minimize').onclick = () => window.api.minimize();
  document.getElementById('btn-maximize').onclick = () => window.api.maximize();
  document.getElementById('btn-close').onclick    = () => window.api.close();

  document.querySelectorAll('.nav-item[data-tab]').forEach(b =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.getElementById('theme-toggle').onclick = toggleTheme;

  document.getElementById('launch-btn').onclick    = launchStream;
  document.getElementById('add-queue-btn').onclick = addToQueue;
  document.getElementById('paste-btn').onclick     = pasteUrl;

  const urlInput = document.getElementById('url-input');
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') launchStream(); });
  urlInput.addEventListener('input', () => {
    clearTimeout(urlProbeTimer);
    urlProbeTimer = setTimeout(() => probeUrl(urlInput.value.trim()), 350);
  });

  document.querySelectorAll('.site-chip').forEach(c =>
    c.addEventListener('click', () => window.api.openExternal(c.dataset.url)));
  document.querySelector('[data-goto="settings"]')?.addEventListener('click', () => switchTab('settings'));

  document.getElementById('clear-history-btn').onclick = async () => {
    await window.api.clearHistory(); config.history = []; renderHistory();
  };
  document.getElementById('launch-all-btn').onclick  = launchAllQueue;
  document.getElementById('clear-queue-btn').onclick = async () => {
    for (const i of [...config.queue]) await window.api.removeFromQueue(i.id);
    config.queue = []; renderQueue();
  };
  document.getElementById('mpc-browse-btn').onclick = async () => {
    const p = await window.api.browseExe('mpc');
    if (p) { document.getElementById('mpc-path-input').value = p; checkPathStatus('mpc', p); }
  };
  document.getElementById('ytdlp-browse-btn').onclick = async () => {
    const p = await window.api.browseExe('ytdlp');
    if (p) { document.getElementById('ytdlp-path-input').value = p; checkPathStatus('ytdlp', p); loadYtdlpVersion(); }
  };
  document.getElementById('mpc-path-input').onchange   = e => checkPathStatus('mpc', e.target.value);
  document.getElementById('ytdlp-path-input').onchange = e => checkPathStatus('ytdlp', e.target.value);
  document.getElementById('save-settings-btn').onclick = saveSettings;
  document.getElementById('download-ytdlp-btn').onclick = () =>
    window.api.openExternal('https://github.com/yt-dlp/yt-dlp/releases/latest');
  document.querySelectorAll('[data-ext]').forEach(b =>
    b.addEventListener('click', () => window.api.openExternal(b.dataset.ext)));
});

function switchTab(tab) {
  document.querySelectorAll('.nav-item[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${tab}`));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const icon = document.getElementById('theme-icon');
  if (!icon) return;
  icon.innerHTML = theme === 'dark'
    ? '<path d="M17 12.5A7 7 0 1 1 7.5 3a5.5 5.5 0 0 0 9.5 9.5z"/>'
    : '<circle cx="10" cy="10" r="4"/><line x1="10" y1="2" x2="10" y2="0"/><line x1="10" y1="18" x2="10" y2="20"/><line x1="2" y1="10" x2="0" y2="10"/><line x1="18" y1="10" x2="20" y2="10"/>';
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next); window.api.saveTheme(next); config.theme = next;
}

async function probeUrl(url) {
  const badge = document.getElementById('url-type-badge');
  const note  = document.getElementById('ytdlp-note');
  if (!url) { badge.style.display = 'none'; return; }
  const info = await window.api.probeUrlType(url);
  if (info.type === 'direct') {
    badge.className = 'url-type-badge direct';
    badge.textContent = `⬤ Direct ${info.ext} file — skipping yt-dlp, launching straight into MPC-HC`;
    badge.style.display = 'inline-flex';
    note.style.color = 'var(--color-direct)';
  } else if (info.type === 'webpage') {
    badge.className = 'url-type-badge webpage';
    badge.textContent = `⬤ Webpage (${info.host}) — yt-dlp will resolve the stream URL`;
    badge.style.display = 'inline-flex';
    note.style.color = '';
  } else {
    badge.style.display = 'none'; note.style.color = '';
  }
}

function checkSetupWarning() {
  document.getElementById('setup-warning').style.display = !config.mpcPath ? 'flex' : 'none';
}

async function pasteUrl() {
  try {
    const t = await navigator.clipboard.readText();
    if (t?.startsWith('http')) { document.getElementById('url-input').value = t.trim(); probeUrl(t.trim()); }
  } catch {}
}

async function launchStream() {
  const url        = document.getElementById('url-input').value.trim();
  const quality    = document.getElementById('quality-select').value;
  const useYtdlp   = document.getElementById('use-ytdlp').checked;
  const customArgs = document.getElementById('custom-args').value.trim();
  if (!url) { showStatus('error', 'Please enter a URL first.'); return; }
  showStatus('loading', 'Launching…');
  const r = await window.api.launchStream({ url, quality, useYtdlp, customArgs });
  if (r.success) {
    const tag = r.mode ? `<span class="mode-tag mode-${r.mode}">${r.mode.toUpperCase()}</span>` : '';
    showStatus('success', `${r.message || 'Launched!'}${tag}`);
  } else {
    showStatus('error', r.error || 'Failed to launch.');
  }
}

let statusTimer;
function showStatus(type, html) {
  const el = document.getElementById('status-msg');
  const icons = {
    success: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="2,8 6,12 14,4"/></svg>',
    error:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="9"/><circle cx="8" cy="11.5" r=".75" fill="currentColor"/></svg>',
    loading: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="8" cy="8" r="6" stroke-dasharray="28" stroke-dashoffset="10"/></svg>'
  };
  el.className = `status-msg ${type} show`;
  el.innerHTML = `${icons[type]||''}<span>${html}</span>`;
  clearTimeout(statusTimer);
  if (type !== 'loading') statusTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

async function addToQueue() {
  const url = document.getElementById('url-input').value.trim();
  if (!url) { showStatus('error', 'Enter a URL to queue.'); return; }
  const q = await window.api.addToQueue({
    url, quality: document.getElementById('quality-select').value,
    useYtdlp: document.getElementById('use-ytdlp').checked,
    title: extractTitle(url), addedAt: Date.now()
  });
  config.queue = q; renderQueue(); showStatus('success', 'Added to queue.');
}

async function launchAllQueue() {
  for (const item of config.queue) {
    await window.api.launchStream({ url: item.url, quality: item.quality || 'best', useYtdlp: item.useYtdlp !== false });
    await new Promise(r => setTimeout(r, 600));
  }
}

function renderQueue() {
  const c = document.getElementById('queue-list');
  c.querySelectorAll('.item-card').forEach(e => e.remove());
  document.getElementById('queue-empty').style.display = config.queue.length ? 'none' : 'flex';
  config.queue.forEach((item, i) => {
    const card = buildCard(item.title || extractTitle(item.url), item.url, `Quality: ${item.quality || 'best'}`, [
      { label:'Launch', icon:playIcon(), action: async () => {
          const r = await window.api.launchStream({ url:item.url, quality:item.quality||'best', useYtdlp:item.useYtdlp!==false });
          if (!r.success) alert(r.error);
      }},
      { label:'Remove', icon:trashIcon(), danger:true, action: async () => {
          config.queue = await window.api.removeFromQueue(item.id); renderQueue();
      }}
    ]);
    card.style.animationDelay = `${i*30}ms`; c.appendChild(card);
  });
  const badge = document.getElementById('queue-badge');
  badge.textContent = config.queue.length;
  badge.style.display = config.queue.length ? 'flex' : 'none';
}

function renderHistory() {
  const c = document.getElementById('history-list');
  c.querySelectorAll('.item-card').forEach(e => e.remove());
  document.getElementById('history-empty').style.display = config.history.length ? 'none' : 'flex';
  config.history.forEach((item, i) => {
    const card = buildCard(item.title || extractTitle(item.url), item.url, formatTimeAgo(item.timestamp), [
      { label:'Play again', icon:playIcon(), action: async () => {
          document.getElementById('url-input').value = item.url;
          probeUrl(item.url); switchTab('play'); await launchStream();
      }},
      { label:'Copy URL', icon:copyIcon(), action: () => navigator.clipboard.writeText(item.url).catch(()=>{}) },
      { label:'Remove', icon:trashIcon(), danger:true, action: async () => {
          config.history = await window.api.removeHistoryItem(item.url); renderHistory();
      }}
    ]);
    card.style.animationDelay = `${i*25}ms`; c.appendChild(card);
  });
}

function loadSettings() {
  if (config.mpcPath)   document.getElementById('mpc-path-input').value   = config.mpcPath;
  if (config.ytdlpPath) document.getElementById('ytdlp-path-input').value = config.ytdlpPath;
  if (config.mpcPath)   checkPathStatus('mpc',   config.mpcPath);
  if (config.ytdlpPath) checkPathStatus('ytdlp', config.ytdlpPath);
}
async function checkPathStatus(type, p) {
  const el = document.getElementById(`${type}-status`);
  if (!p) { el.textContent = ''; el.className = 'path-status'; return; }
  const ok = await window.api.checkPath(p);
  el.className = `path-status ${ok ? 'ok' : 'err'}`;
  el.innerHTML = ok
    ? `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="2,7 5,10 12,3"/></svg> Found`
    : `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg> Not found`;
}
async function saveSettings() {
  const mpcPath   = document.getElementById('mpc-path-input').value.trim();
  const ytdlpPath = document.getElementById('ytdlp-path-input').value.trim();
  await window.api.savePaths({ mpcPath, ytdlpPath });
  config.mpcPath = mpcPath; config.ytdlpPath = ytdlpPath; checkSetupWarning();
  const s = document.getElementById('save-status');
  s.textContent = '✓ Saved'; s.className = 'save-status ok show';
  setTimeout(() => { s.className = 'save-status'; }, 2500);
  loadYtdlpVersion();
}
async function loadYtdlpVersion() {
  const v = await window.api.getYtdlpVersion();
  const el = document.getElementById('ytdlp-version');
  if (el) el.textContent = v || 'Not configured';
}

function buildCard(title, url, meta, actions) {
  const card = document.createElement('div'); card.className = 'item-card';
  card.innerHTML = `<div class="item-icon">${videoIcon()}</div><div class="item-info"><div class="item-title">${esc(title)}</div><div class="item-url">${esc(url)}</div><div class="item-meta">${esc(meta)}</div></div><div class="item-actions"></div>`;
  const ac = card.querySelector('.item-actions');
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = `icon-btn${a.danger ? ' danger' : ''}`;
    b.title = a.label; b.setAttribute('aria-label', a.label); b.innerHTML = a.icon;
    b.addEventListener('click', a.action); ac.appendChild(b);
  });
  return card;
}
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const extractTitle = url => { try { const u=new URL(url),h=u.hostname.replace('www.',''),l=decodeURIComponent(u.pathname.split('/').filter(Boolean).pop()||''); return l?`${h} — ${l.replace(/[-_.+]/g,' ').slice(0,50)}`:h; } catch { return url.slice(0,60); } };
const formatTimeAgo = ts => { const s=Math.floor((Date.now()-ts)/1000); if(s<60)return'Just now'; if(s<3600)return`${Math.floor(s/60)}m ago`; if(s<86400)return`${Math.floor(s/3600)}h ago`; return`${Math.floor(s/86400)}d ago`; };
const playIcon  = () => '<svg viewBox="0 0 14 14" fill="currentColor"><polygon points="2,2 12,7 2,12"/></svg>';
const trashIcon = () => '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1,3 13,3"/><path d="M5,3V2h4v1"/><rect x="2" y="4" width="10" height="8" rx="1"/><line x1="5" y1="7" x2="5" y2="10"/><line x1="9" y1="7" x2="9" y2="10"/></svg>';
const copyIcon  = () => '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="8" height="9" rx="1"/><path d="M4 4H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1"/></svg>';
const videoIcon = () => '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="9" height="8" rx="1"/><polygon points="10,5 13,7 10,9" fill="currentColor" stroke="none"/></svg>';