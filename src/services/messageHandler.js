const axios = require('axios');
const mime = require('mime-types');
const logger = require('../utils/logger');
const googleDriveService = require('./googleDriveService');

class MessageHandler {
  async handleTextMessage(message, userId, timestamp) {
    try {
      logger.info('Processing text message:', { 
        userId, 
        messageLength: message.text.length 
      });

      const folders = await googleDriveService.createDateBasedFolders(timestamp);
      
      const textContent = this.formatTextMessage(message.text, userId, timestamp);
      const fileName = this.generateTextFileName(timestamp);
      
      await googleDriveService.uploadTextFile(
        textContent, 
        fileName, 
        folders.textsFolderId
      );

      logger.info('Text message saved successfully:', { 
        userId, 
        fileName,
        timestamp: timestamp.toISOString()
      });

    } catch (error) {
      logger.error('Error handling text message:', { 
        error: error.message, 
        userId,
        stack: error.stack 
      });
      throw error;
    }
  }

  async handleFileMessage(message, userId, timestamp, lineClient) {
    try {
      logger.info('Processing file message:', { 
        userId, 
        messageType: message.type,
        messageId: message.id 
      });

      const fileStream = await this.downloadFileFromLine(message.id, lineClient);
      const folders = await googleDriveService.createDateBasedFolders(timestamp);
      
      const fileName = await this.generateFileName(message, timestamp);
      const mimeType = this.getMimeType(message);
      
      await googleDriveService.uploadFile(
        fileStream, 
        fileName, 
        mimeType, 
        folders.filesFolderId
      );

      logger.info('File message saved successfully:', { 
        userId, 
        fileName,
        messageType: message.type,
        timestamp: timestamp.toISOString()
      });

    } catch (error) {
      logger.error('Error handling file message:', { 
        error: error.message, 
        userId,
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

  formatTextMessage(text, userId, timestamp) {
    const formattedTimestamp = timestamp.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return `送信者ID: ${userId}
送信日時: ${formattedTimestamp}
メッセージタイプ: テキスト

メッセージ内容:
${text}

---
保存日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`;
  }

  generateTextFileName(timestamp) {
    const formattedDate = timestamp.toISOString()
      .replace(/[:.]/g, '-')
      .split('T')
      .join('_')
      .split('.')[0];
    
    return `LINE_text_${formattedDate}.txt`;
  }

  async generateFileName(message, timestamp) {
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

    const baseName = message.fileName || `LINE_${message.type}_${formattedDate}`;
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

module.exports = new MessageHandler();