const GoogleDriveService = require('../../lib/google-drive-service');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🧪 Google Drive Service テスト開始');

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

    console.log('⚙️ 設定確認:', {
      hasLineChannelSecret: !!config.line.channelSecret,
      hasLineAccessToken: !!config.line.accessToken,
      hasGoogleClientId: !!config.google.clientId,
      hasGoogleClientSecret: !!config.google.clientSecret,
      hasGoogleRefreshToken: !!config.google.refreshToken,
      hasGoogleDriveFolderId: !!config.google.driveFolderId,
    });

    const driveService = new GoogleDriveService(config);
    console.log('✅ GoogleDriveService インスタンス作成完了');

    // テスト用のメッセージイベント
    const testEvent = {
      type: 'message',
      timestamp: Date.now(),
      source: {
        type: 'user',
        userId: 'U_test_user_12345'
      },
      message: {
        type: 'text',
        id: `test_message_${Date.now()}`,
        text: 'テストメッセージです。Google Driveに保存されるかテストしています。'
      }
    };

    console.log('📝 テストイベント:', testEvent);

    // メッセージ処理を実行
    const result = await driveService.handleMessage(testEvent);

    console.log('✅ メッセージ処理完了:', result);

    return res.status(200).json({
      status: 'success',
      message: 'Google Drive Service テスト完了',
      config: {
        hasLineChannelSecret: !!config.line.channelSecret,
        hasLineAccessToken: !!config.line.accessToken,
        hasGoogleClientId: !!config.google.clientId,
        hasGoogleClientSecret: !!config.google.clientSecret,
        hasGoogleRefreshToken: !!config.google.refreshToken,
        hasGoogleDriveFolderId: !!config.google.driveFolderId,
      },
      testEvent: testEvent,
      result: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Google Drive Service テストエラー:', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      status: 'error',
      message: 'Google Drive Service テスト失敗',
      error: {
        message: error.message,
        stack: error.stack
      },
      timestamp: new Date().toISOString()
    });
  }
}