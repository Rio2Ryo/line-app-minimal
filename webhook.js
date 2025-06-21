const crypto = require('crypto');
const googleDriveMessageHandler = require('../src/services/googleDriveMessageHandler');
const googleDriveService = require('../src/services/googleDriveServiceOAuth');
const logger = require('../src/utils/logger');

// Vercel環境変数から設定を読み込み
const config = {
  line: {
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    accessToken: process.env.LINE_ACCESS_TOKEN,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
  },
};

// LINE Signature検証関数
function validateSignature(body, signature, channelSecret) {
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body, 'utf8')
    .digest('base64');
  return hash === signature;
}

export default async function handler(req, res) {
  // CORSヘッダーを設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-line-signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'LINE to Google Drive Integration Service - Vercel',
      status: 'OK',
      timestamp: new Date().toISOString(),
      features: [
        'Personal chat messages',
        'Group chat messages',
        'Room chat messages',
        'All file types (PDF, images, videos, etc.)',
        'Google Drive automatic upload',
        'Date-based folder organization'
      ]
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const signature = req.headers['x-line-signature'];
    const body = req.body;
    
    console.log('🔗 Webhook受信:');
    console.log('  - Signature:', signature ? '✅ あり' : '❌ なし');
    console.log('  - Body Length:', JSON.stringify(body).length);
    
    if (!signature) {
      console.log('⚠️  テストリクエスト（署名なし）');
      return res.status(200).json({ message: 'Test request received (no signature)' });
    }

    // Signature validation
    const bodyString = JSON.stringify(body);
    const isValid = validateSignature(bodyString, signature, config.line.channelSecret);
    
    if (!isValid) {
      console.log('❌ 署名検証失敗');
      logger.error('Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    console.log('✅ 署名検証成功');
    
    if (!body.events || !Array.isArray(body.events)) {
      console.log('⚠️  イベントなし');
      return res.status(200).json({ message: 'No events to process' });
    }

    // Process events
    console.log(`📨 ${body.events.length}件のイベントを処理中...`);
    
    const results = await Promise.allSettled(
      body.events.map(async (event, index) => {
        console.log(`\n📝 イベント ${index + 1}:`);
        console.log(`  - タイプ: ${event.type}`);
        console.log(`  - ユーザーID: ${event.source?.userId || 'N/A'}`);
        console.log(`  - 送信元タイプ: ${event.source?.type || 'N/A'}`);
        
        if (event.source?.groupId) {
          console.log(`  - グループID: ${event.source.groupId}`);
        }
        if (event.source?.roomId) {
          console.log(`  - ルームID: ${event.source.roomId}`);
        }
        
        console.log(`  - タイムスタンプ: ${new Date(event.timestamp).toLocaleString('ja-JP')}`);
        
        if (event.type === 'message') {
          const message = event.message;
          const sourceInfo = googleDriveMessageHandler.parseSourceInfo(event.source);
          const timestamp = new Date(event.timestamp);

          console.log(`  - メッセージタイプ: ${message.type}`);
          
          try {
            let uploadResult;
            
            switch (message.type) {
              case 'text':
                console.log(`  - テキスト: "${message.text}"`);
                uploadResult = await googleDriveMessageHandler.handleTextMessage(message, sourceInfo, timestamp);
                break;
                
              case 'image':
              case 'video':
              case 'audio':
              case 'file':
                console.log(`  - メッセージID: ${message.id}`);
                if (message.fileName) {
                  console.log(`  - ファイル名: ${message.fileName}`);
                }
                // Vercel環境ではLINE Clientを動的に作成
                const { Client } = require('@line/bot-sdk');
                const client = new Client({
                  channelAccessToken: config.line.accessToken,
                });
                uploadResult = await googleDriveMessageHandler.handleFileMessage(message, sourceInfo, timestamp, client);
                break;
                
              default:
                console.log(`  - ❌ サポートされていないメッセージタイプ: ${message.type}`);
                return;
            }
            
            console.log(`  - ✅ Google Drive保存完了`);
            console.log(`  - 🔗 ファイルURL: ${uploadResult.webViewLink}`);
            
            logger.info('Event processed successfully for Google Drive:', {
              type: event.type,
              sourceType: event.source?.type,
              userId: event.source?.userId,
              groupId: event.source?.groupId,
              roomId: event.source?.roomId,
              messageType: event.message?.type,
              fileName: event.message?.fileName,
              googleDriveFileId: uploadResult.fileId,
              webViewLink: uploadResult.webViewLink,
              timestamp: event.timestamp
            });
            
            return { success: true, uploadResult };
            
          } catch (error) {
            console.log(`  - ❌ エラー: ${error.message}`);
            logger.error('Error processing message for Google Drive:', {
              error: error.message,
              eventType: event.type,
              sourceType: event.source?.type,
              messageType: message.type,
              userId: event.source?.userId,
              groupId: event.source?.groupId,
              roomId: event.source?.roomId
            });
            return { success: false, error: error.message };
          }
        } else if (event.type === 'join') {
          console.log('  - 🎉 Botがグループ/ルームに参加しました');
          logger.info('Bot joined group/room:', {
            sourceType: event.source?.type,
            groupId: event.source?.groupId,
            roomId: event.source?.roomId
          });
          return { success: true, joined: true };
        } else if (event.type === 'leave') {
          console.log('  - 👋 Botがグループ/ルームから退出しました');
          logger.info('Bot left group/room:', {
            sourceType: event.source?.type,
            groupId: event.source?.groupId,
            roomId: event.source?.roomId
          });
          return { success: true, left: true };
        } else {
          console.log('  - ⚠️  メッセージ以外のイベントはスキップ');
          return { success: true, skipped: true };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const failed = results.filter(r => r.status === 'rejected' || !r.value?.success).length;
    
    console.log(`\n📊 処理結果: 成功 ${successful}件, 失敗 ${failed}件`);
    
    return res.status(200).json({
      message: 'Events processed successfully',
      results: {
        total: body.events.length,
        successful,
        failed
      }
    });

  } catch (error) {
    console.log('❌ Webhookエラー:', error.message);
    logger.error('Webhook error:', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Internal server error' });
  }
}