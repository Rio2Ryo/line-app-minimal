const { google } = require('googleapis');

async function saveToGoogleDrive(messageText, sourceInfo, timestamp, config) {
  try {
    console.log('📝 Google Drive保存開始');

    // OAuth2設定
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    oauth2Client.setCredentials({
      refresh_token: config.google.refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // 日本時間に変換
    const jstDate = new Date(new Date(timestamp).getTime() + (9 * 60 * 60 * 1000));
    const timeStr = jstDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    
    // ファイル名生成
    const fileName = `LINE_${Date.now()}.txt`;
    
    // メッセージ内容
    const content = `【${timeStr}】 ${sourceInfo.userId || 'Unknown'}\n${messageText}\n\n`;

    // ファイル作成
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [config.google.driveFolderId]
      },
      media: {
        mimeType: 'text/plain',
        body: content
      }
    });

    console.log(`✅ 保存完了: ${fileName}`);
    return { success: true, fileName, fileId: response.data.id };

  } catch (error) {
    console.error('❌ 保存エラー:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { saveToGoogleDrive };