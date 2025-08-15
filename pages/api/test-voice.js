// 音声文字起こし機能のテストエンドポイント

export default async function handler(req, res) {
  const config = {
    VOICE_OPENAI_API_KEY: process.env.VOICE_OPENAI_API_KEY ? '設定済み' : '未設定',
    LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN ? '設定済み' : '未設定',
    LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET ? '設定済み' : '未設定',
  };
  
  // voice-transcription モジュールの存在確認
  let moduleCheck = {};
  try {
    const transcriptionService = require('../../voice-transcription/lib/transcriptionService');
    moduleCheck.transcriptionService = '読み込み成功';
  } catch (error) {
    moduleCheck.transcriptionService = `エラー: ${error.message}`;
  }
  
  try {
    const messageFormatter = require('../../voice-transcription/lib/messageFormatter');
    moduleCheck.messageFormatter = '読み込み成功';
  } catch (error) {
    moduleCheck.messageFormatter = `エラー: ${error.message}`;
  }
  
  res.status(200).json({
    message: '音声文字起こし機能テスト',
    環境変数: config,
    モジュール: moduleCheck,
    webhookURL: 'https://line-app-minimal.vercel.app/api/webhook',
    使い方: '音声メッセージをLINEで送信してください'
  });
}