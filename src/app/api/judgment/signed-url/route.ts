import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { b2Client, BUCKET } from '@/lib/b2-client'
import { fetchQuery } from 'convex/nextjs'
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server'
import { api } from '@convex/_generated/api'

// GET handler: looks up an item's stored PDF object key from Convex and returns a signed B2 URL.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')

  if (!itemId) {
    return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })
  }

  const token = await convexAuthNextjsToken()

  // Read the B2 PDF key from Convex
  const data = await fetchQuery(
    api.adminQueries.getEntity as any,
    { entityType: 'structure_item', id: itemId },
    token ? { token } : undefined
  )

  if (!data || !data.pdf_url) {
    return NextResponse.json({ url: null })
  }

  // Generate a B2 signed URL
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: data.pdf_url })
  const url = await getSignedUrl(b2Client, command, { expiresIn: 7200 })

  return NextResponse.json({ url }, {
    headers: { 'Cache-Control': 'private, max-age=3600' },
  })
}
