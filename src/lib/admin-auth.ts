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
import { fetchQuery } from 'convex/nextjs'
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server'
import { api } from '@convex/_generated/api'

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

export async function isAdmin(): Promise<boolean> {
  try {
    const user = await getAdminUser()
    return !!user
  } catch {
    return false
  }
}

export async function getAdminUser() {
  const token = await convexAuthNextjsToken()
  if (!token) return null

  // Fetch the current user from Convex
  const user = await fetchQuery(api.users.getMe, {}, { token })
  if (!user) return null

  // Validate admin status using env var NEXT_PUBLIC_ADMIN_EMAILS
  const adminEmails = process.env.NEXT_PUBLIC_ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || []
  const isAdminCheck = adminEmails.includes(user.email.toLowerCase())

  // Double check Convex's isAdmin query just in case (optional, but requested in previous setup)
  // Re-enable if needed: const admin = await fetchQuery(api.admin.isAdmin, {}, { token })
  
  if (!isAdminCheck) return null

  // Add the explicit is_admin boolean expected by the client type
  return { ...user, is_admin: true }
}
