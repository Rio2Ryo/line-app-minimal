#!/bin/bash

echo "🔍 LINE USER ID確認ツール"
echo "=========================="
echo ""
echo "1. LINEアプリを開いてBotにメッセージを送信してください"
echo "2. 送信したら、Enterキーを押してください..."
read

echo ""
echo "Vercelのログを確認中..."

# 最新のFunction logsを確認
vercel --token ZEShsgL4HN6EPUtS0jnZdkwy logs https://line-app-minimal-p68mmxz2p-commongiftedtokyo.vercel.app 2>/dev/null | grep -i "user" | tail -5

echo ""
echo "もしUSER IDが表示されない場合："
echo "1. Vercelダッシュボードにアクセス: https://vercel.com/commongiftedtokyo/line-app-minimal"
echo "2. Functions タブ → api/webhook → Logs を確認"
echo "3. 'userId' または 'U' で始まる33文字の文字列を探す"
echo ""
echo "USER IDが見つかったら、以下のコマンドで環境変数を設定:"
echo "vercel env add DEV_USER_IDS"