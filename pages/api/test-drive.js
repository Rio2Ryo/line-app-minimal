const { google } = require('googleapis');

function log(message, data = null) {
  console.log(`[${new Date().toISOString()}] ${message}`, data || '');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    log('Google Drive API接続テスト開始 - 環境変数更新後');

    // 環境変数の確認
    const config = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
    };

    log('環境変数確認', {
      hasClientId: !!config.clientId,
      hasClientSecret: !!config.clientSecret,
      hasRefreshToken: !!config.refreshToken,
      hasFolderId: !!config.folderId,
    });

    if (!config.clientId || !config.clientSecret || !config.refreshToken) {
      return res.status(400).json({
        error: 'Google Drive環境変数が不足',
        missing: {
          clientId: !config.clientId,
          clientSecret: !config.clientSecret,
          refreshToken: !config.refreshToken,
        }
      });
    }

    // OAuth2クライアント作成
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    oauth2Client.setCredentials({
      refresh_token: config.refreshToken,
    });

    log('OAuth2クライアント作成完了');

    // Google Drive API初期化
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // 接続テスト: フォルダ情報を取得
    const folderInfo = await drive.files.get({
      fileId: config.folderId,
      fields: 'id, name, mimeType, createdTime'
    });

    log('Google Drive接続成功', folderInfo.data);

    return res.status(200).json({
      status: 'success',
      message: 'Google Drive API接続成功',
      folderInfo: folderInfo.data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log('Google Drive接続エラー', error.message);
    
    return res.status(500).json({
      status: 'error',
      message: 'Google Drive API接続失敗',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}