const { google } = require('googleapis');
const axios = require('axios');
const mime = require('mime-types');

class GoogleDriveService {
  constructor(config) {
    this.config = config;
    this.oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    this.oauth2Client.setCredentials({
      refresh_token: config.google.refreshToken,
    });

    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
  }

  // グループ別・日付別フォルダを作成
  async createGroupDateFolders(sourceInfo, date = new Date()) {
    // 日本時間に変換
    const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    const dateStr = jstDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    try {
      // グループ識別子を決定
      let groupIdentifier;
      if (sourceInfo.groupId) {
        groupIdentifier = `group_${sourceInfo.groupId.substring(0, 8)}`;
      } else if (sourceInfo.roomId) {
        groupIdentifier = `room_${sourceInfo.roomId.substring(0, 8)}`;
      } else {
        groupIdentifier = `user_${sourceInfo.userId ? sourceInfo.userId.substring(0, 8) : 'unknown'}`;
      }

      console.log(`フォルダ作成: ${groupIdentifier}/${dateStr}`);

      // 1. グループフォルダが存在するかチェック
      const groupQuery = `name='${groupIdentifier}' and parents in '${this.config.google.driveFolderId}' and mimeType='application/vnd.google-apps.folder'`;
      const existingGroup = await this.drive.files.list({ q: groupQuery });

      let groupFolder;
      if (existingGroup.data.files.length > 0) {
        groupFolder = existingGroup.data.files[0];
      } else {
        // グループフォルダを作成
        const groupFolderResponse = await this.drive.files.create({
          requestBody: {
            name: groupIdentifier,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [this.config.google.driveFolderId]
          }
        });
        groupFolder = groupFolderResponse.data;
        console.log(`グループフォルダ作成: ${groupIdentifier}`);
      }

      // 2. グループ内の日付フォルダをチェック
      const dateQuery = `name='${dateStr}' and parents in '${groupFolder.id}' and mimeType='application/vnd.google-apps.folder'`;
      const existingDate = await this.drive.files.list({ q: dateQuery });

      let dateFolder;
      if (existingDate.data.files.length > 0) {
        dateFolder = existingDate.data.files[0];
      } else {
        // 日付フォルダを作成
        const dateFolderResponse = await this.drive.files.create({
          requestBody: {
            name: dateStr,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [groupFolder.id]
          }
        });
        dateFolder = dateFolderResponse.data;
        console.log(`日付フォルダ作成: ${groupIdentifier}/${dateStr}`);
      }

      return {
        groupFolder,
        dateFolder,
        groupIdentifier,
        dateStr
      };
    } catch (error) {
      console.error('グループ・日付フォルダ作成エラー:', error);
      throw error;
    }
  }

  // テキストメッセージを1つのGoogle Docsに追記
  async saveTextMessage(messageText, sourceInfo, timestamp) {
    try {
      const { dateFolder, groupIdentifier, dateStr } = await this.createGroupDateFolders(sourceInfo, new Date(timestamp));
      
      // 日本時間での時刻表示
      const jstDate = new Date(new Date(timestamp).getTime() + (9 * 60 * 60 * 1000));
      const timeStr = jstDate.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const docName = `messages_${dateStr}`;
      
      // 既存のGoogle Docsを検索
      const docQuery = `name='${docName}' and parents in '${dateFolder.id}' and mimeType='application/vnd.google-apps.document'`;
      const existingDocs = await this.drive.files.list({ q: docQuery });

      let docId;
      if (existingDocs.data.files.length > 0) {
        // 既存のDocsに追記
        docId = existingDocs.data.files[0].id;
        console.log(`既存Docsに追記: ${docName}`);
      } else {
        // 新しいGoogle Docsを作成
        const docResponse = await this.drive.files.create({
          requestBody: {
            name: docName,
            mimeType: 'application/vnd.google-apps.document',
            parents: [dateFolder.id]
          }
        });
        docId = docResponse.data.id;
        console.log(`新規Docs作成: ${docName}`);
      }

      // Google Docs APIを使用してテキストを追記
      const docs = google.docs({ version: 'v1', auth: this.oauth2Client });
      
      const newContent = `\n[${timeStr}] ${sourceInfo.userId || 'Unknown User'}\n${messageText}\n`;
      
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests: [{
            insertText: {
              location: { index: 1 },
              text: newContent
            }
          }]
        }
      });

      return {
        success: true,
        docId: docId,
        docName: docName,
        folder: `${groupIdentifier}/${dateStr}`,
        action: existingDocs.data.files.length > 0 ? 'appended' : 'created'
      };
    } catch (error) {
      console.error('テキストメッセージ保存エラー:', error);
      throw error;
    }
  }

  // ファイル（画像、動画等）を保存
  async saveFile(messageId, fileName, sourceInfo, timestamp) {
    try {
      const { dateFolder, groupIdentifier, dateStr } = await this.createGroupDateFolders(sourceInfo, new Date(timestamp));
      
      // 日本時間でのファイル名生成
      const jstDate = new Date(new Date(timestamp).getTime() + (9 * 60 * 60 * 1000));
      const timeStr = jstDate.toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
      
      // LINE APIからファイルコンテンツを取得
      const fileUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
      const fileResponse = await axios.get(fileUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.line.accessToken}`
        },
        responseType: 'stream'
      });

      const mimeType = fileResponse.headers['content-type'] || mime.lookup(fileName) || 'application/octet-stream';
      
      // ファイル名を日本時間ベースで生成
      let finalFileName;
      if (fileName) {
        const ext = fileName.split('.').pop();
        finalFileName = `${timeStr}_${fileName}`;
      } else {
        // ファイル名がない場合はメッセージタイプから推定
        let ext = 'file';
        if (mimeType.includes('image')) ext = 'jpg';
        else if (mimeType.includes('video')) ext = 'mp4';
        else if (mimeType.includes('audio')) ext = 'mp3';
        
        finalFileName = `${timeStr}_file.${ext}`;
      }

      const response = await this.drive.files.create({
        requestBody: {
          name: finalFileName,
          parents: [dateFolder.id]
        },
        media: {
          mimeType: mimeType,
          body: fileResponse.data
        }
      });

      return {
        success: true,
        fileId: response.data.id,
        fileName: finalFileName,
        folder: `${groupIdentifier}/${dateStr}`,
        mimeType: mimeType
      };
    } catch (error) {
      console.error('ファイル保存エラー:', error);
      throw error;
    }
  }

  // メッセージイベントを処理
  async handleMessage(event) {
    const message = event.message;
    const sourceInfo = event.source;
    const timestamp = event.timestamp;

    console.log(`処理開始: ${message.type} メッセージ`);

    try {
      switch (message.type) {
        case 'text':
          return await this.saveTextMessage(message.text, sourceInfo, timestamp);
          
        case 'image':
        case 'video':
        case 'audio':
        case 'file':
          const fileName = message.fileName || `${message.type}_${Date.now()}`;
          return await this.saveFile(message.id, fileName, sourceInfo, timestamp);
          
        default:
          console.log(`未対応メッセージタイプ: ${message.type}`);
          return {
            success: true,
            skipped: true,
            reason: `Unsupported message type: ${message.type}`
          };
      }
    } catch (error) {
      console.error('メッセージ処理エラー:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = GoogleDriveService;