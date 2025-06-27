const GoogleDriveService = require('../../lib/google-drive-service');

function log(message, data = null) {
  console.log(`[${new Date().toISOString()}] ${message}`, data || '');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    log('テストメッセージ処理開始');

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

    const driveService = new GoogleDriveService(config);
    
    // 現在の日時でテストメッセージを作成
    const testEvent = {
      type: 'message',
      timestamp: Date.now(),
      source: {
        type: 'group',
        groupId: 'C1234567890abcdef1234567890abcdef',
        userId: 'U1234567890abcdef1234567890abcdef'
      },
      message: {
        type: 'text',
        id: `test-message-${Date.now()}`,
        text: '【テスト】現在の日時でGoogle Docsに保存されるメッセージです。IATO形式で保存されているかチェックしてください。'
      }
    };

    log('テストイベント作成', {
      timestamp: testEvent.timestamp,
      currentDate: new Date(testEvent.timestamp).toISOString(),
      jstDate: new Date(testEvent.timestamp + (9 * 60 * 60 * 1000)).toISOString()
    });

    const result = await driveService.handleMessage(testEvent);
    
    log('テストメッセージ処理完了', result);

    return res.status(200).json({
      status: 'success',
      message: 'テストメッセージ処理完了',
      result: result,
      timestamp: new Date().toISOString(),
      testEvent: testEvent
    });

  } catch (error) {
    log('テストメッセージ処理エラー', error.message);
    
    return res.status(500).json({
      status: 'error',
      message: 'テストメッセージ処理失敗',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}