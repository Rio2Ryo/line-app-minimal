/**
 * 音声文字起こし専用Webhookエンドポイント
 * 既存のwebhook.jsとは完全に独立
 * 
 * 使用方法:
 * 1. このエンドポイントを別のLINE Botとして設定
 * 2. または、特定のUSER IDのみこのエンドポイントにルーティング
 */

const crypto = require('crypto');
const config = require('../../voice-transcription/lib/config');
const { processVoiceMessage } = require('../../voice-transcription/lib/transcriptionService');
const { formatTranscriptionMessage, formatHelpMessage, formatErrorMessage } = require('../../voice-transcription/lib/messageFormatter');

// LINE署名検証
function validateSignature(body, signature, channelSecret) {
  if (!channelSecret || !signature) return false;
  try {
    const hash = crypto.createHmac('SHA256', channelSecret).update(body, 'utf8').digest('base64');
    return hash === signature;
  } catch (error) {
    return false;
  }
}

// Raw body読み取り
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-line-signature');
  
  try {
    console.log(`[音声Webhook] ${new Date().toISOString()} - ${req.method}`);
    
    // OPTIONS リクエスト
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    // GET リクエスト（ヘルスチェック）
    if (req.method === 'GET') {
      return res.status(200).json({
        message: '音声文字起こしWebhook',
        status: 'OK',
        version: '1.0',
        features: ['transcription', 'summary', 'filler_removal'],
        timestamp: new Date().toISOString()
      });
    }
    
    // POST以外は拒否
    if (req.method !== 'POST') {
      return res.status(200).json({ message: 'Method not allowed' });
    }
    
    // Body取得
    const rawBody = await getRawBody(req);
    const signature = req.headers['x-line-signature'];
    
    // 署名検証（オプション）
    if (signature && config.line.channelSecret) {
      const isValid = validateSignature(rawBody, signature, config.line.channelSecret);
      if (!isValid) {
        console.log('[音声Webhook] 署名検証失敗');
        return res.status(200).json({ message: 'Invalid signature' });
      }
    }
    
    // JSONパース
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      console.error('[音声Webhook] JSONパースエラー:', error.message);
      return res.status(200).json({ message: 'Invalid JSON' });
    }
    
    // イベント処理
    if (body.events && Array.isArray(body.events)) {
      for (const event of body.events) {
        // メッセージイベントのみ処理
        if (event.type !== 'message') continue;
        
        const userId = event.source?.userId;
        
        // ユーザー権限チェック
        if (config.users.enabledUserIds.length > 0 && !config.users.enabledUserIds.includes(userId)) {
          console.log(`[音声Webhook] 権限なし: ${userId}`);
          await replyMessage(
            event.replyToken,
            formatErrorMessage('user_not_enabled')
          );
          continue;
        }
        
        // テキストメッセージ（ヘルプ）
        if (event.message.type === 'text') {
          const text = event.message.text.toLowerCase();
          if (text.includes('help') || text.includes('ヘルプ') || text === '!voice') {
            await replyMessage(event.replyToken, formatHelpMessage());
          }
          continue;
        }
        
        // 音声メッセージ処理
        if (event.message.type === 'audio') {
          console.log(`[音声Webhook] 音声処理開始: ${event.message.id}`);
          
          // APIキーチェック
          if (!config.openai.apiKey) {
            await replyMessage(
              event.replyToken,
              formatErrorMessage('no_api_key')
            );
            continue;
          }
          
          // 音声を処理
          const result = await processVoiceMessage(
            event.message.id,
            config.line.channelAccessToken
          );
          
          // 結果を返信
          const replyMessageObj = formatTranscriptionMessage(result);
          await replyMessage(event.replyToken, replyMessageObj);
          
          console.log(`[音声Webhook] 処理完了: ${result.success ? '成功' : '失敗'}`);
        }
      }
    }
    
    return res.status(200).json({ status: 'OK' });
    
  } catch (error) {
    console.error('[音声Webhook] エラー:', error.message);
    return res.status(200).json({
      message: 'Error occurred',
      error: error.message
    });
  }
}

/**
 * LINEに返信
 */
async function replyMessage(replyToken, message) {
  if (!replyToken || !config.line.channelAccessToken) {
    console.log('[音声Webhook] 返信スキップ: トークンなし');
    return;
  }
  
  const axios = require('axios');
  
  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken: replyToken,
        messages: [message]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.line.channelAccessToken}`
        }
      }
    );
    console.log('[音声Webhook] 返信送信成功');
  } catch (error) {
    console.error('[音声Webhook] 返信エラー:', error.response?.data || error.message);
  }
}