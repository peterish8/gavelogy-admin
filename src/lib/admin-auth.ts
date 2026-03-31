/**
 * Shared admin authentication helpers.
 * Used by all AI API routes to validate the x-admin-secret header.
 *
 * HOW IT WORKS:
 *   - Set ADMIN_API_SECRET=<a long random string> in .env.local + Vercel env vars.
 *   - Every request to an AI route must include: `x-admin-secret: <value>` header.
 *   - The Telegram bot and MCP server add this header automatically (see usage below).
 *   - If ADMIN_API_SECRET is not set the routes are LOCKED (returns false) — fail-safe.
 *
 * GENERATE A SECRET:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { NextRequest, NextResponse } from 'next/server'

/**
 * Returns true if the request carries the correct admin secret header.
 * Fail-safe: if ADMIN_API_SECRET env var is missing, ALWAYS returns false.
 */
export function isAdminRequest(req: NextRequest): boolean {
  const secret = process.env.ADMIN_API_SECRET
  if (!secret) {
    console.error('[admin-auth] ADMIN_API_SECRET env var is not set — denying request')
    return false
  }
  return req.headers.get('x-admin-secret') === secret
}

/**
 * Returns a 401 Unauthorized NextResponse. Use when isAdminRequest() returns false.
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

/**
 * Returns the value of ADMIN_API_SECRET for use in internal server-to-server fetch calls.
 * Returns empty string if not set (requests will be rejected by isAdminRequest).
 */
export function getAdminSecret(): string {
  return process.env.ADMIN_API_SECRET ?? ''
}

/**
 * Checks Content-Length header against a max size.
 * Returns a 413 response if too large, null if OK.
 * We check content-length first (cheap) — actual body size is validated by the runtime.
 */
export function checkPayloadSize(req: NextRequest, maxBytes = 500_000): NextResponse | null {
  const cl = parseInt(req.headers.get('content-length') ?? '0', 10)
  if (cl > maxBytes) {
    return NextResponse.json(
      { error: `Payload too large (max ${Math.round(maxBytes / 1024)}KB)` },
      { status: 413 }
    )
  }
  return null
}
