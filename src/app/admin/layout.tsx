import { redirect } from 'next/navigation'
import AdminLayoutClient from './admin-layout-client'
import { getAdminUser } from '@/lib/admin-auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAdminUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <AdminLayoutClient
      adminUser={{
        id: user._id,
        email: user.email,
        full_name: user.full_name,
        is_admin: true,
      }}
    >
      {children}
    </AdminLayoutClient>
  )
}
