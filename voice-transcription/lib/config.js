/**
 * 音声文字起こし機能の設定
 * 既存コードから完全に独立
 */

module.exports = {
  // OpenAI設定
  openai: {
    apiKey: process.env.VOICE_OPENAI_API_KEY,
    whisperModel: 'whisper-1',
    gptModel: 'gpt-3.5-turbo'
  },
  
  // LINE設定（音声文字起こし専用）
  line: {
    channelAccessToken: process.env.VOICE_LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.VOICE_LINE_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET
  },
  
  // 機能設定
  features: {
    summaryThreshold: 200,  // 要約する文字数の閾値
    maxAudioSize: 25 * 1024 * 1024,  // 25MB
    supportedFormats: ['m4a', 'mp3', 'wav', 'mp4']
  },
  
  // ユーザー設定
  users: {
    // 全ユーザーが利用可能（制限なし）
    enabledUserIds: []
  }
};