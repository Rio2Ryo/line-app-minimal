const { google } = require('googleapis');
const config = require('../config/config');
const logger = require('../utils/logger');

class GoogleDriveServiceOAuth {
  constructor() {
    this.auth = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret
    );
    
    this.auth.setCredentials({
      refresh_token: config.google.refreshToken,
    });

    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }

  async createFolder(name, parentId = null) {
    try {
      const folderMetadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : [config.google.driveFolderId],
      };

      const response = await this.drive.files.create({
        resource: folderMetadata,
        fields: 'id,name',
      });

      logger.info('Google Drive folder created:', { 
        folderId: response.data.id, 
        folderName: response.data.name 
      });

      return response.data.id;
    } catch (error) {
      logger.error('Error creating Google Drive folder:', { 
        error: error.message, 
        folderName: name 
      });
      throw error;
    }
  }

  async findFolder(name, parentId = null) {
    try {
      const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and parents in '${parentId || config.google.driveFolderId}' and trashed=false`;
      
      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name)',
      });

      if (response.data.files.length > 0) {
        return response.data.files[0].id;
      }

      return null;
    } catch (error) {
      logger.error('Error finding Google Drive folder:', { 
        error: error.message, 
        folderName: name 
      });
      throw error;
    }
  }

  async ensureFolderExists(name, parentId = null) {
    try {
      let folderId = await this.findFolder(name, parentId);
      
      if (!folderId) {
        folderId = await this.createFolder(name, parentId);
      }

      return folderId;
    } catch (error) {
      logger.error('Error ensuring Google Drive folder exists:', { 
        error: error.message, 
        folderName: name 
      });
      throw error;
    }
  }

  async createDateBasedFolders(date) {
    try {
      const year = date.getFullYear().toString();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      const yearFolderId = await this.ensureFolderExists(year);
      const monthFolderId = await this.ensureFolderExists(month, yearFolderId);
      const dayFolderId = await this.ensureFolderExists(day, monthFolderId);

      const textsFolderId = await this.ensureFolderExists('texts', dayFolderId);
      const filesFolderId = await this.ensureFolderExists('files', dayFolderId);

      logger.info('Google Drive date-based folders created:', {
        date: date.toISOString().split('T')[0],
        textsFolderId,
        filesFolderId
      });

      return {
        textsFolderId,
        filesFolderId,
      };
    } catch (error) {
      logger.error('Error creating Google Drive date-based folders:', { 
        error: error.message, 
        date: date.toISOString() 
      });
      throw error;
    }
  }

  async findTextFileGlobally(fileName) {
    try {
      // 日付フォルダに関係なく、メインフォルダ内でファイル名で検索
      const query = `name='${fileName}' and parents in '${config.google.driveFolderId}' and trashed=false`;
      
      logger.info('Searching for existing file globally:', {
        fileName,
        mainFolderId: config.google.driveFolderId,
        query
      });
      
      // まず、メインフォルダ直下を検索
      let response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name, parents)',
      });

      // メインフォルダ直下にない場合、子フォルダも検索
      if (response.data.files.length === 0) {
        const globalQuery = `name='${fileName}' and trashed=false`;
        response = await this.drive.files.list({
          q: globalQuery,
          fields: 'files(id, name, parents)',
        });
        
        // メインフォルダの子孫にあるファイルのみ対象
        response.data.files = response.data.files.filter(file => {
          // parentsが存在し、メインフォルダの下にあるかチェック
          return file.parents && file.parents.length > 0;
        });
      }

      logger.info('Global file search results:', {
        fileName,
        foundFiles: response.data.files.length,
        files: response.data.files.map(f => ({id: f.id, name: f.name, parents: f.parents}))
      });

      if (response.data.files.length > 0) {
        const foundFile = response.data.files[0];
        logger.info('Found existing file globally:', {
          fileId: foundFile.id,
          fileName: foundFile.name,
          parents: foundFile.parents
        });
        return foundFile.id;
      }

      logger.info('No existing file found globally, will create new file:', { fileName });
      return null;
    } catch (error) {
      logger.error('Error finding text file globally in Google Drive:', { 
        error: error.message, 
        fileName 
      });
      throw error;
    }
  }

  async findTextFile(fileName, folderId) {
    try {
      const query = `name='${fileName}' and parents in '${folderId}' and trashed=false`;
      
      logger.info('Searching for existing file:', {
        fileName,
        folderId,
        query
      });
      
      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name)',
      });

      logger.info('File search results:', {
        fileName,
        foundFiles: response.data.files.length,
        files: response.data.files
      });

      if (response.data.files.length > 0) {
        logger.info('Found existing file:', {
          fileId: response.data.files[0].id,
          fileName: response.data.files[0].name
        });
        return response.data.files[0].id;
      }

      logger.info('No existing file found, will create new file:', { fileName });
      return null;
    } catch (error) {
      logger.error('Error finding text file in Google Drive:', { 
        error: error.message, 
        fileName 
      });
      throw error;
    }
  }

  async getFileContent(fileId) {
    try {
      const response = await this.drive.files.get({
        fileId: fileId,
        alt: 'media',
      });

      return response.data;
    } catch (error) {
      logger.error('Error getting file content from Google Drive:', { 
        error: error.message, 
        fileId 
      });
      throw error;
    }
  }

  async updateFileContent(fileId, newContent) {
    try {
      const media = {
        mimeType: 'text/plain',
        body: newContent,
      };

      const response = await this.drive.files.update({
        fileId: fileId,
        media: media,
        fields: 'id,name,size,webViewLink',
      });

      logger.info('File content updated in Google Drive:', { 
        fileId: response.data.id, 
        fileName: response.data.name,
        size: newContent.length,
        webViewLink: response.data.webViewLink
      });

      return {
        fileId: response.data.id,
        fileName: response.data.name,
        webViewLink: response.data.webViewLink
      };
    } catch (error) {
      logger.error('Error updating file content in Google Drive:', { 
        error: error.message, 
        fileId 
      });
      throw error;
    }
  }

  async uploadOrAppendTextFile(content, fileName, folderId, messageText, timestamp) {
    try {
      // まずグローバル検索で既存ファイルを探す
      const existingFileId = await this.findTextFileGlobally(fileName);
      
      if (existingFileId) {
        // 既存ファイルに追記
        const existingContent = await this.getFileContent(existingFileId);
        const newEntry = `\n${timestamp}: ${messageText}`;
        const updatedContent = existingContent + newEntry;
        
        const result = await this.updateFileContent(existingFileId, updatedContent);
        
        logger.info('Text appended to existing Google Drive file:', {
          fileId: result.fileId,
          fileName: result.fileName,
          appendedText: messageText,
          timestamp: timestamp
        });
        
        return result;
      } else {
        // 新しいファイルを作成
        const fileMetadata = {
          name: fileName,
          parents: [folderId],
        };

        const media = {
          mimeType: 'text/plain',
          body: content,
        };

        const response = await this.drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: 'id,name,size,webViewLink',
        });

        logger.info('New text file created in Google Drive:', { 
          fileId: response.data.id, 
          fileName: response.data.name,
          size: content.length,
          webViewLink: response.data.webViewLink
        });

        return {
          fileId: response.data.id,
          fileName: response.data.name,
          webViewLink: response.data.webViewLink
        };
      }
    } catch (error) {
      logger.error('Error uploading/appending text file to Google Drive:', { 
        error: error.message, 
        fileName 
      });
      throw error;
    }
  }

  async uploadTextFile(content, fileName, folderId) {
    try {
      const fileMetadata = {
        name: fileName,
        parents: [folderId],
      };

      const media = {
        mimeType: 'text/plain',
        body: content,
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id,name,size,webViewLink',
      });

      logger.info('Text file uploaded to Google Drive:', { 
        fileId: response.data.id, 
        fileName: response.data.name,
        size: content.length,
        webViewLink: response.data.webViewLink
      });

      return {
        fileId: response.data.id,
        fileName: response.data.name,
        webViewLink: response.data.webViewLink
      };
    } catch (error) {
      logger.error('Error uploading text file to Google Drive:', { 
        error: error.message, 
        fileName 
      });
      throw error;
    }
  }

  async uploadFile(fileStream, fileName, mimeType, folderId) {
    try {
      const fileMetadata = {
        name: fileName,
        parents: [folderId],
      };

      const media = {
        mimeType: mimeType,
        body: fileStream,
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id,name,size,webViewLink',
      });

      logger.info('File uploaded to Google Drive:', { 
        fileId: response.data.id, 
        fileName: response.data.name,
        fileSize: response.data.size,
        webViewLink: response.data.webViewLink
      });

      return {
        fileId: response.data.id,
        fileName: response.data.name,
        fileSize: response.data.size,
        webViewLink: response.data.webViewLink
      };
    } catch (error) {
      logger.error('Error uploading file to Google Drive:', { 
        error: error.message, 
        fileName 
      });
      throw error;
    }
  }

  async generateUniqueFileName(originalName) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const extension = originalName.includes('.') ? originalName.split('.').pop() : '';
      const baseName = originalName.includes('.') ? 
        originalName.split('.').slice(0, -1).join('.') : originalName;
      
      return extension ? `${baseName}_${timestamp}.${extension}` : `${baseName}_${timestamp}`;
    } catch (error) {
      logger.error('Error generating unique filename:', { 
        error: error.message, 
        originalName 
      });
      return `${originalName}_${Date.now()}`;
    }
  }

  async testConnection() {
    try {
      const response = await this.drive.files.get({
        fileId: config.google.driveFolderId,
        fields: 'id,name,mimeType'
      });

      logger.info('Google Drive connection test successful:', {
        folderId: response.data.id,
        folderName: response.data.name
      });

      return {
        success: true,
        folderName: response.data.name,
        folderId: response.data.id
      };
    } catch (error) {
      logger.error('Google Drive connection test failed:', { 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = new GoogleDriveServiceOAuth();