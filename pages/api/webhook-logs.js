// Webhook ログ確認用のエンドポイント
let webhookLogs = [];
const MAX_LOGS = 50;

function addLog(type, message, data = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type,
    message,
    data: data ? JSON.stringify(data, null, 2) : null
  };
  
  webhookLogs.unshift(logEntry);
  if (webhookLogs.length > MAX_LOGS) {
    webhookLogs = webhookLogs.slice(0, MAX_LOGS);
  }
  
  console.log(`[WEBHOOK-LOG] ${type}: ${message}`, data || '');
}

// ログを記録する関数をエクスポート
global.addWebhookLog = addLog;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'success',
      totalLogs: webhookLogs.length,
      logs: webhookLogs,
      timestamp: new Date().toISOString()
    });
  }
  
  if (req.method === 'DELETE') {
    webhookLogs = [];
    return res.status(200).json({
      status: 'success',
      message: 'ログをクリアしました',
      timestamp: new Date().toISOString()
    });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}