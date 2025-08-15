/**
 * メッセージフォーマッター
 * LINE返信用のメッセージを生成
 */

/**
 * 音声文字起こし結果をLINEメッセージ形式に変換
 */
function formatTranscriptionMessage(result) {
  if (!result.success) {
    return {
      type: 'text',
      text: `⚠️ エラー: ${result.error || '音声の処理に失敗しました'}`
    };
  }
  
  let message = '📝 文字起こし結果\n\n';
  
  // 原文
  message += '【原文】\n';
  message += result.transcription;
  
  // 要約（ある場合）
  if (result.summary) {
    message += '\n\n📌 【要約】\n';
    message += result.summary;
  }
  
  // デバッグ情報（開発時のみ）
  if (process.env.NODE_ENV !== 'production') {
    message += '\n\n---\n';
    message += `元の長さ: ${result.originalLength}文字\n`;
    message += `整形後: ${result.cleanedLength}文字`;
  }
  
  return {
    type: 'text',
    text: message
  };
}

/**
 * ヘルプメッセージを生成
 */
function formatHelpMessage() {
  return {
    type: 'text',
    text: `🎙️ 音声文字起こし機能

音声メッセージを送信すると、自動的に文字起こしします。

【機能】
• 日本語音声の認識
• フィラーワード自動除去
• 長文の自動要約（200文字以上）

【対応形式】
• LINE音声メッセージ (m4a)
• 最大25MBまで

【使い方】
1. 音声メッセージを録音
2. 送信
3. 文字起こし結果が返信されます`
  };
}

/**
 * エラーメッセージを生成
 */
function formatErrorMessage(error) {
  const errorMessages = {
    'no_api_key': 'OpenAI APIキーが設定されていません',
    'audio_too_large': '音声ファイルが大きすぎます（最大25MB）',
    'unsupported_format': '対応していない音声形式です',
    'user_not_enabled': 'この機能は現在利用できません'
  };
  
  return {
    type: 'text',
    text: `⚠️ ${errorMessages[error] || 'エラーが発生しました'}`
  };
}

module.exports = {
  formatTranscriptionMessage,
  formatHelpMessage,
  formatErrorMessage
};