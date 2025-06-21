const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class LocalStorageService {
  constructor() {
    this.baseDir = path.join(process.cwd(), 'saved_messages');
    this.ensureBaseDirectory();
  }

  ensureBaseDirectory() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
      logger.info('Created base directory:', { baseDir: this.baseDir });
    }
  }

  createDateBasedFolders(date) {
    try {
      const year = date.getFullYear().toString();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      const yearDir = path.join(this.baseDir, year);
      const monthDir = path.join(yearDir, month);
      const dayDir = path.join(monthDir, day);
      const textsDir = path.join(dayDir, 'texts');
      const filesDir = path.join(dayDir, 'files');

      // Create directories if they don't exist
      [yearDir, monthDir, dayDir, textsDir, filesDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });

      logger.info('Date-based folders created:', { 
        date: date.toISOString().split('T')[0],
        textsDir,
        filesDir 
      });

      return {
        textsDir,
        filesDir,
      };
    } catch (error) {
      logger.error('Error creating date-based folders:', { 
        error: error.message, 
        date: date.toISOString() 
      });
      throw error;
    }
  }

  saveTextFile(content, fileName, directory) {
    try {
      const filePath = path.join(directory, fileName);
      fs.writeFileSync(filePath, content, 'utf8');
      
      logger.info('Text file saved:', { 
        fileName,
        filePath,
        size: content.length 
      });

      return filePath;
    } catch (error) {
      logger.error('Error saving text file:', { 
        error: error.message, 
        fileName,
        directory 
      });
      throw error;
    }
  }

  async saveFileFromStream(fileStream, fileName, directory) {
    try {
      const filePath = path.join(directory, fileName);
      const writeStream = fs.createWriteStream(filePath);
      
      return new Promise((resolve, reject) => {
        fileStream.pipe(writeStream);
        
        writeStream.on('finish', () => {
          const stats = fs.statSync(filePath);
          logger.info('File saved:', { 
            fileName,
            filePath,
            size: stats.size 
          });
          resolve(filePath);
        });
        
        writeStream.on('error', (error) => {
          logger.error('Error saving file:', { 
            error: error.message, 
            fileName,
            directory 
          });
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Error setting up file save:', { 
        error: error.message, 
        fileName,
        directory 
      });
      throw error;
    }
  }

  generateUniqueFileName(originalName) {
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

  getStorageInfo() {
    try {
      const stats = this.getDirectoryStats(this.baseDir);
      return {
        baseDirectory: this.baseDir,
        totalFiles: stats.fileCount,
        totalSize: stats.totalSize,
        lastModified: stats.lastModified
      };
    } catch (error) {
      logger.error('Error getting storage info:', { error: error.message });
      return {
        baseDirectory: this.baseDir,
        totalFiles: 0,
        totalSize: 0,
        error: error.message
      };
    }
  }

  getDirectoryStats(directory) {
    let fileCount = 0;
    let totalSize = 0;
    let lastModified = null;

    if (!fs.existsSync(directory)) {
      return { fileCount, totalSize, lastModified };
    }

    const scan = (dir) => {
      const items = fs.readdirSync(dir);
      
      items.forEach(item => {
        const itemPath = path.join(dir, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          scan(itemPath);
        } else {
          fileCount++;
          totalSize += stats.size;
          if (!lastModified || stats.mtime > lastModified) {
            lastModified = stats.mtime;
          }
        }
      });
    };

    scan(directory);
    return { fileCount, totalSize, lastModified };
  }
}

module.exports = new LocalStorageService();