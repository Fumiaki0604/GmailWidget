import { google } from 'googleapis';
import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { shell } from 'electron';
import { getAuth, saveAuth, clearAuth } from './store';

// credentials.json（デスクトップアプリ型）の型
interface CredentialsFile {
  installed: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

function loadCredentials(): { clientId: string; clientSecret: string } {
  // 候補パスを優先順に試みる
  // 1. 開発時: src/credentials.json
  // 2. パッケージ済み: extraResources に同梱された credentials.json
  const candidates = [
    path.join(__dirname, '../../src/credentials.json'),
    path.join(process.resourcesPath ?? '', 'credentials.json'),
  ];

  for (const credPath of candidates) {
    if (fs.existsSync(credPath)) {
      const raw = JSON.parse(fs.readFileSync(credPath, 'utf-8')) as CredentialsFile;
      return {
        clientId: raw.installed.client_id,
        clientSecret: raw.installed.client_secret,
      };
    }
  }

  // フォールバック: .env の値を使う
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }
  throw new Error('Google OAuth credentials が見つかりません。src/credentials.json か .env を確認してください。');
}

function createOAuth2Client() {
  const { clientId, clientSecret } = loadCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, 'http://localhost');
}

// ローカル HTTP サーバーでコールバックを受け取り、認証コードを返す
function waitForAuthCode(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url ?? '', true);
      const code = parsed.query['code'];
      const error = parsed.query['error'];

      res.setHeader('Content-Type', 'text/html; charset=utf-8');

      if (error) {
        res.end('<html><body><h2>認証がキャンセルされました。このタブを閉じてください。</h2></body></html>');
        server.close();
        reject(new Error(`OAuth エラー: ${error}`));
        return;
      }

      if (code && typeof code === 'string') {
        res.end('<html><body><h2>認証完了！このタブを閉じてアプリに戻ってください。</h2></body></html>');
        server.close();
        resolve(code);
      } else {
        res.end('<html><body><h2>不明なリクエストです。</h2></body></html>');
      }
    });

    server.on('error', reject);
    server.listen(port, 'localhost', () => {
      // サーバー起動完了
    });

    // 5分でタイムアウト
    setTimeout(() => {
      server.close();
      reject(new Error('認証タイムアウト（5分）'));
    }, 5 * 60 * 1000);
  });
}

// ランダムな空きポートを取得
function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, 'localhost', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error('ポート取得失敗'));
      }
    });
  });
}

/**
 * 保存済みトークンを検証して返す（OAuthフローを開かない）
 * トークンが無効な場合は null を返す
 */
export async function tryRestoreAuth(): Promise<string | null> {
  const storedAuth = getAuth();
  if (!storedAuth.accessToken || !storedAuth.refreshToken) return null;

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: storedAuth.accessToken,
    refresh_token: storedAuth.refreshToken,
    expiry_date: storedAuth.expiryDate ?? undefined,
  });

  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const me = await oauth2.userinfo.get();
    const email = me.data.email ?? 'unknown';
    const refreshed = oauth2Client.credentials;
    saveAuth({
      accessToken: refreshed.access_token ?? storedAuth.accessToken,
      refreshToken: refreshed.refresh_token ?? storedAuth.refreshToken,
      expiryDate: refreshed.expiry_date ?? storedAuth.expiryDate,
    });
    return email;
  } catch {
    return null;
  }
}

/**
 * OAuth2 認証フローを実行し、認証済みユーザーのメールアドレスを返す
 */
export async function startAuthFlow(): Promise<string> {
  const oauth2Client = createOAuth2Client();

  // 保存済みトークンがあれば再利用
  const storedAuth = getAuth();
  if (storedAuth.accessToken && storedAuth.refreshToken) {
    oauth2Client.setCredentials({
      access_token: storedAuth.accessToken,
      refresh_token: storedAuth.refreshToken,
      expiry_date: storedAuth.expiryDate ?? undefined,
    });

    try {
      // メールアドレスを取得して返す
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const me = await oauth2.userinfo.get();
      const email = me.data.email ?? 'unknown';
      // トークン更新があれば保存
      const refreshed = oauth2Client.credentials;
      saveAuth({
        accessToken: refreshed.access_token ?? storedAuth.accessToken,
        refreshToken: refreshed.refresh_token ?? storedAuth.refreshToken,
        expiryDate: refreshed.expiry_date ?? storedAuth.expiryDate,
      });
      return email;
    } catch {
      // トークンが無効なら再認証へ
      clearAuth();
    }
  }

  // 新規認証: ランダムポートでローカルサーバーを立ち上げ
  const port = await getRandomPort();
  const redirectUri = `http://localhost:${port}`;

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    redirect_uri: redirectUri,
    prompt: 'consent',  // 毎回 refresh_token を受け取るため
  });

  // システムブラウザで開く
  await shell.openExternal(authUrl);

  // コールバックを待つ
  const code = await waitForAuthCode(port);

  // コード → トークン交換
  const { tokens } = await oauth2Client.getToken({ code, redirect_uri: redirectUri });
  oauth2Client.setCredentials(tokens);

  saveAuth({
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate: tokens.expiry_date ?? null,
  });

  // ユーザー情報取得
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const me = await oauth2.userinfo.get();
  return me.data.email ?? 'unknown';
}

/**
 * ログアウト（トークン破棄）
 */
export function logout(): void {
  clearAuth();
}

/**
 * 保存済みトークンから oauth2Client を復元して返す（gmail.ts から使用）
 * トークンがなければ null を返す
 */
export function getAuthenticatedClient() {
  const stored = getAuth();
  if (!stored.accessToken || !stored.refreshToken) return null;

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date: stored.expiryDate ?? undefined,
  });

  // トークン自動更新時に保存
  oauth2Client.on('tokens', (newTokens) => {
    saveAuth({
      accessToken: newTokens.access_token ?? stored.accessToken,
      refreshToken: newTokens.refresh_token ?? stored.refreshToken,
      expiryDate: newTokens.expiry_date ?? stored.expiryDate,
    });
  });

  return oauth2Client;
}
