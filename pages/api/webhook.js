const crypto = require('crypto');
const { saveToGoogleDrive, saveFileToGoogleDrive } = require('../../lib/simple-drive');

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
        version: '7.4-date-folders',
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
          // ファイル処理を追加
          else if (['image', 'video', 'audio', 'file'].includes(event.message.type)) {
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