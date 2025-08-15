/**
 * 音声文字起こしサービス
 * OpenAI Whisper APIを使用した音声認識
 */

const axios = require('axios');
const FormData = require('form-data');
const config = require('./config');

/**
 * 音声ファイルを文字起こし
 */
async function transcribeAudio(audioBuffer, fileName = 'audio.m4a') {
  if (!config.openai.apiKey) {
    throw new Error('OpenAI APIキーが設定されていません');
  }
  
  const formData = new FormData();
  formData.append('file', audioBuffer, fileName);
  formData.append('model', config.openai.whisperModel);
  formData.append('language', 'ja');
  formData.append('response_format', 'json');
  
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${config.openai.apiKey}`
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );
    
    return response.data.text;
  } catch (error) {
    console.error('Whisper API エラー:', error.response?.data || error.message);
    throw new Error('音声の文字起こしに失敗しました');
  }
}

/**
 * フィラーワードを除去
 */
function cleanTranscription(text) {
  if (!text) return '';
  
  // フィラーワードのパターン
  const fillerPatterns = [
    /あー+/g,
    /えー+と?/g,
    /うー+ん/g,
    /そのー+/g,
    /あのー+/g,
    /えっ+と/g,
    /まあ+/g,
    /なんか/g,
    /なんていうか/g,
    /ちょっと/g
  ];
  
  let cleaned = text;
  fillerPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // 連続する句読点や空白を整理
  cleaned = cleaned
    .replace(/[、。]+/g, match => match[0])
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .replace(/、\s*、/g, '、')
    .replace(/。\s*。/g, '。');
  
  // 文末に句点がない場合は追加
  if (cleaned && !cleaned.match(/[。！？]$/)) {
    cleaned += '。';
  }
  
  return cleaned;
}

/**
 * テキストを要約
 */
async function summarizeText(text) {
  if (!config.openai.apiKey) {
    return null;
  }
  
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: config.openai.gptModel,
        messages: [
          {
            role: 'system',
            content: '以下のテキストを簡潔に要約してください。重要なポイントを箇条書きで3つ以内にまとめてください。'
          },
          {
            role: 'user',
            content: text
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      },
      {
        headers: {
          'Authorization': `Bearer ${config.openai.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('要約生成エラー:', error.response?.data || error.message);
    return null;
  }
}

/**
 * LINE音声メッセージを取得
 */
async function getAudioContent(messageId, channelAccessToken) {
  try {
    const response = await axios.get(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      {
        headers: {
          'Authorization': `Bearer ${channelAccessToken}`
        },
        responseType: 'arraybuffer'
      }
    );
    
    return Buffer.from(response.data);
  } catch (error) {
    console.error('音声ファイル取得エラー:', error.response?.status, error.message);
    throw new Error('音声ファイルの取得に失敗しました');
  }
}

/**
 * 音声メッセージを処理
 */
async function processVoiceMessage(messageId, channelAccessToken) {
  try {
    // 1. 音声ファイルを取得
    console.log('[音声処理] ファイル取得中:', messageId);
    const audioBuffer = await getAudioContent(messageId, channelAccessToken);
    
    // 2. 文字起こし
    console.log('[音声処理] 文字起こし中...');
    const rawTranscription = await transcribeAudio(audioBuffer);
    
    // 3. テキスト整形
    const cleanedText = cleanTranscription(rawTranscription);
    console.log('[音声処理] 整形後:', cleanedText.length, '文字');
    
    // 4. 要約（必要な場合）
    let summary = null;
    if (cleanedText.length >= config.features.summaryThreshold) {
      console.log('[音声処理] 要約生成中...');
      summary = await summarizeText(cleanedText);
    }
    
    return {
      success: true,
      transcription: cleanedText,
      summary: summary,
      originalLength: rawTranscription.length,
      cleanedLength: cleanedText.length
    };
  } catch (error) {
    console.error('[音声処理] エラー:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  transcribeAudio,
  cleanTranscription,
  summarizeText,
  getAudioContent,
  processVoiceMessage
};