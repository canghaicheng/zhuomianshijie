/**
 * The preload script runs before `index.html` is loaded
 * in the renderer. It has access to web APIs as well as
 * Electron's renderer process modules and some polyfilled
 * Node.js functions.
 *
 * https://www.electronjs.org/docs/latest/tutorial/sandbox
 */
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type])
  }
})

const { contextBridge, ipcRenderer } = require('electron')

console.log('Preload script starting...');

// 只保留一个 API 暴露，避免重复
contextBridge.exposeInMainWorld('electronAPI', {
  openSoftware: (name) => {
    console.log('preload - 准备打开软件:', name);
    return ipcRenderer.send('open-software', name);
  },
  onOpenSoftwareResult: (callback) => {
    ipcRenderer.on('open-software-result', (_, result) => callback(result));
  },
  onDebugLog: (callback) => {
    ipcRenderer.on('debug-log', (_, message) => callback(message));
  },
  closeWindow: () => ipcRenderer.send('close-settings-window'),
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store-delete', key),
  getApiSettings: () => ipcRenderer.invoke('get-api-settings'),

  // 发送设置变更
  sendApiSettingsChange: (settings) => ipcRenderer.send('send-api-settings-change', settings),
  onApiSettingsChange: (callback) => {
    ipcRenderer.on('api-settings-change', (_, settings) => callback(settings));
  },

  getTTSSettings: () => ipcRenderer.invoke('get-tts-settings'),
  sendTTSSettingsChange: (settings) => ipcRenderer.send('send-tts-settings-change', settings),
  onTTSSettingsChange: (callback) => {
    ipcRenderer.on('tts-settings-change', (_, settings) => callback(settings));
  },

  getSTTSettings: () => ipcRenderer.invoke('get-stt-settings'),
  sendSTTSettingsChange: (settings) => ipcRenderer.send('send-stt-settings-change', settings),
  onSTTSettingsChange: (callback) => {
    ipcRenderer.on('stt-settings-change', (_, settings) => callback(settings));
  },

  onToggleControlPanel: (callback) => {
    ipcRenderer.on('toggle-control-panel', (event, value) => callback(value))
  },

  onToggleChatPanel: (callback) => {
    ipcRenderer.on('toggle-chat-panel', (event, value) => callback(value))
  },

  readdir: (path) => ipcRenderer.invoke('readdir', path),
  readdirfiles: (path) => ipcRenderer.invoke('readdirfiles', path),


});

// DOM 加载完成后的检查
window.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded - checking APIs:', {
    electronAPI: !!window.electronAPI
  });
});
