const crypto = require('crypto');
const axios = require('axios');
const { saveToGoogleDrive, saveFileToGoogleDrive } = require('../../lib/simple-drive');
const { processVoiceMessage } = require('../../voice-transcription/lib/transcriptionService');
const { formatTranscriptionMessage } = require('../../voice-transcription/lib/messageFormatter');

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
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-line-signature');

  try {
    console.log(`[${new Date().toISOString()}] Webhook受信: ${req.method}`);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        message: 'LINE Bot Webhook - Simplified',
        status: 'OK',
        version: '8.1-jst-fixed',
        timestamp: new Date().toISOString()
      });
    }

    if (req.method !== 'POST') {
      return res.status(200).json({ message: 'Method not allowed but returning 200' });
    }

    const rawBody = await getRawBody(req);
    const signature = req.headers['x-line-signature'];

    console.log(`受信: Body長=${rawBody.length}, Signature=${signature ? 'あり' : 'なし'}`);

    // 署名検証（なくても続行）
    if (signature) {
      const channelSecret = process.env.LINE_CHANNEL_SECRET;
      const isValid = validateSignature(rawBody, signature, channelSecret);
      console.log(`署名検証: ${isValid ? '成功' : '失敗（続行）'}`);
    }

    // JSON解析
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('JSON解析エラー:', parseError.message);
      return res.status(200).json({ message: 'JSON parse error but returning 200' });
    }

    // イベント処理
    if (body.events && Array.isArray(body.events)) {
      console.log(`${body.events.length}件のイベント処理開始`);

      const config = {
        line: {
          accessToken: process.env.LINE_ACCESS_TOKEN,
        },
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
          driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
        }
      };

      for (const event of body.events) {
        if (event.type === 'message') {
          if (event.message.type === 'text') {
            console.log(`テキストメッセージ処理: ${event.message.text.substring(0, 50)}...`);
            
            const result = await saveToGoogleDrive(
              event.message.text,
              event.source,
              event.timestamp,
              config
            );
            
            console.log(`テキスト処理結果: ${result.success ? '成功' : '失敗'}`);
          }
          // 音声メッセージの処理（文字起こし + Google Drive保存）
          else if (event.message.type === 'audio') {
            console.log(`音声メッセージ処理開始: ID=${event.message.id}`);
            console.log(`VOICE_OPENAI_API_KEY: ${process.env.VOICE_OPENAI_API_KEY ? '設定済み' : '未設定'}`);
            
            // 1. 音声文字起こし処理
            if (process.env.VOICE_OPENAI_API_KEY) {
              try {
                const transcriptionResult = await processVoiceMessage(
                  event.message.id,
                  process.env.LINE_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN
                );
                
                console.log('文字起こし結果:', transcriptionResult);
                if (transcriptionResult.success) {
                  // 文字起こし結果を返信
                  const replyMessage = formatTranscriptionMessage(transcriptionResult);
                  console.log('返信メッセージ:', replyMessage);
                  if (body.replyToken) {
                    await axios.post(
                      'https://api.line.me/v2/bot/message/reply',
                      {
                        replyToken: body.replyToken,
                        messages: [replyMessage]
                      },
                      {
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${process.env.LINE_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN}`
                        }
                      }
                    );
                    console.log('音声文字起こし結果を返信しました');
                  }
                } else {
                  console.log('文字起こし失敗:', transcriptionResult.error);
                }
              } catch (error) {
                console.error('音声文字起こしエラー:', error.message);
                console.error('エラー詳細:', error);
              }
            }
            
            // 2. Google Driveに音声ファイルを保存（既存の処理）
            const result = await saveFileToGoogleDrive(
              event.message.id,
              event.message.fileName,
              event.source,
              event.timestamp,
              config
            );
            
            console.log(`音声ファイル保存結果: ${result.success ? '成功' : '失敗'} - ${result.fileName || result.error}`);
          }
          // その他のファイル処理
          else if (['image', 'video', 'file'].includes(event.message.type)) {
            console.log(`ファイル処理開始: ${event.message.type} (ID: ${event.message.id})`);
            
            const result = await saveFileToGoogleDrive(
              event.message.id,
              event.message.fileName,
              event.source,
              event.timestamp,
              config
            );
            
            console.log(`ファイル処理結果: ${result.success ? '成功' : '失敗'} - ${result.fileName || result.error}`);
          }
          else {
            console.log(`未対応メッセージタイプ: ${event.message.type}`);
          }
        }
      }
    }

    return res.status(200).json({
      message: 'Webhook processed successfully',
      receivedEvents: body.events?.length || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Webhookエラー:', error.message);
    return res.status(200).json({
      message: 'Error occurred but returning 200',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}