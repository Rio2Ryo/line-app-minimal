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
    // 日本時間に変換（JST = UTC+9）
    const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    const dateStr = jstDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    console.log(`📅 日付変換: 元日時=${date.toISOString()}, JST=${jstDate.toISOString()}, 日付文字列=${dateStr}`);
    
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
      
      // 既存のGoogle Docsを検索（より厳密に）
      const docQuery = `name='${docName}' and parents in '${dateFolder.id}' and mimeType='application/vnd.google-apps.document' and trashed=false`;
      const existingDocs = await this.drive.files.list({ 
        q: docQuery,
        fields: 'files(id, name, mimeType, parents)'
      });

      console.log(`Docs検索結果: ${existingDocs.data.files.length}件`);
      existingDocs.data.files.forEach(file => {
        console.log(`  - ${file.name} (${file.id}) - ${file.mimeType}`);
      });

      let docId;
      let isNewDoc = false;
      
      if (existingDocs.data.files.length > 0) {
        // 既存のDocsに追記
        docId = existingDocs.data.files[0].id;
        console.log(`✅ 既存Docsに追記: ${docName} (ID: ${docId})`);
      } else {
        console.log(`📄 新規Google Docs作成開始: ${docName}`);
        
        // 新しいGoogle Docsを作成
        const docResponse = await this.drive.files.create({
          requestBody: {
            name: docName,
            mimeType: 'application/vnd.google-apps.document',
            parents: [dateFolder.id]
          },
          fields: 'id, name, mimeType'
        });
        
        docId = docResponse.data.id;
        isNewDoc = true;
        console.log(`✅ 新規Docs作成完了: ${docName} (ID: ${docId})`);
        
        // 少し待機してからヘッダーを追加
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
          // 新規ドキュメントにヘッダーを追加
          const docs = google.docs({ version: 'v1', auth: this.oauth2Client });
          const headerText = `LINE メッセージログ - ${dateStr}\nグループ: ${groupIdentifier}\n\n`;
          
          await docs.documents.batchUpdate({
            documentId: docId,
            requestBody: {
              requests: [{
                insertText: {
                  location: { index: 1 },
                  text: headerText
                }
              }]
            }
          });
          
          console.log(`✅ ドキュメントヘッダー追加完了`);
        } catch (headerError) {
          console.log(`⚠️ ヘッダー追加失敗: ${headerError.message}`);
        }
      }

      // メッセージを整形（IATO形式: いつ・誰が・何を）
      const messageEntry = `【${timeStr}】 ${sourceInfo.userId || 'Unknown User'}\n${messageText}\n\n`;
      
      console.log(`📝 Docsに追記するメッセージ: ${messageEntry.substring(0, 100)}...`);
      
      // Google Docs APIを使用してテキストを追記
      try {
        const docs = google.docs({ version: 'v1', auth: this.oauth2Client });
        
        // 少し待機してからドキュメントを取得
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 現在のドキュメントの内容を取得
        const doc = await docs.documents.get({ 
          documentId: docId
        });
        
        // ドキュメントの最後の位置を計算
        let endIndex = 1; // デフォルト
        if (doc.data.body && doc.data.body.content) {
          const content = doc.data.body.content;
          console.log(`📄 ドキュメント構造要素数: ${content.length}`);
          
          for (const element of content) {
            if (element.endIndex) {
              endIndex = Math.max(endIndex, element.endIndex);
            }
          }
        }
        
        console.log(`📍 ドキュメント挿入位置: ${endIndex - 1}`);
        
        // ドキュメントの最後に追記
        const updateResponse = await docs.documents.batchUpdate({
          documentId: docId,
          requestBody: {
            requests: [{
              insertText: {
                location: { index: endIndex - 1 },
                text: messageEntry
              }
            }]
          }
        });

        console.log(`✅ Google Docs更新完了: ${docName} (挿入位置: ${endIndex - 1})`);
        console.log(`📄 更新レスポンス:`, updateResponse.status === 200 ? 'OK' : 'エラー');
        
      } catch (docsError) {
        console.error(`❌ Google Docs更新エラー: ${docsError.message}`);
        
        // Google Docs API が無効の場合の詳細なエラーハンドリング
        if (docsError.message.includes('Google Docs API has not been used') || 
            docsError.message.includes('docs.googleapis.com')) {
          console.log(`🔧 Google Docs APIが無効です。テキストファイルで代替保存します。`);
        }
        
        // フォールバックとしてテキストファイルを作成
        console.log(`📝 フォールバック: テキストファイル作成`);
        
        try {
          const txtFileName = `${docName}_messages.txt`;
          
          // 既存のテキストファイルがあるかチェック
          const existingTxtQuery = `name='${txtFileName}' and parents in '${dateFolder.id}' and trashed=false`;
          const existingTxtFiles = await this.drive.files.list({ q: existingTxtQuery });
          
          let txtContent;
          if (existingTxtFiles.data.files.length > 0) {
            // 既存ファイルに追記
            const fileId = existingTxtFiles.data.files[0].id;
            
            // 既存内容を取得
            const existingContent = await this.drive.files.get({
              fileId: fileId,
              alt: 'media'
            });
            
            txtContent = existingContent.data + messageEntry;
            
            // ファイルを更新
            await this.drive.files.update({
              fileId: fileId,
              media: {
                mimeType: 'text/plain',
                body: txtContent
              }
            });
            
            console.log(`✅ 既存テキストファイルに追記完了: ${txtFileName}`);
          } else {
            // 新しいテキストファイルを作成
            txtContent = `LINE メッセージログ - ${dateStr}\nグループ: ${groupIdentifier}\n\n${messageEntry}`;
            
            await this.drive.files.create({
              requestBody: {
                name: txtFileName,
                parents: [dateFolder.id]
              },
              media: {
                mimeType: 'text/plain',
                body: txtContent
              }
            });
            
            console.log(`✅ 新規テキストファイル作成完了: ${txtFileName}`);
          }
        } catch (fallbackError) {
          console.error(`❌ フォールバックファイル作成エラー: ${fallbackError.message}`);
          throw new Error(`Google Docs API無効 + フォールバック失敗: ${fallbackError.message}`);
        }
      }

      // 古いテキストファイルがあれば削除
      try {
        const txtFileName = `${docName.replace('.gdoc', '')}_messages.txt`;
        const txtQuery = `name='${txtFileName}' and parents in '${dateFolder.id}' and trashed=false`;
        const txtFiles = await this.drive.files.list({ q: txtQuery });
        
        if (txtFiles.data.files.length > 0) {
          for (const txtFile of txtFiles.data.files) {
            await this.drive.files.delete({ fileId: txtFile.id });
            console.log(`🗑️ 古いテキストファイル削除: ${txtFile.name}`);
          }
        }
      } catch (cleanupError) {
        console.log(`⚠️ クリーンアップスキップ: ${cleanupError.message}`);
      }

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
      console.log(`📁 ファイル保存開始: ${messageId}, fileName: ${fileName}`);
      
      const { dateFolder, groupIdentifier, dateStr } = await this.createGroupDateFolders(sourceInfo, new Date(timestamp));
      
      // 日本時間でのファイル名生成
      const jstDate = new Date(new Date(timestamp).getTime() + (9 * 60 * 60 * 1000));
      const timeStr = jstDate.toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
      
      console.log(`🔗 LINE APIからファイル取得: ${messageId}`);
      
      // LINE APIからファイルコンテンツを取得
      const fileUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
      const fileResponse = await axios.get(fileUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.line.accessToken}`
        },
        responseType: 'stream',
        timeout: 30000  // 30秒タイムアウト
      });
      
      console.log(`✅ ファイル取得成功: content-type=${fileResponse.headers['content-type']}, status=${fileResponse.status}`);

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
      console.error('ファイル保存エラー:', {
        message: error.message,
        stack: error.stack,
        messageId: messageId,
        fileName: fileName,
        sourceInfo: sourceInfo
      });
      
      // 詳細なエラー情報
      if (error.response) {
        console.error('API Response Error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }
      
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