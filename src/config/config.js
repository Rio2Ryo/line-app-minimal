require('dotenv').config();

const config = {
  line: {
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    accessToken: process.env.LINE_ACCESS_TOKEN,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
  },
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },
};

module.exports = config;