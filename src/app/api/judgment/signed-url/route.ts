import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@/lib/supabase/server'
import { b2Client, BUCKET } from '@/lib/b2-client'

// GET handler: looks up an item's stored PDF object key and returns a temporary signed download URL.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')

  if (!itemId) {
    return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })
  }

  // Reads the stored B2 object key for this structure item from Supabase.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('structure_items')
    .select('pdf_url')
    .eq('id', itemId)
    .single()

  if (error || !data?.pdf_url) {
    return NextResponse.json({ url: null })
  }

  // Signs the B2 object for short-term client access and adds private caching headers.
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: data.pdf_url })
  const url = await getSignedUrl(b2Client, command, { expiresIn: 7200 })  // 2 hours — reduced from 24h for security

  return NextResponse.json({ url }, {
    headers: { 'Cache-Control': 'private, max-age=3600' },
  })
}
