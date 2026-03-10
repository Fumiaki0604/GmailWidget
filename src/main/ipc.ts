import { ipcMain, BrowserWindow, shell, app } from 'electron';
import { getSettings, saveSettings } from './store';

// 後のフェーズで実装される関数のプレースホルダ
let startAuthFlow: ((account: string) => Promise<string>) | null = null;
let logoutFn: (() => void) | null = null;
let fetchEmailsFn: (() => Promise<object[]>) | null = null;

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // 認証
  ipcMain.handle('auth:start', async (_event, account: string) => {
    if (!startAuthFlow) {
      return { success: false, error: 'Auth not initialized' };
    }
    try {
      const user = await startAuthFlow(account);
      mainWindow.webContents.send('auth:changed', user);
      return { success: true, user };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('auth:logout', () => {
    if (logoutFn) logoutFn();
    mainWindow.webContents.send('auth:changed', null);
    return { success: true };
  });

  // メール取得
  ipcMain.handle('mail:fetch', async () => {
    if (!fetchEmailsFn) {
      return { success: false, emails: [] };
    }
    try {
      const emails = await fetchEmailsFn();
      return { success: true, emails };
    } catch (err) {
      return { success: false, error: String(err), emails: [] };
    }
  });

  // 設定
  ipcMain.handle('settings:get', () => {
    return { success: true, settings: getSettings() };
  });

  ipcMain.handle('settings:save', (_event, settings: object) => {
    saveSettings(settings as Parameters<typeof saveSettings>[0]);
    return { success: true };
  });

  ipcMain.handle('settings:reset', () => {
    saveSettings({
      whitelist: [],
      keywords: ['至急', '請求', '締切'],
      intervalMin: 5,
      minScore: 4,
      gmailUser: null,
    });
    return { success: true };
  });

  // 外部URL（Gmail）
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    shell.openExternal(url);
  });

  // 透明エリアのクリックスルー制御
  ipcMain.on('window:setIgnoreMouseEvents', (event, ignore: boolean, options?: { forward: boolean }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setIgnoreMouseEvents(ignore, options);
  });

  // ログイン時自動起動
  ipcMain.handle('app:loginItem:get', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('app:loginItem:set', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled });
    return enabled;
  });
}

// Phase 2以降で各モジュールから関数を注入する
export function setAuthHandlers(
  authFn: (account: string) => Promise<string>,
  logoutFunc: () => void
) {
  startAuthFlow = authFn;
  logoutFn = logoutFunc;
}

export function setFetchEmailsHandler(fn: () => Promise<object[]>) {
  fetchEmailsFn = fn;
}
