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

// 日付別テキストファイルを作成または更新（一日一つのファイル）
async function getOrCreateDailyTextFile(drive, dateFolderId, jstDate) {
  const dateStr = jstDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const fileName = `messages_${dateStr}.txt`;
  
  console.log(`📄 日付別テキストファイル確認: ${fileName}`);
  
  // 既存のテキストファイルを検索
  const query = `name='${fileName}' and parents in '${dateFolderId}' and mimeType='text/plain' and trashed=false`;
  const existingFiles = await drive.files.list({ q: query });
  
  if (existingFiles.data.files.length > 0) {
    console.log(`✅ 既存テキストファイル使用: ${fileName}`);
    return { fileId: existingFiles.data.files[0].id, fileName, isNew: false };
  } else {
    // 新しいテキストファイルを作成
    console.log(`📝 新規テキストファイル作成: ${fileName}`);
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [dateFolderId],
        mimeType: 'text/plain'
      },
      media: {
        mimeType: 'text/plain',
        body: `=== LINE メッセージログ ${dateStr} ===\n\n`
      }
    });
    
    console.log(`✅ テキストファイル作成完了: ${fileName}`);
    return { fileId: response.data.id, fileName, isNew: true };
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
    
    // 日次テキストファイルを取得または作成
    const dailyTextFile = await getOrCreateDailyTextFile(drive, dateFolder.folderId, jstDate);
    
    // 追記用メッセージ内容
    const newContent = `【${timeStr}】 ${sourceInfo.userId || 'Unknown'}\n${messageText}\n\n`;
    
    // 既存の内容を取得（シンプルアプローチ）
    let existingContent = '';
    if (!dailyTextFile.isNew) {
      try {
        const response = await drive.files.get({
          fileId: dailyTextFile.fileId,
          alt: 'media'
        });
        existingContent = response.data || '';
      } catch (error) {
        console.log('既存内容取得エラー（新規内容で続行）:', error.message);
        existingContent = `=== LINE メッセージログ ${jstDate.toISOString().split('T')[0]} ===\n\n`;
      }
    } else {
      existingContent = `=== LINE メッセージログ ${jstDate.toISOString().split('T')[0]} ===\n\n`;
    }
    
    // 内容を追記してファイル更新
    const updatedContent = existingContent + newContent;
    await drive.files.update({
      fileId: dailyTextFile.fileId,
      media: {
        mimeType: 'text/plain',
        body: updatedContent
      }
    });

    console.log(`✅ 追記完了: ${groupFolder.folderName}/${dateFolder.folderName}/${dailyTextFile.fileName}`);
    return { success: true, fileName: dailyTextFile.fileName, fileId: dailyTextFile.fileId, groupFolder: groupFolder.folderName, dateFolder: dateFolder.folderName };

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