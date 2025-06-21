const axios = require('axios');
const mime = require('mime-types');
const logger = require('../utils/logger');
const localStorageService = require('./localStorageService');

class GroupMessageHandler {
  async handleTextMessage(message, sourceInfo, timestamp) {
    try {
      const { userId, groupId, roomId, type } = sourceInfo;
      
      logger.info('Processing group text message for local storage:', { 
        userId, 
        groupId,
        roomId,
        sourceType: type,
        messageLength: message.text.length 
      });

      const folders = localStorageService.createDateBasedFolders(timestamp);
      
      const textContent = this.formatTextMessage(message.text, sourceInfo, timestamp);
      const fileName = this.generateTextFileName(timestamp, sourceInfo);
      
      const savedPath = localStorageService.saveTextFile(
        textContent, 
        fileName, 
        folders.textsDir
      );

      console.log(`💾 グループテキストメッセージ保存完了:
      📁 保存先: ${savedPath}
      👤 ユーザー: ${userId}
      👥 ${type === 'group' ? 'グループ' : type === 'room' ? 'ルーム' : '個人チャット'}: ${groupId || roomId || 'N/A'}
      📝 内容: "${message.text}"
      🕐 時刻: ${timestamp.toLocaleString('ja-JP')}`);

      logger.info('Group text message saved successfully:', { 
        userId,
        groupId,
        roomId,
        sourceType: type,
        fileName,
        savedPath,
        timestamp: timestamp.toISOString()
      });

      return savedPath;

    } catch (error) {
      logger.error('Error handling group text message:', { 
        error: error.message, 
        sourceInfo,
        stack: error.stack 
      });
      throw error;
    }
  }

  async handleFileMessage(message, sourceInfo, timestamp, lineClient) {
    try {
      const { userId, groupId, roomId, type } = sourceInfo;
      
      logger.info('Processing group file message for local storage:', { 
        userId,
        groupId,
        roomId,
        sourceType: type,
        messageType: message.type,
        messageId: message.id 
      });

      const fileStream = await this.downloadFileFromLine(message.id, lineClient);
      const folders = localStorageService.createDateBasedFolders(timestamp);
      
      const fileName = this.generateFileName(message, timestamp, sourceInfo);
      
      const savedPath = await localStorageService.saveFileFromStream(
        fileStream, 
        fileName, 
        folders.filesDir
      );

      console.log(`💾 グループファイル保存完了:
      📁 保存先: ${savedPath}
      👤 ユーザー: ${userId}
      👥 ${type === 'group' ? 'グループ' : type === 'room' ? 'ルーム' : '個人チャット'}: ${groupId || roomId || 'N/A'}
      📎 タイプ: ${message.type}
      📄 ファイル名: ${fileName}
      🕐 時刻: ${timestamp.toLocaleString('ja-JP')}`);

      logger.info('Group file message saved successfully:', { 
        userId,
        groupId,
        roomId,
        sourceType: type,
        fileName,
        savedPath,
        messageType: message.type,
        timestamp: timestamp.toISOString()
      });

      return savedPath;

    } catch (error) {
      logger.error('Error handling group file message:', { 
        error: error.message, 
        sourceInfo,
        messageType: message.type,
        messageId: message.id,
        stack: error.stack 
      });
      throw error;
    }
  }

  async downloadFileFromLine(messageId, lineClient) {
    try {
      const stream = await lineClient.getMessageContent(messageId);
      return stream;
    } catch (error) {
      logger.error('Error downloading file from LINE:', { 
        error: error.message, 
        messageId 
      });
      throw error;
    }
  }

  parseSourceInfo(source) {
    const sourceInfo = {
      userId: source.userId,
      type: source.type,
      groupId: source.groupId || null,
      roomId: source.roomId || null
    };

    return sourceInfo;
  }

  formatTextMessage(text, sourceInfo, timestamp) {
    const { userId, groupId, roomId, type } = sourceInfo;
    
    const formattedTimestamp = timestamp.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    let sourceDescription = '';
    if (type === 'group' && groupId) {
      sourceDescription = `グループID: ${groupId}`;
    } else if (type === 'room' && roomId) {
      sourceDescription = `ルームID: ${roomId}`;
    } else {
      sourceDescription = '個人チャット';
    }

    return `送信者ID: ${userId}
送信元: ${sourceDescription}
送信日時: ${formattedTimestamp}
メッセージタイプ: テキスト

メッセージ内容:
${text}

---
保存日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
保存場所: ローカルファイルシステム`;
  }

  generateTextFileName(timestamp, sourceInfo) {
    const { type, groupId, roomId } = sourceInfo;
    
    const formattedDate = timestamp.toISOString()
      .replace(/[:.]/g, '-')
      .split('T')
      .join('_')
      .split('.')[0];
    
    let prefix = 'LINE_text';
    if (type === 'group' && groupId) {
      prefix = `LINE_group_text`;
    } else if (type === 'room' && roomId) {
      prefix = `LINE_room_text`;
    }
    
    return `${prefix}_${formattedDate}.txt`;
  }

  generateFileName(message, timestamp, sourceInfo) {
    const { type, groupId, roomId } = sourceInfo;
    
    const formattedDate = timestamp.toISOString()
      .replace(/[:.]/g, '-')
      .split('T')
      .join('_')
      .split('.')[0];

    let extension = '';
    switch (message.type) {
      case 'image':
        extension = '.jpg';
        break;
      case 'video':
        extension = '.mp4';
        break;
      case 'audio':
        extension = '.m4a';
        break;
      case 'file':
        extension = message.fileName ? 
          '.' + message.fileName.split('.').pop() : '.bin';
        break;
      default:
        extension = '.bin';
    }

    let prefix = `LINE_${message.type}`;
    if (type === 'group' && groupId) {
      prefix = `LINE_group_${message.type}`;
    } else if (type === 'room' && roomId) {
      prefix = `LINE_room_${message.type}`;
    }

    // If original filename exists, use it as base name
    const baseName = message.fileName || `${prefix}_${formattedDate}`;
    const nameWithoutExt = baseName.includes('.') ? 
      baseName.split('.').slice(0, -1).join('.') : baseName;
    
    return `${nameWithoutExt}_${formattedDate}${extension}`;
  }

  getMimeType(message) {
    switch (message.type) {
      case 'image':
        return 'image/jpeg';
      case 'video':
        return 'video/mp4';
      case 'audio':
        return 'audio/mp4';
      case 'file':
        if (message.fileName) {
          return mime.lookup(message.fileName) || 'application/octet-stream';
        }
        return 'application/octet-stream';
      default:
        return 'application/octet-stream';
    }
  }
}

module.exports = new GroupMessageHandler();