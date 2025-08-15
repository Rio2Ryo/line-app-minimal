# 🎙️ 音声文字起こし機能 - 簡単セットアップ

## ✅ セットアップ完了状況

### 1. ✅ OpenAI APIキー設定済み
環境変数 `VOICE_OPENAI_API_KEY` は設定済みです。

### 2. ✅ ユーザー制限なし
全てのユーザーが音声文字起こし機能を利用できます。

### 3. ✅ コードはデプロイ済み
GitHubにプッシュ済みで、Vercelが自動デプロイします。

## 🚀 使い方

### エンドポイント
```
https://line-app-minimal.vercel.app/api/voice-webhook
```

### 動作確認
1. **ヘルスチェック**
   ```bash
   curl https://line-app-minimal.vercel.app/api/voice-webhook
   ```

2. **LINEで音声送信**
   - 音声メッセージを録音
   - Botに送信
   - 文字起こし結果が返信される

## 🔄 既存のBotと統合する場合

既存の `/api/webhook.js` に以下を追加：

```javascript
// 音声メッセージの処理
if (event.message.type === 'audio') {
  // voice-webhookにリダイレクト
  const voiceResponse = await fetch('https://line-app-minimal.vercel.app/api/voice-webhook', {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify({ events: [event] })
  });
  continue;
}
```

## 📝 機能

- **音声認識**: OpenAI Whisper API
- **フィラーワード除去**: 「あー」「えーと」など自動削除
- **自動要約**: 200文字以上の場合
- **全ユーザー対応**: 制限なし

## ⚠️ 注意事項

- 音声ファイルは最大25MBまで
- 日本語に最適化されています
- 料金: 約1〜3円/音声

## 🆘 トラブルシューティング

### 「OpenAI APIキーが設定されていません」
Vercelの環境変数を確認：
```bash
vercel env ls
```

### 音声が認識されない
- 音声形式を確認（m4a, mp3, wav, mp4）
- ファイルサイズを確認（25MB以下）