# 🚀 音声文字起こし機能 セットアップガイド

## クイックスタート（5分で完了）

### ステップ1: OpenAI APIキーを取得
1. https://platform.openai.com/api-keys にアクセス
2. 「Create new secret key」をクリック
3. キーをコピー（`sk-`で始まる文字列）

### ステップ2: 環境変数を設定

#### Vercelで設定する場合
1. Vercelダッシュボードを開く
2. Settings → Environment Variables
3. 以下を追加：

| 変数名 | 値 | 環境 |
|--------|-----|------|
| VOICE_OPENAI_API_KEY | sk-xxxxx... | Production ✅ |
| VOICE_ENABLED_USER_IDS | （後で設定） | Production ✅ |

#### ローカルで設定する場合
`.env.local`ファイルに追加：
```env
VOICE_OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx
VOICE_ENABLED_USER_IDS=
```

### ステップ3: デプロイ
```bash
git add .
git commit -m "音声文字起こし機能を追加"
git push origin main

# Vercelに自動デプロイされます
```

### ステップ4: USER IDを取得して設定

#### 方法A: デバッグメッセージで確認
1. LINEで「!userid」とメッセージ送信
2. USER IDが返信される（実装済みの場合）

#### 方法B: テストエンドポイントで確認
1. 以下のファイルを作成：

`pages/api/get-my-userid.js`:
```javascript
export default async function handler(req, res) {
  // 最後のWebhookで受信したUSER ID
  res.json({ 
    message: "LINEでメッセージを送信後、このURLに再アクセス",
    userId: global.lastUserId || "未取得"
  });
}
```

2. LINEでメッセージ送信
3. `https://your-app.vercel.app/api/get-my-userid` にアクセス

#### 方法C: Vercelログで確認
1. Vercelダッシュボード → Functions → api/webhook → Logs
2. `userId`を検索

### ステップ5: USER IDを環境変数に設定
取得したUSER IDを`VOICE_ENABLED_USER_IDS`に設定：
```
VOICE_ENABLED_USER_IDS=Uf9c2e3d4a5b6c7d8e9f0a1b2c3d4e5f6
```

## 動作確認

### 1. エンドポイントの確認
```bash
curl https://your-app.vercel.app/api/voice-webhook
```

期待される応答：
```json
{
  "message": "音声文字起こしWebhook",
  "status": "OK"
}
```

### 2. 音声メッセージのテスト
1. LINEで音声メッセージを録音
2. Botに送信
3. 文字起こし結果が返信される

## 2つの使用方法

### 方法1: 既存のBotに統合（推奨）

既存の`pages/api/webhook.js`を少し修正：

```javascript
// 音声メッセージの処理を追加
if (event.message.type === 'audio') {
  // 音声処理対象のユーザーかチェック
  const voiceUserIds = process.env.VOICE_ENABLED_USER_IDS?.split(',') || [];
  if (voiceUserIds.includes(event.source.userId)) {
    // voice-webhookに処理を委譲
    const voiceResult = await processVoiceMessage(event);
    if (voiceResult) {
      await replyToLine(event.replyToken, voiceResult);
    }
    continue;
  }
}
```

### 方法2: 別のBotとして運用

1. 新しいLINE Messaging APIチャンネルを作成
2. Webhook URLを`/api/voice-webhook`に設定
3. 新しいチャンネルのトークンを環境変数に追加：
```env
VOICE_LINE_CHANNEL_ACCESS_TOKEN=新しいトークン
VOICE_LINE_CHANNEL_SECRET=新しいシークレット
```

## トラブルシューティング

### エラー: OpenAI APIキーが設定されていません
```bash
# 環境変数を確認
vercel env ls

# 必要に応じて追加
vercel env add VOICE_OPENAI_API_KEY
```

### エラー: この機能は現在利用できません
USER IDが設定されていません。上記のステップ4を参照。

### エラー: 音声の処理に失敗しました
- OpenAI APIの残高を確認
- 音声ファイルのサイズを確認（25MB以下）

## 料金の目安

| 使用量 | 月額料金（概算） |
|--------|-----------------|
| 100メッセージ/月 | 約100円 |
| 500メッセージ/月 | 約500円 |
| 1000メッセージ/月 | 約1,000円 |

## 次のステップ

✅ 基本設定が完了したら：
1. 複数ユーザーを追加（カンマ区切り）
2. 要約の閾値を調整（config.js）
3. フィラーワードのパターンを追加

## ヘルプ

設定で困ったことがあれば、以下の情報と共にお問い合わせください：
- エラーメッセージ
- Vercelのログ
- 設定した環境変数（APIキーは除く）