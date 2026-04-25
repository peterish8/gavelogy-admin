import { ConvexHttpClient } from 'convex/browser'
import { ApiError } from './response'

let client: ConvexHttpClient | null = null

function getConvexUrl(): string {
  return process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? ''
}

function getClient(): ConvexHttpClient {
  const convexUrl = getConvexUrl()
  if (!convexUrl) {
    throw new ApiError(500, 'INTERNAL_ERROR', 'CONVEX_URL is not configured')
  }

  if (!client) {
    client = new ConvexHttpClient(convexUrl)
  }

  return client
}

export async function convexQuery<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  return await (getClient() as any).query(fn, args)
}

export async function convexMutation<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  return await (getClient() as any).mutation(fn, args)
}
