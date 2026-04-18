import { NextRequest, NextResponse } from 'next/server'
import { fetchQuery } from 'convex/nextjs'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { b2Client, BUCKET } from '@/lib/b2-client'

// GET handler: fetches a signed B2 PDF server-side and streams it back from the app origin to avoid CORS issues.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')

  if (!itemId) {
    return new NextResponse('Missing itemId', { status: 400 })
  }

  try {
    const item = await fetchQuery(api.content.getStructureItem, {
      itemId: itemId as Id<'structure_items'>,
    })

    if (!item?.pdf_url) {
      return new NextResponse('No PDF found', { status: 404 })
    }

    // Generate a temporary signed URL from B2 (valid for 1 hour)
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: item.pdf_url })
    const signedUrl = await getSignedUrl(b2Client, command, { expiresIn: 3600 })

    const pdfRes = await fetch(signedUrl)
    if (!pdfRes.ok) {
      return new NextResponse('Failed to fetch PDF from B2 storage', { status: 502 })
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'public, s-maxage=2592000, stale-while-revalidate=86400',
      'Content-Disposition': 'inline',
    }
    const contentLength = pdfRes.headers.get('Content-Length')
    if (contentLength) headers['Content-Length'] = contentLength

    return new NextResponse(pdfRes.body, { headers })
  } catch (err: any) {
    console.error('PDF proxy error:', err)
    return new NextResponse('Error: ' + err.message, { status: 500 })
  }
}
