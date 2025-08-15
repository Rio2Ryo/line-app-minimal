# 🎙️ 音声文字起こし機能

## 概要
LINE Botに音声文字起こし機能を追加する、**完全に独立したモジュール**です。
既存のコードに影響を与えずに、音声メッセージの文字起こし機能を提供します。

## 特徴
- 🔊 **OpenAI Whisper API**による高精度な音声認識
- 🧹 **フィラーワード自動除去**（「あー」「えーと」など）
- 📝 **自動要約**（200文字以上の場合）
- 🔒 **完全独立設計**（既存コードへの影響なし）

## ディレクトリ構造
```
voice-transcription/
├── lib/
│   ├── config.js              # 設定ファイル
│   ├── transcriptionService.js # 音声処理ロジック
│   └── messageFormatter.js    # メッセージフォーマット
├── api/
│   └── (APIエンドポイント)
├── docs/
│   └── (ドキュメント)
└── README.md (このファイル)
```

## セットアップ

### 1. 環境変数の設定

`.env.local`に以下を追加：

```env
# 音声文字起こし専用設定
VOICE_OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx
VOICE_ENABLED_USER_IDS=Uxxxxx,Uyyyyy  # カンマ区切りで複数指定可

# 既存のLINE設定を使用する場合は不要
# VOICE_LINE_CHANNEL_ACCESS_TOKEN=xxxxx
# VOICE_LINE_CHANNEL_SECRET=xxxxx
```

### 2. 必要なパッケージのインストール

```bash
npm install axios form-data
```

### 3. エンドポイントの設定

#### オプション1: 別のWebhookとして使用
新しいLINE Botを作成し、Webhook URLを以下に設定：
```
https://your-domain.vercel.app/api/voice-webhook
```

#### オプション2: 既存のBotに統合
既存の`webhook.js`から音声メッセージを転送：

```javascript
// pages/api/webhook.js に追加
if (event.message.type === 'audio') {
  // 特定ユーザーのみ音声処理
  if (VOICE_USER_IDS.includes(event.source.userId)) {
    // voice-webhookに転送
    return await fetch('/api/voice-webhook', {
      method: 'POST',
      body: JSON.stringify({ events: [event] }),
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

## 使い方

### ユーザー側の操作
1. LINEで音声メッセージを録音
2. Botに送信
3. 文字起こし結果が返信される

### 返信フォーマット
```
📝 文字起こし結果

【原文】
今日の会議は3時からです。資料を準備してください。

📌 【要約】（200文字以上の場合）
・会議は3時開始
・資料準備が必要
```

## API仕様

### GET /api/voice-webhook
ヘルスチェック用エンドポイント

**レスポンス:**
```json
{
  "message": "音声文字起こしWebhook",
  "status": "OK",
  "version": "1.0",
  "features": ["transcription", "summary", "filler_removal"]
}
```

### POST /api/voice-webhook
LINE Webhookエンドポイント

**ヘッダー:**
- `x-line-signature`: LINE署名（オプション）

**ボディ:**
LINE Webhook標準形式

## テスト方法

### 1. ローカルテスト
```bash
npm run dev
# 別ターミナルで
curl http://localhost:3000/api/voice-webhook
```

### 2. 音声処理テスト
```bash
# テスト用音声ファイルを用意
curl -X POST http://localhost:3000/api/voice-webhook \
  -H "Content-Type: application/json" \
  -d @test-webhook-payload.json
```

## トラブルシューティング

### よくある問題と解決方法

#### 1. 「OpenAI APIキーが設定されていません」
**解決:** `.env.local`に`VOICE_OPENAI_API_KEY`を設定

#### 2. 「この機能は現在利用できません」
**解決:** `VOICE_ENABLED_USER_IDS`にあなたのUSER IDを追加

#### 3. 音声が認識されない
**確認事項:**
- 音声ファイルのサイズ（最大25MB）
- 音声形式（m4a, mp3, wav, mp4）
- ネットワーク接続

## 料金

### OpenAI API料金（2025年1月時点）
- **Whisper**: $0.006 / 分
- **GPT-3.5 Turbo**: $0.0005 / 1K tokens
- **目安**: 1音声あたり約1〜3円

## セキュリティ

- APIキーは環境変数で管理
- USER IDによるアクセス制限
- 音声ファイルは処理後削除（保存しない）
- HTTPSでの通信

## 既存コードとの関係

このモジュールは**完全に独立**しています：
- 既存の`webhook.js`に影響なし
- 既存の`lib/`ディレクトリに影響なし
- 既存のGoogle Drive連携に影響なし
- 新しい環境変数名を使用（衝突回避）

## 今後の拡張案

- [ ] 多言語対応
- [ ] 話者識別
- [ ] 感情分析
- [ ] キーワード抽出
- [ ] 議事録自動生成
- [ ] 音声ファイルのアーカイブ

## サポート

問題が発生した場合は、以下を確認してください：
1. 環境変数が正しく設定されているか
2. Vercelのログでエラーメッセージを確認
3. OpenAI APIの利用制限を確認