import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/admin-auth'

// Landing server page that redirects authenticated admins to the dashboard and sends everyone else to login.
export default async function Home() {
  const user = await getAdminUser()
  if (user) {
    redirect('/admin/dashboard')
  }

  redirect('/auth/login')
}
