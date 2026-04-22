import { fetchAction } from 'convex/nextjs'
import { cookies as nextCookies, headers as nextHeaders } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: false, // localhost
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

function getCookieNames(host: string) {
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
  const prefix = isLocalhost ? '' : '__Host-'
  return {
    token: prefix + '__convexAuthJWT',
    refreshToken: prefix + '__convexAuthRefreshToken',
    secure: !isLocalhost,
  }
}

export async function POST(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const names = getCookieNames(host)
  const opts = { ...COOKIE_OPTIONS, secure: names.secure }

  let body: { action: string; args: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { action, args } = body

  if (action !== 'auth:signIn' && action !== 'auth:signOut') {
    return new Response('Invalid action', { status: 400 })
  }

  // For token refresh, swap the dummy refresh token for the real one from cookie
  if (action === 'auth:signIn' && args.refreshToken !== undefined) {
    const cookieStore = await nextCookies()
    const realRefreshToken = cookieStore.get(names.refreshToken)?.value
    if (!realRefreshToken) {
      return NextResponse.json({ tokens: null })
    }
    args.refreshToken = realRefreshToken
  }

  const cookieStore = await nextCookies()
  const existingToken = cookieStore.get(names.token)?.value

  const fetchOptions = (action === 'auth:signIn' && (args.refreshToken !== undefined || (args.params as any)?.code !== undefined))
    ? {}
    : { token: existingToken }

  try {
    if (action === 'auth:signIn') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await fetchAction('auth:signIn' as any, args, fetchOptions)
      const response = NextResponse.json(
        result.tokens !== undefined
          ? { tokens: result.tokens !== null ? { token: result.tokens.token, refreshToken: 'dummy' } : null }
          : result
      )
      if (result.tokens !== undefined) {
        if (result.tokens !== null) {
          response.cookies.set(names.token, result.tokens.token, opts)
          response.cookies.set(names.refreshToken, result.tokens.refreshToken, opts)
        } else {
          response.cookies.set(names.token, '', { ...opts, maxAge: undefined, expires: new Date(0) })
          response.cookies.set(names.refreshToken, '', { ...opts, maxAge: undefined, expires: new Date(0) })
        }
      }
      return response
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await fetchAction('auth:signOut' as any, args, { token: existingToken })
      const response = NextResponse.json(null)
      response.cookies.set(names.token, '', { ...opts, maxAge: undefined, expires: new Date(0) })
      response.cookies.set(names.refreshToken, '', { ...opts, maxAge: undefined, expires: new Date(0) })
      return response
    }
  } catch (error) {
    const response = NextResponse.json({ error: (error as Error).message }, { status: 400 })
    response.cookies.set(names.token, '', { ...opts, maxAge: undefined, expires: new Date(0) })
    response.cookies.set(names.refreshToken, '', { ...opts, maxAge: undefined, expires: new Date(0) })
    return response
  }
}
