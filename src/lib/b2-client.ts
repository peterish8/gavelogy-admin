import { S3Client } from '@aws-sdk/client-s3'

// Derives the B2 region string from the endpoint URL by stripping the S3 subdomain prefix and Backblaze domain.
const endpoint = process.env.BACKBLAZE_BUCKET_ENDPOINT ?? ''
const region = endpoint
  ? endpoint.replace('https://s3.', '').replace('.backblazeb2.com', '')
  : 'us-east-1'

// Singleton S3-compatible client configured for Backblaze B2; forcePathStyle is required by B2's API.
export const b2Client = new S3Client({
  endpoint: endpoint || undefined,
  region,
  credentials: {
    accessKeyId: process.env.BACKBLAZE_KEY_ID!,
    secretAccessKey: process.env.BACKBLAZE_APP_KEY!,
  },
  forcePathStyle: true,
})

// Target bucket name read from env; used in all B2 upload/download/delete operations.
export const BUCKET = process.env.BACKBLAZE_BUCKET_NAME!
