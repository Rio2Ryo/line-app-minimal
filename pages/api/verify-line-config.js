const crypto = require('crypto');

// LINE Signature検証テスト
function testSignatureValidation(body, signature, channelSecret) {
  try {
    const hash = crypto
      .createHmac('SHA256', channelSecret)
      .update(body, 'utf8')
      .digest('base64');
    
    console.log('署名検証テスト:');
    console.log('- 期待される署名:', hash);
    console.log('- 受信した署名:', signature);
    console.log('- 一致:', hash === signature);
    
    return hash === signature;
  } catch (error) {
    console.error('署名検証エラー:', error);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 環境変数確認
    const config = {
      channelSecret: process.env.LINE_CHANNEL_SECRET,
      accessToken: process.env.LINE_ACCESS_TOKEN,
      hasChannelSecret: !!process.env.LINE_CHANNEL_SECRET,
      hasAccessToken: !!process.env.LINE_ACCESS_TOKEN,
      channelSecretLength: process.env.LINE_CHANNEL_SECRET?.length,
      accessTokenLength: process.env.LINE_ACCESS_TOKEN?.length,
    };

    // テスト用のボディとシグネチャ
    const testBody = JSON.stringify({
      events: [{
        type: 'message',
        message: { type: 'text', text: 'test' },
        source: { type: 'user', userId: 'test' },
        timestamp: Date.now()
      }]
    });

    // 正しい署名を生成
    const correctSignature = crypto
      .createHmac('SHA256', config.channelSecret)
      .update(testBody, 'utf8')
      .digest('base64');

    // 署名検証テスト
    const isValid = testSignatureValidation(testBody, correctSignature, config.channelSecret);

    return res.status(200).json({
      status: 'success',
      config: config,
      test: {
        body: testBody,
        correctSignature: correctSignature,
        validationResult: isValid
      },
      webhookUrl: 'https://line-app-minimal-ihb4.vercel.app/api/webhook',
      recommendations: [
        'LINE Developersコンソールでwebhook URLが正しく設定されているか確認',
        'Channel Secretが正しく設定されているか確認',
        'Webhook送信がオンになっているか確認'
      ],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}