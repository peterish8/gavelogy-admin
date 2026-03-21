import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@/lib/supabase/server'
import { b2Client, BUCKET } from '@/lib/b2-client'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')

  if (!itemId) {
    return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('structure_items')
    .select('pdf_url')
    .eq('id', itemId)
    .single()

  if (error || !data?.pdf_url) {
    return NextResponse.json({ url: null })
  }

  const command = new GetObjectCommand({ Bucket: BUCKET, Key: data.pdf_url })
  const url = await getSignedUrl(b2Client, command, { expiresIn: 86400 })

  return NextResponse.json({ url })
}
