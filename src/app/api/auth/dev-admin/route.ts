import { NextRequest, NextResponse } from 'next/server'
import { fetchMutation } from 'convex/nextjs'
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server'
import { api } from '@convex/_generated/api'

function isLocalDevRequest(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return false

  const host = req.headers.get('host')?.toLowerCase() ?? ''
  return (
    host.startsWith('localhost:') ||
    host === 'localhost' ||
    host.startsWith('127.0.0.1:') ||
    host === '127.0.0.1' ||
    host.startsWith('[::1]:') ||
    host === '[::1]'
  )
}

export async function POST(req: NextRequest) {
  if (!isLocalDevRequest(req)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const token = await convexAuthNextjsToken()
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await fetchMutation((api as any).users.enableDevAdmin, {}, { token })

  return NextResponse.json({ success: true })
}
