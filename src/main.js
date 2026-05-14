const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');

let mainWindow;
let config = { mpcPath: '', ytdlpPath: '', history: [], queue: [], theme: 'dark' };
const CONFIG_FILE = path.join(app.getPath('userData'), 'mpc-launcher-config.json');

// ── Direct file URL detector (THE FIX for Gofile + direct links) ──
const DIRECT_FILE_RE = /\.(mkv|mp4|webm|avi|mov|m4v|ts|flv|wmv|m2ts|mts|ogv|3gp)(\?.*)?$/i;
function isDirectFileUrl(url) {
  try {
    const u = new URL(url);
    return DIRECT_FILE_RE.test(u.pathname);
  } catch {
    return DIRECT_FILE_RE.test(url);
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE))
      config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {}
}
function saveConfig() {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); } catch {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 860, height: 680, minWidth: 680, minHeight: 520,
    frame: false, backgroundColor: '#111110',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.on('did-finish-load', () =>
    mainWindow.webContents.send('config-loaded', config));
}

app.whenReady().then(() => { loadConfig(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window-close', () => mainWindow.close());

ipcMain.handle('browse-exe', async (_, type) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: type === 'mpc' ? 'Select mpc-hc64.exe' : 'Select yt-dlp.exe',
    filters: [{ name: 'Executables', extensions: ['exe'] }],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths[0]) {
    if (type === 'mpc') config.mpcPath = result.filePaths[0];
    else config.ytdlpPath = result.filePaths[0];
    saveConfig();
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-config', () => config);
ipcMain.handle('save-paths', (_, { mpcPath, ytdlpPath }) => {
  config.mpcPath = mpcPath; config.ytdlpPath = ytdlpPath; saveConfig(); return true;
});
ipcMain.handle('save-theme', (_, theme) => { config.theme = theme; saveConfig(); return true; });
ipcMain.handle('check-path', (_, p) => !!(p && fs.existsSync(p)));
ipcMain.handle('open-external', (_, url) => shell.openExternal(url));

// ── URL type probe for UI badge ──
ipcMain.handle('probe-url-type', (_, url) => {
  try {
    const trimmed = url.trim();
    if (!trimmed) return { type: 'unknown' };
    if (isDirectFileUrl(trimmed)) {
      const ext = trimmed.match(DIRECT_FILE_RE)?.[1]?.toUpperCase() || 'FILE';
      return { type: 'direct', ext };
    }
    const host = new URL(trimmed).hostname.replace('www.', '');
    return { type: 'webpage', host };
  } catch { return { type: 'unknown' }; }
});

// ── Launch stream (FIXED) ──
ipcMain.handle('launch-stream', async (_, { url, quality, useYtdlp, customArgs }) => {
  if (!config.mpcPath || !fs.existsSync(config.mpcPath))
    return { success: false, error: 'MPC-HC path not set. Go to Settings.' };

  const trimmed = url.trim();
  if (!trimmed) return { success: false, error: 'Please enter a URL.' };

  const entry = { url: trimmed, title: extractTitle(trimmed), timestamp: Date.now(), quality };
  config.history = [entry, ...config.history.filter(h => h.url !== trimmed)].slice(0, 50);
  saveConfig();
  mainWindow.webContents.send('history-updated', config.history);

  try {
    const direct = isDirectFileUrl(trimmed);

    // Direct file (.mkv, .mp4, etc.) — skip yt-dlp entirely, MPC-HC streams over HTTP natively
    if (direct) {
      const args = [trimmed, ...(customArgs ? customArgs.split(' ').filter(Boolean) : [])];
      const proc = spawn(config.mpcPath, args, { detached: true, stdio: 'ignore' });
      proc.unref();
      const ext = trimmed.match(DIRECT_FILE_RE)?.[1]?.toUpperCase() || 'FILE';
      return { success: true, message: `Direct ${ext} → launched in MPC-HC`, mode: 'direct' };
    }

    // yt-dlp disabled or missing — pass URL directly
    if (!useYtdlp || !config.ytdlpPath || !fs.existsSync(config.ytdlpPath)) {
      const args = [trimmed, ...(customArgs ? customArgs.split(' ').filter(Boolean) : [])];
      const proc = spawn(config.mpcPath, args, { detached: true, stdio: 'ignore' });
      proc.unref();
      return { success: true, message: 'Launched in MPC-HC', mode: 'direct' };
    }

    return await launchViaYtdlp(trimmed, quality, customArgs);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function launchViaYtdlp(url, quality, customArgs) {
  return new Promise(resolve => {
    const fmtMap = {
      best:   'bestvideo+bestaudio/best',
      '1080': 'bestvideo[height<=1080]+bestaudio/best',
      '720':  'bestvideo[height<=720]+bestaudio/best',
      '480':  'bestvideo[height<=480]+bestaudio/best'
    };
    let out = '', err = '';
    const proc = spawn(config.ytdlpPath, ['-g', '-f', fmtMap[quality] || 'best', '--no-playlist', url]);
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    const timer = setTimeout(() => {
      proc.kill();
      // On timeout — try direct fallback
      const fb = spawn(config.mpcPath, [url], { detached: true, stdio: 'ignore' });
      fb.unref();
      resolve({ success: true, message: 'yt-dlp timed out — launched directly', mode: 'fallback' });
    }, 30000);
    proc.on('close', code => {
      clearTimeout(timer);
      const urls = out.trim().split('\n').filter(Boolean);
      if (code !== 0 || !urls.length) {
        const fb = spawn(config.mpcPath, [url], { detached: true, stdio: 'ignore' });
        fb.unref();
        return resolve({ success: true, message: 'Launched directly (yt-dlp fallback)', mode: 'fallback' });
      }
      const args = [...urls, ...(customArgs ? customArgs.split(' ').filter(Boolean) : [])];
      const mpc = spawn(config.mpcPath, args, { detached: true, stdio: 'ignore' });
      mpc.unref();
      resolve({ success: true, message: `Resolved via yt-dlp — ${urls.length} stream${urls.length > 1 ? 's' : ''} launched`, mode: 'ytdlp' });
    });
    proc.on('error', e => {
      clearTimeout(timer);
      const fb = spawn(config.mpcPath, [url], { detached: true, stdio: 'ignore' });
      fb.unref();
      resolve({ success: true, message: `Launched directly (yt-dlp error: ${e.message})`, mode: 'fallback' });
    });
  });
}

function extractTitle(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace('www.', '');
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    return last ? `${host} — ${decodeURIComponent(last).replace(/[-_.]/g,' ').slice(0,50)}` : host;
  } catch { return url.slice(0, 60); }
}

ipcMain.handle('get-history', () => config.history);
ipcMain.handle('clear-history', () => { config.history = []; saveConfig(); return true; });
ipcMain.handle('remove-history-item', (_, url) => {
  config.history = config.history.filter(h => h.url !== url); saveConfig(); return config.history;
});
ipcMain.handle('get-queue', () => config.queue);
ipcMain.handle('add-to-queue', (_, item) => {
  config.queue.push({ ...item, id: Date.now() }); saveConfig(); return config.queue;
});
ipcMain.handle('remove-from-queue', (_, id) => {
  config.queue = config.queue.filter(i => i.id !== id); saveConfig(); return config.queue;
});
ipcMain.handle('get-ytdlp-version', () => {
  if (!config.ytdlpPath || !fs.existsSync(config.ytdlpPath)) return null;
  return new Promise(resolve => {
    execFile(config.ytdlpPath, ['--version'], (err, stdout) => resolve(err ? null : stdout.trim()));
  });
});