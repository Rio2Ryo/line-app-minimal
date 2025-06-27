const { google } = require('googleapis');

class GoogleDriveServiceSimple {
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

  // シンプルなテキストメッセージ保存
  async saveTextMessage(messageText, sourceInfo, timestamp) {
    try {
      console.log(`💾 シンプル保存開始: ${messageText.substring(0, 50)}...`);
      
      // 日本時間に変換
      const jstDate = new Date(new Date(timestamp).getTime() + (9 * 60 * 60 * 1000));
      const dateStr = jstDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = jstDate.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // グループ識別子
      let groupIdentifier;
      if (sourceInfo.groupId) {
        groupIdentifier = `group_${sourceInfo.groupId.substring(0, 8)}`;
      } else if (sourceInfo.roomId) {
        groupIdentifier = `room_${sourceInfo.roomId.substring(0, 8)}`;
      } else {
        groupIdentifier = `user_${sourceInfo.userId ? sourceInfo.userId.substring(0, 8) : 'unknown'}`;
      }

      const fileName = `${groupIdentifier}_${dateStr}_${Date.now()}.txt`;
      
      // メッセージを整形（IATO形式: いつ・誰が・何を）
      const messageEntry = `【${timeStr}】 ${sourceInfo.userId || 'Unknown User'}\n${messageText}\n\n`;
      
      console.log(`📝 保存ファイル: ${fileName}`);
      console.log(`📝 メッセージ内容: ${messageEntry.substring(0, 100)}...`);
      
      // 直接メインフォルダに保存
      const fileResponse = await this.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [this.config.google.driveFolderId]
        },
        media: {
          mimeType: 'text/plain',
          body: messageEntry
        }
      });
      
      console.log(`✅ ファイル保存完了: ${fileName} (ID: ${fileResponse.data.id})`);
      
      return {
        success: true,
        fileName: fileName,
        fileId: fileResponse.data.id,
        folder: 'LINE_Messages',
        action: 'created'
      };
    } catch (error) {
      console.error('❌ シンプル保存エラー:', {
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // シンプルなファイル保存
  async saveFile(messageId, fileName, sourceInfo, timestamp) {
    try {
      console.log(`📁 シンプルファイル保存: ${messageId}`);
      
      const jstDate = new Date(new Date(timestamp).getTime() + (9 * 60 * 60 * 1000));
      const timeStr = jstDate.toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
      
      let groupIdentifier;
      if (sourceInfo.groupId) {
        groupIdentifier = `group_${sourceInfo.groupId.substring(0, 8)}`;
      } else if (sourceInfo.roomId) {
        groupIdentifier = `room_${sourceInfo.roomId.substring(0, 8)}`;
      } else {
        groupIdentifier = `user_${sourceInfo.userId ? sourceInfo.userId.substring(0, 8) : 'unknown'}`;
      }

      const finalFileName = `${groupIdentifier}_${timeStr}_${fileName || 'file'}`;
      
      // まずファイル情報だけ保存（実際のファイルダウンロードは省略）
      const infoContent = `LINE ファイル情報\n` +
                         `時刻: ${jstDate.toISOString()}\n` +
                         `ユーザー: ${sourceInfo.userId || 'Unknown'}\n` +
                         `メッセージID: ${messageId}\n` +
                         `元ファイル名: ${fileName || 'unknown'}\n`;
      
      const fileResponse = await this.drive.files.create({
        requestBody: {
          name: finalFileName + '_info.txt',
          parents: [this.config.google.driveFolderId]
        },
        media: {
          mimeType: 'text/plain',
          body: infoContent
        }
      });
      
      console.log(`✅ ファイル情報保存完了: ${finalFileName}_info.txt`);
      
      return {
        success: true,
        fileName: finalFileName + '_info.txt',
        fileId: fileResponse.data.id,
        folder: 'LINE_Messages'
      };
    } catch (error) {
      console.error('❌ シンプルファイル保存エラー:', error);
      throw error;
    }
  }

  // メッセージイベントを処理
  async handleMessage(event) {
    const message = event.message;
    const sourceInfo = event.source;
    const timestamp = event.timestamp;

    console.log(`🔄 シンプル処理開始: ${message.type}`);

    try {
      switch (message.type) {
        case 'text':
          return await this.saveTextMessage(message.text, sourceInfo, timestamp);
          
        case 'image':
        case 'video':
        case 'audio':
        case 'file':
          return await this.saveFile(message.id, message.fileName, sourceInfo, timestamp);
          
        default:
          console.log(`❓ 未対応メッセージタイプ: ${message.type}`);
          return {
            success: true,
            skipped: true,
            reason: `Unsupported message type: ${message.type}`
          };
      }
    } catch (error) {
      console.error('❌ シンプルメッセージ処理エラー:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = GoogleDriveServiceSimple;