# デザイン決定

## 選択パターン
案A: リキッドグラス（パターン15）

## コンセプト
ダークテーマにガラスモーフィズムを組み合わせた洗練されたウィジェット感。
デスクトップ常駐アプリとして「作業の邪魔をしない」上品さを重視。
アクセントカラーにアンバーを使い、重要メールの「価値」を表現。

## カラースキーム
| 用途 | カラー |
|------|--------|
| ページ背景 | linear-gradient(135deg, #0f0f1a, #1a1a3e, #0f1a2a) |
| ウィジェット背景 | rgba(255,255,255,0.06) |
| ボーダー | rgba(255,255,255,0.12) |
| メインテキスト | #e8e8f0 |
| サブテキスト | #888888 |
| アクセント（アンバー） | #f0a500 |
| アクセントグラデーション | linear-gradient(135deg, #f0a500, #e09000) |
| カード背景（選択時） | rgba(240,165,0,0.1) |
| カード背景（ホバー） | rgba(240,165,0,0.05) |

## タイポグラフィ
- 全般: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif（システムフォント）
- タイトル: 17px / font-weight 600
- アカウント名: 14px / font-weight 500
- サブ情報: 12px / color #888

## キーアニメーション
- カードホバー: border-color変化 + background淡色 (transition 0.2s)
- ログインボタン: translateY(-1px) + box-shadow拡大 (hover時)
- backdrop-filter: blur(20px) でガラス感を演出

## アイコンライブラリ
- ライブラリ: なし（絵文字 📧 を使用）
- ラジオボタン: CSSで描画（円形 + 内点）

## 実装ガイドライン
- ウィジェット幅: 380px固定、最大高さ600px
- 全画面で backdrop-filter: blur(20px) のガラスカードをベースに使用
- メールカード: 同じガラス感のカードスタイルで統一
- スコア表示: ⭐絵文字で視覚的に表現
- ボタン: アンバーグラデーション + box-shadow glow
- トースト通知: 右下固定、アンバーまたはグリーンアクセント
- セクション見出し: color #aaa / font-size 11px / letter-spacing 0.5px / uppercase

## 参照プレビュー
prototype/preview_A_liquid_glass.html
