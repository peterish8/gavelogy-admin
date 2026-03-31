import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Creates a per-request Supabase server client that reads/writes auth cookies via the Next.js cookie store.
// Use this in Server Components, Server Actions, and API routes — never in client components.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Passes all current request cookies to the Supabase client for session reading.
        getAll() {
          return cookieStore.getAll()
        },
        // Writes updated auth cookies back to the response; silently ignores errors when called from Server Components.
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
