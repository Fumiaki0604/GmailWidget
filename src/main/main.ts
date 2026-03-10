import { app, BrowserWindow } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
import { createTray } from './tray';
import { registerIpcHandlers, setAuthHandlers, setFetchEmailsHandler } from './ipc';
import { startAuthFlow, logout } from './auth';
import { fetchFilteredEmails } from './gmail';
import { scoreEmails } from './scorer';
import { getSettings } from './store';

dotenv.config();

let mainWindow: BrowserWindow | null = null;
let pollingTimer: NodeJS.Timeout | null = null;

/** 設定の intervalMin に従って自動ポーリングを開始 */
function startPolling() {
  stopPolling();
  const { intervalMin } = getSettings();
  const ms = intervalMin * 60 * 1000;
  pollingTimer = setInterval(async () => {
    try {
      const emails = await fetchFilteredEmails();
      const scored = await scoreEmails(emails);
      mainWindow?.webContents.send('mail:updated', scored);
    } catch {
      // ポーリングエラーは無視（次のタイマーで再試行）
    }
  }, ms);
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 640,
    resizable: false,
    frame: false,           // フレームレス（ウィジェット風）
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: false,
    skipTaskbar: true,      // タスクバーに表示しない（トレイのみ）
    webPreferences: {
      contextIsolation: true,   // セキュリティ: IPC経由のみ
      nodeIntegration: false,   // セキュリティ: レンダラーでNode.js禁止
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // プロトタイプHTMLを読み込む
  mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));

  // 開発時はDevToolsを開く
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // ×ボタンでトレイに引っ込む（終了しない）
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  if (mainWindow) {
    createTray(mainWindow);
    registerIpcHandlers(mainWindow);

    // Phase 2: auth / gmail ハンドラを注入
    setAuthHandlers(
      async (_account: string) => {
        const user = await startAuthFlow();
        startPolling();  // ログイン後にポーリング開始
        return user;
      },
      () => {
        logout();
        stopPolling();   // ログアウト時にポーリング停止
      }
    );
    setFetchEmailsHandler(async () => {
      const emails = await fetchFilteredEmails();
      const scored = await scoreEmails(emails);
      return scored as object[];
    });
  }
});

// すべてのウィンドウが閉じてもアプリを終了しない（トレイ常駐）
// ハンドラを登録するだけで app.quit() を呼ばないことで自動終了を抑制する
app.on('window-all-closed', () => {
  // no-op: トレイ常駐のため終了しない
});

// トレイから「終了」選択時のみ終了
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Electron {
    interface App {
      isQuiting: boolean;
    }
  }
}

app.isQuiting = false;
