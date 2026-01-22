'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AdminContextType } from '@/types/course-builder'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  isLoading: true,
  userId: null
})

interface AdminProviderProps {
  children: React.ReactNode
}

export function AdminProvider({ children }: AdminProviderProps) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const checkAdmin = async () => {
      console.log('AdminProvider: checking admin status')
      try {
        const supabase = createClient()
        console.log('AdminProvider: getting user')
        const { data: { user } } = await supabase.auth.getUser()
        console.log('AdminProvider: user found?', !!user)

        if (user) {
          setUserId(user.id)
          
          // Check if user is admin in the users table
          console.log('AdminProvider: querying users table for admin status')
          const { data, error } = await supabase
            .from('users')
            .select('is_admin')
            .eq('id', user.id)
            .single()

          if (error) {
            console.error('Error checking admin status:', error)
            setIsAdmin(false)
          } else {
            console.log('AdminProvider: admin status:', data?.is_admin)
            setIsAdmin(data?.is_admin || false)
          }
        } else {
          setIsAdmin(false)
          setUserId(null)
        }
      } catch (error) {
        console.error('Error in admin check:', error)
        setIsAdmin(false)
      } finally {
        console.log('AdminProvider: check complete, loading false')
        setIsLoading(false)
      }
    }

    checkAdmin()

    // Subscribe to auth changes
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (event === 'SIGNED_OUT') {
          setIsAdmin(false)
          setUserId(null)
        } else if (session?.user) {
          setUserId(session.user.id)
          // Re-check admin status
          const { data } = await supabase
            .from('users')
            .select('is_admin')
            .eq('id', session.user.id)
            .single()
          
          setIsAdmin(data?.is_admin || false)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AdminContext.Provider value={{ isAdmin, isLoading, userId }}>
      {children}
    </AdminContext.Provider>
  )
}

export function useAdmin() {
  const context = useContext(AdminContext)
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider')
  }
  return context
}

export { AdminContext }
