import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron';
import path from 'path';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow): Tray {
  // アイコン（後で差し替え可能 - 今はデフォルト）
  const iconPath = path.join(__dirname, '../../src/renderer/icon.png');
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Gmail重要メール');

  updateTrayMenu(mainWindow, tray, 0);

  // クリックでウィンドウ表示/非表示
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}

export function updateTrayMenu(mainWindow: BrowserWindow, t: Tray, unreadCount: number) {
  const label = unreadCount > 0
    ? `Gmail重要メール (${unreadCount}件)`
    : 'Gmail重要メール';

  t.setToolTip(label);
  if (unreadCount > 0) {
    t.setTitle(`${unreadCount}`);
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: unreadCount > 0 ? `📧 重要メール ${unreadCount}件` : '📧 重要メール',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: mainWindow.isVisible() ? 'ウィンドウを隠す' : 'ウィンドウを表示',
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: '終了',
      click: () => {
        app.quit();
      },
    },
  ]);

  t.setContextMenu(contextMenu);
}

export function getTray(): Tray | null {
  return tray;
}
