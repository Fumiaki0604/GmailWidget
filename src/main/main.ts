import { app, BrowserWindow } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
import { createTray } from './tray';
import { registerIpcHandlers, setAuthHandlers, setFetchEmailsHandler } from './ipc';
import { startAuthFlow, logout } from './auth';
import { fetchFilteredEmails } from './gmail';

dotenv.config();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 640,
    resizable: false,
    frame: false,           // フレームレス（ウィジェット風）
    transparent: false,
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
      (_account: string) => startAuthFlow(),
      logout
    );
    setFetchEmailsHandler(async () => {
      const emails = await fetchFilteredEmails();
      return emails as object[];
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
