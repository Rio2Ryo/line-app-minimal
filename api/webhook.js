const crypto = require('crypto');
const googleDriveMessageHandler = require('../src/services/googleDriveMessageHandler');
const logger = require('../src/utils/logger');

// Vercel環境変数から設定を読み込み
const appConfig = {
  line: {
    channelSecret: process.env.LINE_CHANNEL_SECRET || 'test-secret',
    accessToken: process.env.LINE_ACCESS_TOKEN || 'test-token',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || 'test-client-id',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || 'test-refresh-token',
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || 'test-folder-id',
  },
};

// 簡単なログ関数
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data || '');
}

// LINE Signature検証関数（シンプル版）
function validateSignature(body, signature, channelSecret) {
  if (!channelSecret || !signature) {
    return false;
  }
  
  try {
    const hash = crypto
      .createHmac('SHA256', channelSecret)
      .update(body, 'utf8')
      .digest('base64');
    return hash === signature;
  } catch (error) {
    log('署名検証エラー:', error.message);
    return false;
  }
}

// ヘルパー関数：raw bodyを読み取る
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Vercel設定でbodyParserを無効化
export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  // CORSヘッダーを設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-line-signature');

  try {
    log(`Webhook受信: ${req.method}`);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        message: 'LINE Bot Webhook - Google Drive Integration v2',
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '2.0-googledrive'
      });
    }

    if (req.method !== 'POST') {
      return res.status(200).json({ message: 'Method not allowed but returning 200' });
    }

    // シンプルなbody読み取り
    const rawBody = await getRawBody(req);
    const signature = req.headers['x-line-signature'];
    
    log('Body受信完了', `Length: ${rawBody.length}, Signature: ${signature ? 'あり' : 'なし'}`);

    // 署名なしの場合は受け入れ（テスト用）
    if (!signature) {
      log('署名なしリクエスト - テストとして処理');
      return res.status(200).json({ message: 'Test request accepted (no signature)' });
    }

    // 署名検証
    const isValid = validateSignature(rawBody, signature, appConfig.line.channelSecret);
    
    if (!isValid) {
      log('署名検証失敗', {
        signature: signature?.substring(0, 20) + '...',
        bodyLength: rawBody.length,
        hasSecret: !!appConfig.line.channelSecret
      });
      // 署名失敗でも200を返す
      return res.status(200).json({ message: 'Signature validation failed but returning 200' });
    }

    log('署名検証成功');

    // JSON解析
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      log('JSON解析エラー', parseError.message);
      return res.status(200).json({ message: 'JSON parse error but returning 200' });
    }

    // イベント処理（Google Drive統合版）
    if (body.events && Array.isArray(body.events)) {
      log(`${body.events.length}件のイベントを受信`);
      
      const results = await Promise.allSettled(
        body.events.map(async (event, index) => {
          log(`イベント${index + 1}`, {
            type: event.type,
            sourceType: event.source?.type,
            userId: event.source?.userId,
            messageType: event.message?.type
          });
          
          if (event.type === 'message') {
            try {
              // Google Drive処理を実行
              const result = await googleDriveMessageHandler.handleMessage(event, appConfig);
              log('Google Drive処理成功', result);
              return { success: true, result };
            } catch (error) {
              log('Google Drive処理エラー', error.message);
              return { success: false, error: error.message };
            }
          } else if (event.type === 'join') {
            log('Botがグループ/ルームに参加しました');
            return { success: true, joined: true };
          } else if (event.type === 'leave') {
            log('Botがグループ/ルームから退出しました');
            return { success: true, left: true };
          } else {
            log('メッセージ以外のイベントはスキップ');
            return { success: true, skipped: true };
          }
        })
      );
      
      const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
      const failed = results.filter(r => r.status === 'rejected' || !r.value?.success).length;
      log(`処理結果: 成功 ${successful}件, 失敗 ${failed}件`);
    }

    // 成功レスポンス
    return res.status(200).json({
      message: 'Webhook processed successfully',
      receivedEvents: body.events?.length || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log('Webhookエラー', error.message);
    // エラーでも200を返す
    return res.status(200).json({ 
      message: 'Error occurred but returning 200',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}