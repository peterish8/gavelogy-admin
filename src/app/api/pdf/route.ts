import { NextRequest, NextResponse } from 'next/server'

// Proxies a PDF from Google Drive (or any URL) to bypass browser CORS restrictions.
// Usage: /api/pdf?url=https://drive.google.com/...
//        /api/pdf?id=GOOGLE_DRIVE_FILE_ID

// ── Security: allowlist of hostnames that can be proxied ────────────────────
// SSRF protection: only permit known, safe domains.
// To add a new domain, add it here explicitly — never allow arbitrary URLs.
const ALLOWED_PROXY_HOSTS = new Set([
  'drive.google.com',
  'docs.google.com',
  'lh3.googleusercontent.com',
  'drive.usercontent.google.com',
])

// GET handler: proxies PDFs from allowlisted domains only.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const fileId = searchParams.get('id')
  const rawUrl = searchParams.get('url')

  let fetchUrl: string

  if (fileId) {
    // Google Drive file ID — construct the URL ourselves (safe, no user-controlled hostname)
    fetchUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`
  } else if (rawUrl) {
    // Raw URL — MUST be validated against the allowlist before use
    let parsed: URL
    try {
      parsed = new URL(rawUrl)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    // Block non-HTTPS and non-allowlisted hosts (SSRF protection)
    if (parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only HTTPS URLs are allowed' }, { status: 403 })
    }
    if (!ALLOWED_PROXY_HOSTS.has(parsed.hostname)) {
      return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 })
    }

    fetchUrl = rawUrl
  } else {
    return NextResponse.json({ error: 'Missing id or url param' }, { status: 400 })
  }

  try {
    // Fetches the upstream PDF with browser-like headers because Google can block bot-style requests.
    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Could not fetch PDF' }, { status: 502 })
    }

    const contentType = res.headers.get('content-type') || 'application/pdf'
    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    console.error('[api/pdf] Proxy error:', err)
    return NextResponse.json({ error: 'PDF proxy error' }, { status: 500 })
  }
}
