import { S3Client } from '@aws-sdk/client-s3'

const endpoint = process.env.BACKBLAZE_BUCKET_ENDPOINT ?? ''
const region = endpoint
  ? endpoint.replace('https://s3.', '').replace('.backblazeb2.com', '')
  : 'us-east-1'

export const b2Client = new S3Client({
  endpoint: endpoint || undefined,
  region,
  credentials: {
    accessKeyId: process.env.BACKBLAZE_KEY_ID!,
    secretAccessKey: process.env.BACKBLAZE_APP_KEY!,
  },
  forcePathStyle: true,
})

export const BUCKET = process.env.BACKBLAZE_BUCKET_NAME!
