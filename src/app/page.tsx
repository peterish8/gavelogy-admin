import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Landing server page that redirects authenticated admins to the dashboard and sends everyone else to login.
export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Verifies the signed-in user also has the admin flag in the public users table.
  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (userData?.is_admin) {
    redirect('/admin/dashboard')
  } else {
    // Signs out non-admin users so they cannot remain in an authenticated-but-forbidden session.
    await supabase.auth.signOut()
    redirect('/auth/login')
  }
}
