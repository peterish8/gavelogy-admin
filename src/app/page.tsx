'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, ShieldAlert } from 'lucide-react'

export default function Home() {
  const [isChecking, setIsChecking] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.user) {
          // No session - go to login
          router.replace('/auth/login')
          return
        }

        // Check if admin
        const { data: userData } = await supabase
          .from('users')
          .select('is_admin')
          .eq('id', session.user.id)
          .single()

        if (userData?.is_admin) {
          // Admin - go to dashboard
          router.replace('/admin/dashboard')
        } else {
          // Not admin - sign out and go to login
          await supabase.auth.signOut()
          router.replace('/auth/login')
        }
      } catch (err) {
        console.error('Auth check error:', err)
        router.replace('/auth/login')
      } finally {
        setIsChecking(false)
      }
    }

    checkAuthAndRedirect()
  }, [router, supabase])

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 mb-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
        <p className="text-slate-400">Loading...</p>
      </div>
    </div>
  )
}
