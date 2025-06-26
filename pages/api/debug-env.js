export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 環境変数の存在確認（値は表示しない）
  const envCheck = {
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN: !!process.env.GOOGLE_REFRESH_TOKEN,
    GOOGLE_DRIVE_FOLDER_ID: !!process.env.GOOGLE_DRIVE_FOLDER_ID,
    LINE_CHANNEL_SECRET: !!process.env.LINE_CHANNEL_SECRET,
    LINE_ACCESS_TOKEN: !!process.env.LINE_ACCESS_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };

  // 一部だけ表示（セキュリティのため最初の数文字のみ）
  const partialValues = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.substring(0, 10) + '...' : 'undefined',
    LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET ? process.env.LINE_CHANNEL_SECRET.substring(0, 8) + '...' : 'undefined',
  };

  return res.status(200).json({
    environmentVariables: envCheck,
    partialValues: partialValues,
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV
  });
}