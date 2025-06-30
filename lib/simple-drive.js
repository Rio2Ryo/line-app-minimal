const { google } = require('googleapis');
const axios = require('axios');

// 日付フォルダを作成または取得
async function getOrCreateDateFolder(drive, parentFolderId, jstDate) {
  const dateStr = jstDate.toISOString().split('T')[0]; // YYYY-MM-DD
  
  console.log(`📅 日付フォルダ確認: ${dateStr}`);
  
  // 既存の日付フォルダを検索
  const query = `name='${dateStr}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const existingFolders = await drive.files.list({ q: query });
  
  if (existingFolders.data.files.length > 0) {
    console.log(`✅ 既存日付フォルダ使用: ${dateStr}`);
    return { folderId: existingFolders.data.files[0].id, folderName: dateStr };
  } else {
    // 新しい日付フォルダを作成
    console.log(`📂 新規日付フォルダ作成: ${dateStr}`);
    const folderResponse = await drive.files.create({
      requestBody: {
        name: dateStr,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
      }
    });
    
    console.log(`✅ 日付フォルダ作成完了: ${dateStr}`);
    return { folderId: folderResponse.data.id, folderName: dateStr };
  }
}

// グループフォルダを作成または取得
async function getOrCreateGroupFolder(sourceInfo, drive, parentFolderId) {
  // グループ識別子を決定
  let groupIdentifier;
  if (sourceInfo.groupId) {
    groupIdentifier = `group_${sourceInfo.groupId.substring(0, 8)}`;
  } else if (sourceInfo.roomId) {
    groupIdentifier = `room_${sourceInfo.roomId.substring(0, 8)}`;
  } else {
    groupIdentifier = `user_${sourceInfo.userId ? sourceInfo.userId.substring(0, 8) : 'unknown'}`;
  }

  console.log(`📁 グループフォルダ確認: ${groupIdentifier}`);

  // 既存のグループフォルダを検索
  const query = `name='${groupIdentifier}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const existingFolders = await drive.files.list({ q: query });

  if (existingFolders.data.files.length > 0) {
    console.log(`✅ 既存グループフォルダ使用: ${groupIdentifier}`);
    return { folderId: existingFolders.data.files[0].id, folderName: groupIdentifier };
  } else {
    // 新しいグループフォルダを作成
    console.log(`📂 新規グループフォルダ作成: ${groupIdentifier}`);
    const folderResponse = await drive.files.create({
      requestBody: {
        name: groupIdentifier,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
      }
    });
    
    console.log(`✅ グループフォルダ作成完了: ${groupIdentifier}`);
    return { folderId: folderResponse.data.id, folderName: groupIdentifier };
  }
}

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

    // グループフォルダを取得または作成
    const groupFolder = await getOrCreateGroupFolder(sourceInfo, drive, config.google.driveFolderId);

    // 日本時間に変換
    const jstDate = new Date(new Date(timestamp).getTime() + (9 * 60 * 60 * 1000));
    const timeStr = jstDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    
    // 日付フォルダを取得または作成（グループフォルダ内）
    const dateFolder = await getOrCreateDateFolder(drive, groupFolder.folderId, jstDate);
    
    // ファイル名生成
    const fileName = `LINE_${Date.now()}.txt`;
    
    // メッセージ内容
    const content = `【${timeStr}】 ${sourceInfo.userId || 'Unknown'}\n${messageText}\n\n`;

    // 日付フォルダにファイル作成
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [dateFolder.folderId]
      },
      media: {
        mimeType: 'text/plain',
        body: content
      }
    });

    console.log(`✅ 保存完了: ${groupFolder.folderName}/${dateFolder.folderName}/${fileName}`);
    return { success: true, fileName, fileId: response.data.id, groupFolder: groupFolder.folderName, dateFolder: dateFolder.folderName };

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

    // グループフォルダを取得または作成
    const groupFolder = await getOrCreateGroupFolder(sourceInfo, drive, config.google.driveFolderId);

    // 日本時間に変換
    const jstDate = new Date(new Date(timestamp).getTime() + (9 * 60 * 60 * 1000));
    const timeStr = jstDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    
    // 日付フォルダを取得または作成（グループフォルダ内）
    const dateFolder = await getOrCreateDateFolder(drive, groupFolder.folderId, jstDate);
    
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

    // 日付フォルダにアップロード
    const uploadResponse = await drive.files.create({
      requestBody: {
        name: savedFileName,
        parents: [dateFolder.folderId]
      },
      media: {
        mimeType: fileResponse.headers['content-type'] || 'application/octet-stream',
        body: fileResponse.data
      }
    });

    console.log(`✅ ファイル保存完了: ${groupFolder.folderName}/${dateFolder.folderName}/${savedFileName}`);

    return { 
      success: true, 
      fileName: savedFileName, 
      fileId: uploadResponse.data.id,
      originalFileName: originalFileName,
      groupFolder: groupFolder.folderName,
      dateFolder: dateFolder.folderName
    };

  } catch (error) {
    console.error('❌ ファイル保存エラー:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { saveToGoogleDrive, saveFileToGoogleDrive };