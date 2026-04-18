import { convexAuthNextjsMiddleware } from '@convex-dev/auth/nextjs/server'

export const proxy = convexAuthNextjsMiddleware()

// Next.js middleware matcher: applies to all routes except static assets, images, and favicon.
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
