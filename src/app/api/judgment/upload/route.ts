import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'
import { b2Client, BUCKET } from '@/lib/b2-client'
import { updateItemPdfUrl } from '@/actions/judgment/links'

// POST handler: verifies admin auth, uploads a PDF to Backblaze B2, stores the object key, and returns a signed URL.
export async function POST(req: NextRequest) {
  // Verify the request comes from an authenticated admin
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify the token with the anon client
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check is_admin via service role client (bypasses RLS)
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: userData } = await serviceClient
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!userData?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parses the multipart form body containing the uploaded PDF and target case/item ID.
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

  // Security: reject oversized files before buffering into RAM (§2 File Upload Validation)
  const MAX_PDF_BYTES = 50 * 1024 * 1024  // 50MB
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 413 })
  }

  // Builds a stable object-storage key under the case/item folder using a sanitized filename.
  const safeName = file.name.replace(/\s+/g, '-')
  const objectKey = `${caseId}/${safeName}`

  // Uploads the PDF bytes to Backblaze B2 using the shared S3-compatible client.
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    await b2Client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      Body: buffer,
      ContentType: 'application/pdf',
    }))
  } catch (err: any) {
    console.error('B2 upload error:', err)
    // §8: Don't expose internal error details to client
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  // Persists the uploaded object key onto the owning structure item for future lookup.
  try {
    await updateItemPdfUrl(caseId, objectKey)
  } catch (err: any) {
    console.error('Supabase update error:', err)
    return NextResponse.json({ error: 'Failed to update record. Please try again.' }, { status: 500 })
  }

  // Generates an immediate signed URL so the client can preview the uploaded PDF without another round-trip.
  let signedUrl: string | null = null
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: objectKey })
    signedUrl = await getSignedUrl(b2Client, command, { expiresIn: 7200 })  // 2 hours max
  } catch {
    // Non-fatal — client can fall back to the signed-url API
  }

  return NextResponse.json({ success: true, objectKey, signedUrl })
}
