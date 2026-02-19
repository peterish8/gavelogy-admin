import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Check if admin
  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (userData?.is_admin) {
    redirect('/admin/dashboard')
  } else {
    // Not admin - go to login
    await supabase.auth.signOut()
    redirect('/auth/login')
  }
}
