const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  getConfig:    () => ipcRenderer.invoke('get-config'),
  savePaths:    (p) => ipcRenderer.invoke('save-paths', p),
  saveTheme:    (t) => ipcRenderer.invoke('save-theme', t),
  browseExe:    (type) => ipcRenderer.invoke('browse-exe', type),
  checkPath:    (p) => ipcRenderer.invoke('check-path', p),

  launchStream:    (opts) => ipcRenderer.invoke('launch-stream', opts),
  probeUrlType:    (url)  => ipcRenderer.invoke('probe-url-type', url),
  getYtdlpVersion: ()    => ipcRenderer.invoke('get-ytdlp-version'),

  getHistory:        () => ipcRenderer.invoke('get-history'),
  clearHistory:      () => ipcRenderer.invoke('clear-history'),
  removeHistoryItem: (url) => ipcRenderer.invoke('remove-history-item', url),

  getQueue:        () => ipcRenderer.invoke('get-queue'),
  addToQueue:      (item) => ipcRenderer.invoke('add-to-queue', item),
  removeFromQueue: (id) => ipcRenderer.invoke('remove-from-queue', id),

  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  onConfigLoaded:   (cb) => ipcRenderer.on('config-loaded', (_, d) => cb(d)),
  onHistoryUpdated: (cb) => ipcRenderer.on('history-updated', (_, d) => cb(d)),
});