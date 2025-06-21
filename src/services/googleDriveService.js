const { google } = require('googleapis');
const config = require('../config/config');
const logger = require('../utils/logger');

class GoogleDriveService {
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

      logger.info('Folder created:', { 
        folderId: response.data.id, 
        folderName: response.data.name 
      });

      return response.data.id;
    } catch (error) {
      logger.error('Error creating folder:', { error: error.message, folderName: name });
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
      logger.error('Error finding folder:', { error: error.message, folderName: name });
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
      logger.error('Error ensuring folder exists:', { error: error.message, folderName: name });
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

      return {
        textsFolderId,
        filesFolderId,
      };
    } catch (error) {
      logger.error('Error creating date-based folders:', { error: error.message, date: date.toISOString() });
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
        fields: 'id,name',
      });

      logger.info('Text file uploaded:', { 
        fileId: response.data.id, 
        fileName: response.data.name 
      });

      return response.data.id;
    } catch (error) {
      logger.error('Error uploading text file:', { error: error.message, fileName });
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
        fields: 'id,name,size',
      });

      logger.info('File uploaded:', { 
        fileId: response.data.id, 
        fileName: response.data.name,
        fileSize: response.data.size 
      });

      return response.data.id;
    } catch (error) {
      logger.error('Error uploading file:', { error: error.message, fileName });
      throw error;
    }
  }

  async generateUniqueFileName(originalName, folderId) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const extension = originalName.includes('.') ? originalName.split('.').pop() : '';
      const baseName = originalName.includes('.') ? originalName.split('.').slice(0, -1).join('.') : originalName;
      
      return extension ? `${baseName}_${timestamp}.${extension}` : `${baseName}_${timestamp}`;
    } catch (error) {
      logger.error('Error generating unique filename:', { error: error.message, originalName });
      return `${originalName}_${Date.now()}`;
    }
  }
}

module.exports = new GoogleDriveService();