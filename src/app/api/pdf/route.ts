import { NextRequest, NextResponse } from 'next/server'

// Proxies a PDF from Google Drive (or any URL) to bypass browser CORS restrictions.
// Usage: /api/pdf?url=https://drive.google.com/...
//        /api/pdf?id=GOOGLE_DRIVE_FILE_ID

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const fileId = searchParams.get('id')
  const rawUrl = searchParams.get('url')

  let fetchUrl: string

  if (fileId) {
    // Google Drive direct download URL
    fetchUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`
  } else if (rawUrl) {
    fetchUrl = rawUrl
  } else {
    return NextResponse.json({ error: 'Missing id or url param' }, { status: 400 })
  }

  try {
    const res = await fetch(fetchUrl, {
      headers: {
        // Mimic a browser to avoid Google's bot detection
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream fetch failed: ${res.status}` },
        { status: 502 }
      )
    }

    const contentType = res.headers.get('content-type') || 'application/pdf'
    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.byteLength.toString(),
        // Cache for 1 hour on CDN/browser — PDFs don't change
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        // Allow pdfjs to load this from any origin
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
