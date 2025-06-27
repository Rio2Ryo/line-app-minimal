const { google } = require('googleapis');

function log(message, data = null) {
  console.log(`[${new Date().toISOString()}] ${message}`, data || '');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    log('Google Drive フォルダ構造確認開始');

    // OAuth2クライアント作成
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // メインフォルダの確認
    const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const mainFolder = await drive.files.get({
      fileId: mainFolderId,
      fields: 'id, name, mimeType, createdTime, modifiedTime'
    });

    log('メインフォルダ情報', mainFolder.data);

    // メインフォルダ内のサブフォルダを確認
    const subFolders = await drive.files.list({
      q: `parents in '${mainFolderId}' and mimeType='application/vnd.google-apps.folder'`,
      fields: 'files(id, name, mimeType, createdTime, modifiedTime)',
      orderBy: 'modifiedTime desc'
    });

    log('サブフォルダ一覧', subFolders.data.files);

    // 各サブフォルダの詳細をチェック
    const folderDetails = [];
    for (const folder of subFolders.data.files) {
      // 各サブフォルダ内のファイル/フォルダを確認
      const contents = await drive.files.list({
        q: `parents in '${folder.id}'`,
        fields: 'files(id, name, mimeType, createdTime, modifiedTime)',
        orderBy: 'modifiedTime desc'
      });

      folderDetails.push({
        folder: folder,
        contents: contents.data.files
      });
    }

    // 最新の5つのファイルも確認
    const recentFiles = await drive.files.list({
      q: `parents in '${mainFolderId}'`,
      fields: 'files(id, name, mimeType, createdTime, modifiedTime, parents)',
      orderBy: 'modifiedTime desc',
      pageSize: 10
    });

    return res.status(200).json({
      status: 'success',
      mainFolder: mainFolder.data,
      subFolders: subFolders.data.files,
      folderDetails: folderDetails,
      recentFiles: recentFiles.data.files,
      timestamp: new Date().toISOString(),
      currentJST: new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString()
    });

  } catch (error) {
    log('Google Drive構造確認エラー', error.message);
    
    return res.status(500).json({
      status: 'error',
      message: 'Google Drive構造確認失敗',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}