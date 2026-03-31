import { createBrowserClient } from '@supabase/ssr'

// Singleton instance reused across all browser-side Supabase calls to avoid creating multiple connections.
let client: ReturnType<typeof createBrowserClient>

// Returns (or creates) the singleton browser Supabase client using public env vars — safe to call in client components.
export function createClient() {
  if (client) return client

  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  return client
}
