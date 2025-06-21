const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const config = require('./config/config');
const logger = require('./utils/logger');
const webhookController = require('./controllers/webhookController');

const app = express();

const lineConfig = {
  channelAccessToken: config.line.accessToken,
  channelSecret: config.line.channelSecret,
};

if (!fs.existsSync('./logs')) {
  fs.mkdirSync('./logs', { recursive: true });
}

app.use('/webhook', line.middleware(lineConfig), webhookController.handleWebhook);

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'LINE-GoogleDrive Integration'
  });
});

app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'LINE to Google Drive Integration Service',
    version: '1.0.0',
    endpoints: {
      webhook: '/webhook',
      health: '/health'
    }
  });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', { 
    error: err.message, 
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

app.use((req, res) => {
  logger.warn('Route not found:', { 
    url: req.url, 
    method: req.method,
    ip: req.ip
  });
  
  res.status(404).json({ 
    error: 'Route not found',
    timestamp: new Date().toISOString()
  });
});

const validateEnvironmentVariables = () => {
  const requiredVars = [
    'LINE_CHANNEL_SECRET',
    'LINE_ACCESS_TOKEN',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_DRIVE_FOLDER_ID'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    logger.error('Missing required environment variables:', { 
      missingVars 
    });
    process.exit(1);
  }
};

const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

validateEnvironmentVariables();

const server = app.listen(config.server.port, () => {
  logger.info('Server started:', { 
    port: config.server.port,
    nodeEnv: config.server.nodeEnv,
    timestamp: new Date().toISOString()
  });
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { 
    error: error.message, 
    stack: error.stack 
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', { 
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined
  });
  process.exit(1);
});

module.exports = app;