// リアルタイムでWebhookリクエストを監視
let requestLog = [];
const MAX_REQUESTS = 20;

// グローバルにリクエストを記録する関数
function logRequest(req, body, result) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    headers: {
      'user-agent': req.headers['user-agent'],
      'x-line-signature': req.headers['x-line-signature'] ? 'YES' : 'NO',
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    },
    ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
    bodyLength: body ? body.length : 0,
    events: body ? (JSON.parse(body).events?.length || 0) : 0,
    result: result,
    isFromLINE: req.headers['user-agent']?.includes('LineBotWebhook') || false
  };
  
  requestLog.unshift(logEntry);
  if (requestLog.length > MAX_REQUESTS) {
    requestLog = requestLog.slice(0, MAX_REQUESTS);
  }
}

// グローバルに設定
global.logWebhookRequest = logRequest;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const now = new Date().toISOString();
    const lineRequests = requestLog.filter(r => r.isFromLINE);
    const recentRequests = requestLog.filter(r => 
      new Date(r.timestamp) > new Date(Date.now() - 5 * 60 * 1000) // 過去5分
    );
    
    return res.status(200).json({
      status: 'success',
      currentTime: now,
      totalRequests: requestLog.length,
      lineRequests: lineRequests.length,
      recentRequests: recentRequests.length,
      lastRequest: requestLog[0] || null,
      allRequests: requestLog,
      summary: {
        hasLineRequests: lineRequests.length > 0,
        lastLineRequest: lineRequests[0] || null,
        recentActivity: recentRequests.length > 0
      }
    });
  }
  
  if (req.method === 'DELETE') {
    requestLog = [];
    return res.status(200).json({
      status: 'success',
      message: 'ログをクリアしました',
      timestamp: new Date().toISOString()
    });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}