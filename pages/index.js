import Head from 'next/head'

export default function Home() {
  return (
    <>
      <Head>
        <title>LINE Bot Webhook Service</title>
        <meta name="description" content="LINE Bot with Google Drive integration" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main>
        <h1>LINE Bot Webhook Service</h1>
        <p>Webhook endpoint: /api/webhook</p>
        <p>Status: Active</p>
      </main>
    </>
  )
}