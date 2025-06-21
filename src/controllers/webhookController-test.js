const line = require('@line/bot-sdk');
const config = require('../config/config');
const logger = require('../utils/logger');

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
    userId: event.source?.userId,
    timestamp: event.timestamp
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
      logger.info('Text message received:', {
        userId,
        text: message.text,
        timestamp: timestamp.toISOString()
      });
      console.log(`📝 テキストメッセージ受信:
      送信者: ${userId}
      内容: ${message.text}
      時刻: ${timestamp.toLocaleString('ja-JP')}`);
      break;
      
    case 'image':
    case 'video':
    case 'audio':
    case 'file':
      logger.info('File message received:', {
        userId,
        messageType: message.type,
        messageId: message.id,
        timestamp: timestamp.toISOString()
      });
      console.log(`📎 ファイルメッセージ受信:
      送信者: ${userId}
      タイプ: ${message.type}
      メッセージID: ${message.id}
      時刻: ${timestamp.toLocaleString('ja-JP')}`);
      break;
      
    default:
      logger.info('Unsupported message type:', { type: message.type });
      break;
  }
};

module.exports = {
  handleWebhook,
};