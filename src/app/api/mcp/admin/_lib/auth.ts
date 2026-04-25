import { NextRequest } from 'next/server'
import { checkPayloadSize, isAdminApiRequest } from '@/lib/admin-auth'
import { ApiError } from './response'

export async function requireAdminAccess(req: NextRequest): Promise<void> {
  const ok = await isAdminApiRequest(req)
  if (!ok) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized')
  }
}

export function requireWriteSecret(req: NextRequest): void {
  const secret = process.env.ADMIN_API_SECRET
  if (!secret) {
    throw new ApiError(500, 'INTERNAL_ERROR', 'ADMIN_API_SECRET is not configured')
  }

  if (req.headers.get('x-admin-secret') !== secret) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Missing or invalid x-admin-secret')
  }
}

export function enforcePayloadSize(req: NextRequest, maxBytes = 500_000): void {
  const res = checkPayloadSize(req, maxBytes)
  if (!res) return

  throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `Payload too large (max ${Math.round(maxBytes / 1024)}KB)`)
}

export function getAdminSecretForConvex(): string {
  const secret = process.env.ADMIN_API_SECRET
  if (!secret) {
    throw new ApiError(500, 'INTERNAL_ERROR', 'ADMIN_API_SECRET is not configured')
  }
  return secret
}
