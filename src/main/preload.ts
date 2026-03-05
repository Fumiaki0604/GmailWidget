import { contextBridge, ipcRenderer } from 'electron';

// レンダラーに公開するAPI（contextIsolation対応）
contextBridge.exposeInMainWorld('electronAPI', {
  // 認証
  startLogin: (account: string) => ipcRenderer.invoke('auth:start', account),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // メール
  fetchEmails: () => ipcRenderer.invoke('mail:fetch'),

  // 設定
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: object) => ipcRenderer.invoke('settings:save', settings),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),

  // イベント受信（Main → Renderer）
  onMailUpdate: (callback: (emails: object[]) => void) =>
    ipcRenderer.on('mail:updated', (_event, emails) => callback(emails)),
  onAuthStateChange: (callback: (user: string | null) => void) =>
    ipcRenderer.on('auth:changed', (_event, user) => callback(user)),
});
