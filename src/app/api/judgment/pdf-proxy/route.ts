import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@/lib/supabase/server'
import { b2Client, BUCKET } from '@/lib/b2-client'

// GET handler: fetches a signed B2 PDF server-side and streams it back from the app origin to avoid CORS issues.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')

  if (!itemId) {
    return new NextResponse('Missing itemId', { status: 400 })
  }

  // Reads the stored PDF object key for the requested structure item.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('structure_items')
    .select('pdf_url')
    .eq('id', itemId)
    .single()

  if (error || !data?.pdf_url) {
    return new NextResponse('No PDF found', { status: 404 })
  }

  // Generates a short-lived B2 signed URL and immediately fetches the file from storage.
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: data.pdf_url })
    const b2SignedUrl = await getSignedUrl(b2Client, command, { expiresIn: 300 })

    const b2Res = await fetch(b2SignedUrl)
    if (!b2Res.ok) {
      return new NextResponse('Failed to fetch PDF from storage', { status: 502 })
    }

    // Stream the PDF back to the browser — same origin, no CORS issue
    // Streams the PDF back to the browser from the same origin with cache-friendly headers.
    const headers: Record<string, string> = {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'public, s-maxage=2592000, stale-while-revalidate=86400',
      'Content-Disposition': 'inline',
    }
    const contentLength = b2Res.headers.get('Content-Length')
    if (contentLength) headers['Content-Length'] = contentLength

    return new NextResponse(b2Res.body, { headers })
  } catch (err: any) {
    console.error('PDF proxy error:', err)
    return new NextResponse('Storage error: ' + err.message, { status: 500 })
  }
}
