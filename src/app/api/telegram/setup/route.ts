import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/telegram/setup
 * One-time webhook registration. Call this once after deployment.
 * Protected by a secret key: ?key=TELEGRAM_SETUP_KEY
 */
// GET handler: registers the Telegram bot webhook against this deployment after verifying the setup secret.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!key || key !== process.env.TELEGRAM_SETUP_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!token || !siteUrl) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN or NEXT_PUBLIC_SITE_URL not set' }, { status: 500 })
  }

  const webhookUrl = `${siteUrl}/api/telegram/webhook`
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  const body: Record<string, unknown> = { url: webhookUrl, allowed_updates: ['message', 'callback_query'] }
  if (webhookSecret) body.secret_token = webhookSecret

  // Calls Telegram's setWebhook endpoint so message and callback updates hit this app's webhook route.
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()

  return NextResponse.json({
    ok: data.ok,
    description: data.description,
    webhookUrl,
  })
}
