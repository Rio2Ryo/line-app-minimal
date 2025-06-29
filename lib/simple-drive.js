const { google } = require('googleapis');
const axios = require('axios');

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

async function saveFileToGoogleDrive(messageId, fileName, sourceInfo, timestamp, config) {
  try {
    console.log('📁 ファイル保存開始:', { messageId, fileName });

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
    
    // LINE APIからファイルを取得
    const fileUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
    console.log('📥 LINE APIからファイル取得:', fileUrl);

    const fileResponse = await axios.get(fileUrl, {
      headers: {
        'Authorization': `Bearer ${config.line.accessToken}`
      },
      responseType: 'stream',
      timeout: 30000
    });

    console.log('✅ ファイル取得成功:', {
      contentType: fileResponse.headers['content-type'],
      contentLength: fileResponse.headers['content-length']
    });

    // ファイル名生成
    const originalFileName = fileName || 'unknown_file';
    const savedFileName = `${jstDate.toISOString().split('T')[0]}_${Date.now()}_${originalFileName}`;

    // Google Driveにアップロード
    const uploadResponse = await drive.files.create({
      requestBody: {
        name: savedFileName,
        parents: [config.google.driveFolderId]
      },
      media: {
        mimeType: fileResponse.headers['content-type'] || 'application/octet-stream',
        body: fileResponse.data
      }
    });

    console.log(`✅ ファイル保存完了: ${savedFileName}`);

    return { 
      success: true, 
      fileName: savedFileName, 
      fileId: uploadResponse.data.id,
      originalFileName: originalFileName
    };

  } catch (error) {
    console.error('❌ ファイル保存エラー:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { saveToGoogleDrive, saveFileToGoogleDrive };