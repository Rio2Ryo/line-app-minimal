/**
 * 最後に受信したUSER IDを取得するための一時的なエンドポイント
 * USER ID確認後は削除してください
 */

let lastUserId = null;
let lastMessageTime = null;
let lastMessageText = null;

export function recordUserId(userId, messageText) {
  lastUserId = userId;
  lastMessageTime = new Date().toISOString();
  lastMessageText = messageText;
  console.log(`[USER ID記録] ${userId} - ${messageText}`);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  if (!lastUserId) {
    return res.status(200).json({
      message: 'まだメッセージを受信していません',
      instruction: 'LINEでメッセージを送信してから、再度このURLにアクセスしてください',
      url: req.headers.host + req.url
    });
  }
  
  return res.status(200).json({
    message: '最後に受信したメッセージ情報',
    userId: lastUserId,
    messageTime: lastMessageTime,
    messageText: lastMessageText ? lastMessageText.substring(0, 50) : null,
    instruction: 'このUSER IDをDEV_USER_IDS環境変数に設定してください'
  });
}