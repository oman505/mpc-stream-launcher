const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');

let mainWindow;
const CONFIG_FILE = path.join(app.getPath('userData'), 'stream-player.json');
let config = { ytdlpPath:'', history:[], playlist:[], theme:'dark', volume:80 };

function loadConfig() {
  try { if (fs.existsSync(CONFIG_FILE)) config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE,'utf8')) }; } catch {}
}
function saveConfig() {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config,null,2)); } catch {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width:1100, height:700, minWidth:780, minHeight:520,
    frame:false, backgroundColor:'#0d0d0c',
    webPreferences:{
      preload: path.join(__dirname,'preload.js'),
      contextIsolation:true, nodeIntegration:false, webSecurity:false
    }
  });
  mainWindow.loadFile(path.join(__dirname,'renderer','index.html'));
}

app.whenReady().then(() => { loadConfig(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('win-minimize',   () => mainWindow.minimize());
ipcMain.on('win-maximize',   () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('win-close',      () => mainWindow.close());

ipcMain.handle('get-config',  () => config);
ipcMain.handle('save-config', (_, p) => { config={...config,...p}; saveConfig(); return config; });

ipcMain.handle('browse-video', async () => {
  const r = await dialog.showOpenDialog(mainWindow,{
    title:'Open Video',
    filters:[{name:'Video',extensions:['mp4','mkv','webm','mov','avi','m4v','ts','m2ts','flv','3gp','ogv','m3u8','m3u']},{name:'All',extensions:['*']}],
    properties:['openFile','multiSelections']
  });
  return r.canceled ? null : r.filePaths;
});

ipcMain.handle('browse-ytdlp', async () => {
  const r = await dialog.showOpenDialog(mainWindow,{title:'Select yt-dlp.exe',filters:[{name:'Exe',extensions:['exe']}],properties:['openFile']});
  if (!r.canceled && r.filePaths[0]) { config.ytdlpPath=r.filePaths[0]; saveConfig(); return r.filePaths[0]; }
  return null;
});

ipcMain.handle('check-path',    (_, p) => !!(p && fs.existsSync(p)));
ipcMain.handle('open-external', (_, u) => shell.openExternal(u));

ipcMain.handle('resolve-url', async (_, { url, quality }) => {
  const ytdlp = config.ytdlpPath || 'yt-dlp';
  const fmts = { best:'bestvideo+bestaudio/best', '1080':'bestvideo[height<=1080]+bestaudio/best', '720':'bestvideo[height<=720]+bestaudio/best', '480':'bestvideo[height<=480]+bestaudio/best', audio:'bestaudio/best' };
  const fmt = fmts[quality] || fmts.best;
  return new Promise(resolve => {
    let out='', err='';
    const proc = spawn(ytdlp, ['-g','-f',fmt,'--no-playlist','--',url]);
    proc.stdout.on('data', d => out+=d);
    proc.stderr.on('data', d => err+=d);
    const t = setTimeout(() => { proc.kill(); resolve({success:false,error:'yt-dlp timed out',fallback:url}); }, 30000);
    proc.on('close', code => {
      clearTimeout(t);
      const urls = out.trim().split('\n').filter(Boolean);
      if (code!==0||!urls.length) resolve({success:false,error:err.trim()||'No URLs returned',fallback:url});
      else resolve({success:true,videoUrl:urls[0],audioUrl:urls[1]||null,urls});
    });
    proc.on('error', e => { clearTimeout(t); resolve({success:false,error:e.message,fallback:url}); });
  });
});

ipcMain.handle('ytdlp-version', () => new Promise(resolve => {
  const p = config.ytdlpPath||'yt-dlp';
  execFile(p,['--version'],{timeout:5000},(e,o) => resolve(e?null:o.trim()));
}));

ipcMain.handle('add-history', (_, item) => {
  config.history=[item,...config.history.filter(h=>h.url!==item.url)].slice(0,100);
  saveConfig(); return config.history;
});
ipcMain.handle('get-history',    () => config.history);
ipcMain.handle('clear-history',  () => { config.history=[]; saveConfig(); return []; });
ipcMain.handle('remove-history', (_, url) => { config.history=config.history.filter(h=>h.url!==url); saveConfig(); return config.history; });
ipcMain.handle('save-playlist',  (_, list) => { config.playlist=list; saveConfig(); return list; });
ipcMain.handle('get-playlist',   () => config.playlist);