import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { b2Client, BUCKET } from '@/lib/b2-client'
import { fetchMutation } from 'convex/nextjs'
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server'
import { api } from '@convex/_generated/api'


export async function POST(req: NextRequest) {
  const token = await convexAuthNextjsToken()
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const caseId = formData.get('caseId') as string | null

  if (!file || !caseId) {
    return NextResponse.json({ error: 'Missing file or caseId' }, { status: 400 })
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
  }

  const MAX_PDF_BYTES = 50 * 1024 * 1024
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 413 })
  }

  try {
    const objectKey = `judgments/${caseId}-${Date.now()}.pdf`
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      Body: buffer,
      ContentType: file.type,
    })

    await b2Client.send(uploadCommand)

    await fetchMutation(
      api.adminMutations.updateEntity as any,
      {
        entityType: 'structure_item',
        id: caseId,
        data: { pdf_url: objectKey }
      },
      { token }
    )

    return NextResponse.json({ success: true, objectKey, signedUrl: null })
  } catch (err: any) {
    console.error('B2 upload error:', err)
    return NextResponse.json(
      { error: err?.message || 'Upload failed. Please try again.' },
      { status: 500 }
    )
  }
}
