import Anthropic from '@anthropic-ai/sdk';
import { EmailSummary } from './gmail';
import { getSenderFeedback } from './store';

interface ScoringResult {
  id: string;
  score: number;
  reason: string;
}

const SYSTEM_PROMPT = `あなたはビジネスメールの重要度を評価するアシスタントです。
受信したメールを1〜5のスコアで評価し、その理由を簡潔に説明してください。

スコア基準:
5: 今すぐ対応が必要（障害・緊急依頼・重要な承認待ち）
4: 今日中に確認が必要（重要な業務連絡・期限近い案件）
3: 近日中に確認（通常の業務連絡・会議案内）
2: 急がない（情報共有・レポート類）
1: 不要（マーケティング・ニュースレター・自動通知）

回答は必ずJSON配列のみで返してください（説明文不要）:
[{"id": "メールID", "score": 数字, "reason": "理由（20字以内）"}]`;

/**
 * メール一覧を Claude Haiku でスコアリングして返す
 * API キー未設定の場合はスコアリングをスキップ（score=0 のまま）
 */
export async function scoreEmails(emails: EmailSummary[]): Promise<EmailSummary[]> {
  if (emails.length === 0) return emails;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[scorer] ANTHROPIC_API_KEY が未設定。スコアリングをスキップ');
    return emails;
  }

  const client = new Anthropic({ apiKey });

  // 10 件ずつバッチ処理（API コスト削減）
  const BATCH_SIZE = 10;
  const scored = new Map<string, { score: number; reason: string }>();

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const results = await scoreBatch(client, batch);
    results.forEach((r) => scored.set(r.id, { score: r.score, reason: r.reason }));
  }

  const senderFeedback = getSenderFeedback();

  return emails.map((email) => {
    const result = scored.get(email.id);
    if (!result) return email;

    // baseScore（ホワイトリスト/キーワード加点）があれば +1 してクリッピング
    const bonus = email.score > 0 ? 1 : 0;
    let finalScore = Math.min(5, result.score + bonus);

    // 送信者フィードバック補正（送信者優先度：高）
    const fb = senderFeedback[email.from] ?? 0;
    if (fb >= 3) {
      finalScore = Math.max(finalScore, 5);   // 信頼済み送信者 → 常に最重要
    } else if (fb >= 1) {
      finalScore = Math.min(5, finalScore + 1);
    } else if (fb <= -4) {
      finalScore = Math.min(finalScore, 1);   // 不要送信者 → 最低スコア
    } else if (fb <= -2) {
      finalScore = Math.max(1, finalScore - 1);
    }

    return {
      ...email,
      score: finalScore,
      scoreReason: result.reason,
    };
  });
}

async function scoreBatch(
  client: Anthropic,
  emails: EmailSummary[]
): Promise<ScoringResult[]> {
  const emailList = emails
    .map(
      (e) =>
        `ID: ${e.id}\n差出人: ${e.fromName} <${e.from}>\n件名: ${e.subject}\n概要: ${e.snippet}`
    )
    .join('\n\n---\n\n');

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `以下のメールを評価してください:\n\n${emailList}`,
        },
      ],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    // レスポンスから JSON 配列を抽出
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[scorer] JSONが見つかりません:', text.slice(0, 200));
      return emails.map((e) => ({ id: e.id, score: 2, reason: '解析失敗' }));
    }

    const results = JSON.parse(jsonMatch[0]) as ScoringResult[];
    return results;
  } catch (err) {
    console.error('[scorer] スコアリングエラー:', err);
    return emails.map((e) => ({ id: e.id, score: 2, reason: 'エラー' }));
  }
}
