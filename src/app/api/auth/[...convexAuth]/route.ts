// Catch-all to absorb any /api/auth/* sub-paths the Convex client may call.
// The main handler lives at /api/auth/route.ts
export async function POST() {
  return new Response('Not found', { status: 404 })
}
