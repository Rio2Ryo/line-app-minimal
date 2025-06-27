// コンソールログをキャプチャして表示するデバッグエンドポイント
let consoleMessages = [];
const MAX_MESSAGES = 100;

// console.logを上書きしてログをキャプチャ
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(...args) {
  const message = {
    timestamp: new Date().toISOString(),
    type: 'log',
    message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ')
  };
  
  consoleMessages.unshift(message);
  if (consoleMessages.length > MAX_MESSAGES) {
    consoleMessages = consoleMessages.slice(0, MAX_MESSAGES);
  }
  
  originalConsoleLog.apply(console, args);
};

console.error = function(...args) {
  const message = {
    timestamp: new Date().toISOString(),
    type: 'error',
    message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ')
  };
  
  consoleMessages.unshift(message);
  if (consoleMessages.length > MAX_MESSAGES) {
    consoleMessages = consoleMessages.slice(0, MAX_MESSAGES);
  }
  
  originalConsoleError.apply(console, args);
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const recentMessages = consoleMessages.filter(msg => 
      new Date(msg.timestamp) > new Date(Date.now() - 10 * 60 * 1000) // 過去10分
    );
    
    const errorMessages = consoleMessages.filter(msg => msg.type === 'error');
    const driveMessages = consoleMessages.filter(msg => 
      msg.message.includes('Google Drive') || 
      msg.message.includes('ドライブ') ||
      msg.message.includes('フォルダ') ||
      msg.message.includes('Docs')
    );
    
    return res.status(200).json({
      status: 'success',
      totalMessages: consoleMessages.length,
      recentMessages: recentMessages.length,
      errorMessages: errorMessages.length,
      driveMessages: driveMessages.length,
      messages: {
        recent: recentMessages.slice(0, 20),
        errors: errorMessages.slice(0, 10),
        drive: driveMessages.slice(0, 15),
        all: consoleMessages.slice(0, 30)
      },
      timestamp: new Date().toISOString()
    });
  }
  
  if (req.method === 'DELETE') {
    consoleMessages = [];
    return res.status(200).json({
      status: 'success',
      message: 'コンソールログをクリアしました',
      timestamp: new Date().toISOString()
    });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}