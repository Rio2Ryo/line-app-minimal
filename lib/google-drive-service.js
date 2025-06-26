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

  // 日付別フォルダを作成
  async createDateFolders(date = new Date()) {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    
    try {
      // 日付フォルダが存在するかチェック
      const query = `name='${dateStr}' and parents in '${this.config.google.driveFolderId}' and mimeType='application/vnd.google-apps.folder'`;
      const existing = await this.drive.files.list({ q: query });

      if (existing.data.files.length > 0) {
        return {
          dateFolder: existing.data.files[0],
          created: false
        };
      }

      // 日付フォルダを作成
      const dateFolder = await this.drive.files.create({
        requestBody: {
          name: dateStr,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [this.config.google.driveFolderId]
        }
      });

      return {
        dateFolder: dateFolder.data,
        created: true
      };
    } catch (error) {
      console.error('日付フォルダ作成エラー:', error);
      throw error;
    }
  }

  // テキストメッセージを保存
  async saveTextMessage(messageText, sourceInfo, timestamp) {
    try {
      const { dateFolder } = await this.createDateFolders(new Date(timestamp));
      
      const fileName = `message_${new Date(timestamp).toISOString().replace(/[:.]/g, '-')}.txt`;
      
      const content = `時刻: ${new Date(timestamp).toLocaleString('ja-JP')}
送信者ID: ${sourceInfo.userId || 'N/A'}
送信元タイプ: ${sourceInfo.type || 'N/A'}
グループID: ${sourceInfo.groupId || 'N/A'}
ルームID: ${sourceInfo.roomId || 'N/A'}

メッセージ:
${messageText}
`;

      const response = await this.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [dateFolder.id]
        },
        media: {
          mimeType: 'text/plain; charset=utf-8',
          body: content
        }
      });

      return {
        success: true,
        fileId: response.data.id,
        fileName: fileName,
        folder: dateFolder.name
      };
    } catch (error) {
      console.error('テキストメッセージ保存エラー:', error);
      throw error;
    }
  }

  // ファイル（画像、動画等）を保存
  async saveFile(messageId, fileName, sourceInfo, timestamp) {
    try {
      const { dateFolder } = await this.createDateFolders(new Date(timestamp));
      
      // LINE APIからファイルコンテンツを取得
      const fileUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
      const fileResponse = await axios.get(fileUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.line.accessToken}`
        },
        responseType: 'stream'
      });

      const mimeType = fileResponse.headers['content-type'] || mime.lookup(fileName) || 'application/octet-stream';
      const finalFileName = fileName || `file_${new Date(timestamp).toISOString().replace(/[:.]/g, '-')}`;

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
        folder: dateFolder.name,
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