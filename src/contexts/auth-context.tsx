'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User, Session } from '@supabase/supabase-js'

interface AdminUser {
  id: string
  email: string
  full_name?: string
  is_admin: boolean
}

interface AuthContextType {
  user: User | null
  adminUser: AdminUser | null
  session: Session | null
  isLoading: boolean
  isAdmin: boolean
  signOut: () => Promise<void>
  refreshAdminStatus: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  // Check if user is admin by querying public.users
  const checkAdminStatus = async (userId: string): Promise<AdminUser | null> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, is_admin')
        .eq('id', userId)
        .single()

      if (error || !data) {
        console.error('Error checking admin status:', error)
        return null
      }

      return data as AdminUser
    } catch (err) {
      console.error('Failed to check admin status:', err)
      return null
    }
  }

  const refreshAdminStatus = async () => {
    if (user) {
      const admin = await checkAdminStatus(user.id)
      setAdminUser(admin)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setAdminUser(null)
    setSession(null)
  }

  useEffect(() => {
    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        
        if (currentSession?.user) {
          setSession(currentSession)
          setUser(currentSession.user)
          
          // Check admin status
          const admin = await checkAdminStatus(currentSession.user.id)
          setAdminUser(admin)
        }
      } catch (err) {
        console.error('Error initializing auth:', err)
      } finally {
        setIsLoading(false)
      }
    }

    initializeAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession)
        setUser(newSession?.user ?? null)

        if (newSession?.user) {
          const admin = await checkAdminStatus(newSession.user.id)
          setAdminUser(admin)
        } else {
          setAdminUser(null)
        }

        // Handle specific events
        if (event === 'SIGNED_OUT') {
          setAdminUser(null)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        adminUser,
        session,
        isLoading,
        isAdmin: adminUser?.is_admin ?? false,
        signOut,
        refreshAdminStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
