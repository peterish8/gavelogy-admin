import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@/lib/supabase/server'
import { b2Client, BUCKET } from '@/lib/b2-client'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')

  if (!itemId) {
    return new NextResponse('Missing itemId', { status: 400 })
  }

  // Get the stored object key from DB
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('structure_items')
    .select('pdf_url')
    .eq('id', itemId)
    .single()

  if (error || !data?.pdf_url) {
    return new NextResponse('No PDF found', { status: 404 })
  }

  // Generate a short-lived signed URL server-side and fetch from B2
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: data.pdf_url })
    const b2SignedUrl = await getSignedUrl(b2Client, command, { expiresIn: 300 })

    const b2Res = await fetch(b2SignedUrl)
    if (!b2Res.ok) {
      return new NextResponse('Failed to fetch PDF from storage', { status: 502 })
    }

    // Stream the PDF back to the browser — same origin, no CORS issue
    return new NextResponse(b2Res.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err: any) {
    console.error('PDF proxy error:', err)
    return new NextResponse('Storage error: ' + err.message, { status: 500 })
  }
}
