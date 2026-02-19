'use client'

import { createContext, useContext } from 'react'

interface AdminContextType {
  isAdmin: boolean
  isLoading: boolean
  userId: string | null
}

const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  isLoading: false,
  userId: null
})

interface AdminProviderProps {
  children: React.ReactNode
  isAdmin: boolean
  userId: string | null
}

// Simplified: receives props from Server Component, no more client-side Supabase calls
export function AdminProvider({ children, isAdmin, userId }: AdminProviderProps) {
  return (
    <AdminContext.Provider value={{ isAdmin, isLoading: false, userId }}>
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
