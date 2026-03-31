import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminLayoutClient from './admin-layout-client'

// Server layout that guards all admin routes, loads the signed-in admin record, and hands it to the client shell.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Single server-side auth check — instant with middleware token refresh
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Check admin status (single DB query, server-side)
  const { data: userData, error } = await supabase
    .from('users')
    .select('id, email, full_name, is_admin')
    .eq('id', user.id)
    .single()

  if (error || !userData || !userData.is_admin) {
    redirect('/auth/login')
  }

  // Pass admin data down to client layout — no more client-side auth checks!
  // Passes the verified admin profile into the client layout so it can render without extra auth fetches.
  return (
    <AdminLayoutClient
      adminUser={{
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        is_admin: userData.is_admin,
      }}
    >
      {children}
    </AdminLayoutClient>
  )
}
