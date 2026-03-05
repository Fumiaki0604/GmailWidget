import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth';
import { getSettings, getScoredEmailIds, addScoredEmailId } from './store';

export interface EmailSummary {
  id: string;
  subject: string;
  from: string;        // メールアドレスのみ
  fromName: string;    // 表示名
  date: string;        // 生の Date ヘッダ
  receivedAt: string;  // 表示用フォーマット済み日時
  snippet: string;
  score: number;
  scoreReason: string; // AI スコアリング理由（Phase 3 で設定）
  isRead: boolean;
  labels: string[];
}

/** Gmail メッセージヘッダから指定名のヘッダ値を取得 */
function getHeader(
  headers: { name?: string | null; value?: string | null }[],
  name: string
): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

/** 差出人文字列からメールアドレス部分を抽出 */
function extractEmail(from: string): string {
  const m = from.match(/<(.+?)>/);
  return m ? m[1] : from;
}

/** 差出人文字列から表示名を抽出 */
function extractName(from: string): string {
  const m = from.match(/^"?([^"<]+)"?\s*</);
  if (m) return m[1].trim();
  // 表示名なし → メールアドレスのみ
  return extractEmail(from);
}

/** Date ヘッダを "HH:MM" または "M/D" 形式に変換 */
function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (isToday) {
      return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return dateStr;
  }
}

/**
 * 直近のメールを取得してルールフィルタを適用し、候補リストを返す
 * スコアはこの時点では 0（Phase 3 の AI スコアリングで上書き）
 */
export async function fetchFilteredEmails(): Promise<EmailSummary[]> {
  const auth = getAuthenticatedClient();
  if (!auth) throw new Error('未認証：先にログインしてください');

  const settings = getSettings();
  const gmail = google.gmail({ version: 'v1', auth });

  // 未読メールを最大 30 件取得（AI スコアリングで重要度を判断する）
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 30,
    labelIds: ['INBOX', 'UNREAD'],
    q: 'in:inbox is:unread',
  });

  const messages = listRes.data.messages ?? [];
  console.log(`[gmail] 未読メール取得: ${messages.length} 件`);
  if (messages.length === 0) return [];

  // 各メールの詳細を並行取得
  const details = await Promise.all(
    messages.map((m) =>
      gmail.users.messages.get({
        userId: 'me',
        id: m.id!,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      })
    )
  );

  const results: EmailSummary[] = [];

  for (const res of details) {
    const msg = res.data;
    if (!msg.id) continue;

    const headers = msg.payload?.headers ?? [];
    const subject = getHeader(headers, 'Subject');
    const from = getHeader(headers, 'From');
    const date = getHeader(headers, 'Date');
    const snippet = msg.snippet ?? '';
    const labelIds = msg.labelIds ?? [];
    const isRead = !labelIds.includes('UNREAD');

    // ホワイトリスト・キーワードはスコアへの加点要素（フィルタではない）
    const fromEmail = extractEmail(from).toLowerCase();
    const subjectLower = subject.toLowerCase();
    const snippetLower = snippet.toLowerCase();

    const whitelistBoost = settings.whitelist.some((w) =>
      fromEmail.includes(w.toLowerCase())
    );
    const keywordBoost = settings.keywords.some(
      (kw) =>
        subjectLower.includes(kw.toLowerCase()) ||
        snippetLower.includes(kw.toLowerCase())
    );

    // baseScore: ホワイトリスト+2、キーワード+1（Phase 3 の AI スコアに加算）
    const baseScore = (whitelistBoost ? 2 : 0) + (keywordBoost ? 1 : 0);

    results.push({
      id: msg.id,
      subject,
      from: fromEmail,
      fromName: extractName(from),
      date,
      receivedAt: formatDate(date),
      snippet,
      score: baseScore,
      scoreReason: '',    // Phase 3 で設定
      isRead,
      labels: labelIds,
    });
  }

  console.log(`[gmail] 未読メール返却: ${results.length} 件`);
  return results;
}

/**
 * まだスコアリングされていないメール ID のリストを返す
 * （Phase 3 の AI スコアリングで使用）
 */
export function getUnscoredEmailIds(emails: EmailSummary[]): string[] {
  const scored = new Set(getScoredEmailIds());
  return emails.filter((e) => !scored.has(e.id)).map((e) => e.id);
}

/**
 * スコアリング完了後に ID を記録する
 */
export function markAsScored(id: string): void {
  addScoredEmailId(id);
}
