const { google } = require('googleapis');
const axios = require('axios');

// LINE APIからユーザー表示名を取得
async function getUserDisplayName(userId, accessToken) {
  try {
    if (!userId) return 'Unknown User';
    
    const response = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    const displayName = response.data.displayName || 'Unknown User';
    console.log(`👤 ユーザー名取得: ${userId} → ${displayName}`);
    return displayName;
  } catch (error) {
    console.log(`⚠️  ユーザー名取得失敗 (${userId}):`, error.message);
    return `User_${userId ? userId.substring(0, 8) : 'unknown'}`;
  }
}

// LINE APIからグループ情報を取得
async function getGroupInfo(sourceInfo, accessToken) {
  try {
    if (sourceInfo.groupId) {
      const response = await axios.get(`https://api.line.me/v2/bot/group/${sourceInfo.groupId}/summary`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      const groupName = response.data.groupName || 'Unknown Group';
      console.log(`👥 グループ名取得: ${sourceInfo.groupId} → ${groupName}`);
      return {
        type: 'group',
        id: sourceInfo.groupId,
        name: groupName,
        identifier: `${groupName}_${sourceInfo.groupId.substring(0, 8)}`
      };
    } else if (sourceInfo.roomId) {
      console.log(`🏠 ルーム: ${sourceInfo.roomId}`);
      return {
        type: 'room',
        id: sourceInfo.roomId,
        name: 'LINE Room',
        identifier: `Room_${sourceInfo.roomId.substring(0, 8)}`
      };
    } else {
      const userName = await getUserDisplayName(sourceInfo.userId, accessToken);
      return {
        type: 'user',
        id: sourceInfo.userId || 'unknown',
        name: userName,
        identifier: `${userName}_${(sourceInfo.userId || 'unknown').substring(0, 8)}`
      };
    }
  } catch (error) {
    console.log('⚠️  グループ情報取得失敗:', error.message);
    // フォールバック
    if (sourceInfo.groupId) {
      return {
        type: 'group',
        id: sourceInfo.groupId,
        name: 'Unknown Group',
        identifier: `Group_${sourceInfo.groupId.substring(0, 8)}`
      };
    } else if (sourceInfo.roomId) {
      return {
        type: 'room',
        id: sourceInfo.roomId,
        name: 'LINE Room',
        identifier: `Room_${sourceInfo.roomId.substring(0, 8)}`
      };
    } else {
      return {
        type: 'user',
        id: sourceInfo.userId || 'unknown',
        name: 'Unknown User',
        identifier: `User_${(sourceInfo.userId || 'unknown').substring(0, 8)}`
      };
    }
  }
}

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

// グループフォルダを作成または取得（グループ名ベース）
async function getOrCreateGroupFolder(groupInfo, drive, parentFolderId) {
  const folderName = groupInfo.identifier;

  console.log(`📁 グループフォルダ確認: ${folderName}`);

  // 既存のグループフォルダを検索
  const query = `name='${folderName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const existingFolders = await drive.files.list({ q: query });

  if (existingFolders.data.files.length > 0) {
    console.log(`✅ 既存グループフォルダ使用: ${folderName}`);
    return { folderId: existingFolders.data.files[0].id, folderName };
  } else {
    // 新しいグループフォルダを作成
    console.log(`📂 新規グループフォルダ作成: ${folderName}`);
    const folderResponse = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
      }
    });
    
    // グループ情報をテキストファイルとして保存
    const infoFileName = '_group_info.txt';
    const infoContent = `グループ情報\n===============\n` +
      `タイプ: ${groupInfo.type}\n` +
      `名前: ${groupInfo.name}\n` +
      `ID: ${groupInfo.id}\n` +
      `作成日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\n`;
    
    await drive.files.create({
      requestBody: {
        name: infoFileName,
        parents: [folderResponse.data.id]
      },
      media: {
        mimeType: 'text/plain',
        body: infoContent
      }
    });
    
    console.log(`✅ グループフォルダ作成完了: ${folderName}`);
    return { folderId: folderResponse.data.id, folderName };
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

    // グループ情報を取得
    const groupInfo = await getGroupInfo(sourceInfo, config.line.accessToken);
    
    // ユーザー表示名を取得
    const userDisplayName = await getUserDisplayName(sourceInfo.userId, config.line.accessToken);

    // グループフォルダを取得または作成
    const groupFolder = await getOrCreateGroupFolder(groupInfo, drive, config.google.driveFolderId);

    // 日本時間に変換
    const jstDate = new Date(new Date(timestamp).getTime() + (9 * 60 * 60 * 1000));
    const timeStr = jstDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    
    // 日付フォルダを取得または作成（グループフォルダ内）
    const dateFolder = await getOrCreateDateFolder(drive, groupFolder.folderId, jstDate);
    
    // 日次テキストファイルを取得または作成
    const dailyTextFile = await getOrCreateDailyTextFile(drive, dateFolder.folderId, jstDate);
    
    // 追記用メッセージ内容（表示名使用）
    const newContent = `【${timeStr}】 ${userDisplayName} (${sourceInfo.userId || 'Unknown'})\n${messageText}\n\n`;
    
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

    // グループ情報を取得
    const groupInfo = await getGroupInfo(sourceInfo, config.line.accessToken);

    // グループフォルダを取得または作成
    const groupFolder = await getOrCreateGroupFolder(groupInfo, drive, config.google.driveFolderId);

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

    // ファイル名生成（拡張子自動判定）
    let originalFileName = fileName || 'unknown_file';
    const contentType = fileResponse.headers['content-type'];
    
    // 音声ファイルの拡張子を自動判定
    if (!originalFileName || originalFileName === 'unknown_file' || !originalFileName.includes('.')) {
      if (contentType) {
        if (contentType.includes('audio/mp4') || contentType.includes('audio/m4a')) {
          originalFileName = 'voice_message.m4a';
        } else if (contentType.includes('audio/mpeg')) {
          originalFileName = 'voice_message.mp3';
        } else if (contentType.includes('audio/wav')) {
          originalFileName = 'voice_message.wav';
        } else if (contentType.includes('audio/')) {
          originalFileName = 'voice_message.m4a'; // デフォルト
        } else if (contentType.includes('image/jpeg')) {
          originalFileName = 'image.jpg';
        } else if (contentType.includes('image/png')) {
          originalFileName = 'image.png';
        } else if (contentType.includes('video/mp4')) {
          originalFileName = 'video.mp4';
        } else if (contentType.includes('application/pdf')) {
          originalFileName = 'document.pdf';
        } else {
          originalFileName = 'unknown_file';
        }
      }
    }
    
    const savedFileName = `${jstDate.toISOString().split('T')[0]}_${Date.now()}_${originalFileName}`;
    console.log(`📎 ファイル名決定: ${originalFileName} → ${savedFileName} (Content-Type: ${contentType})`);

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