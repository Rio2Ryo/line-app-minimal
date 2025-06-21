const line = require('@line/bot-sdk');
const config = require('../config/config');
const logger = require('../utils/logger');
const googleDriveService = require('../services/googleDriveService');
const messageHandler = require('../services/messageHandler');

const client = new line.Client({
  channelAccessToken: config.line.accessToken,
});

const handleWebhook = async (req, res) => {
  try {
    const events = req.body.events;
    
    if (!events || events.length === 0) {
      logger.info('No events received');
      return res.status(200).json({ message: 'No events to process' });
    }

    const promises = events.map(async (event) => {
      try {
        await processEvent(event);
      } catch (error) {
        logger.error('Error processing event:', { 
          error: error.message, 
          eventType: event.type,
          userId: event.source?.userId 
        });
      }
    });

    await Promise.allSettled(promises);
    res.status(200).json({ message: 'Events processed' });

  } catch (error) {
    logger.error('Webhook handling error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const processEvent = async (event) => {
  logger.info('Processing event:', { 
    type: event.type, 
    userId: event.source?.userId 
  });

  if (event.type !== 'message') {
    logger.info('Ignoring non-message event:', { type: event.type });
    return;
  }

  const message = event.message;
  const userId = event.source.userId;
  const timestamp = new Date(event.timestamp);

  switch (message.type) {
    case 'text':
      await messageHandler.handleTextMessage(message, userId, timestamp);
      break;
    case 'image':
    case 'video':
    case 'audio':
    case 'file':
      await messageHandler.handleFileMessage(message, userId, timestamp, client);
      break;
    default:
      logger.info('Unsupported message type:', { type: message.type });
      break;
  }
};

module.exports = {
  handleWebhook,
};