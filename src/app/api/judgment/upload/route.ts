import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'
import { b2Client, BUCKET } from '@/lib/b2-client'
import { updateItemPdfUrl } from '@/actions/judgment/links'

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

  // Parse form data
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

  // Build object key
  const safeName = file.name.replace(/\s+/g, '-')
  const objectKey = `${caseId}/${safeName}`

  // Upload to B2
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
    return NextResponse.json({ error: 'Upload failed: ' + err.message }, { status: 500 })
  }

  // Save object key to Supabase
  try {
    await updateItemPdfUrl(caseId, objectKey)
  } catch (err: any) {
    console.error('Supabase update error:', err)
    return NextResponse.json({ error: 'DB update failed: ' + err.message }, { status: 500 })
  }

  // Generate a signed URL immediately so the client can display it right away
  let signedUrl: string | null = null
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: objectKey })
    signedUrl = await getSignedUrl(b2Client, command, { expiresIn: 86400 })
  } catch {
    // Non-fatal — client can fall back to the signed-url API
  }

  return NextResponse.json({ success: true, objectKey, signedUrl })
}
