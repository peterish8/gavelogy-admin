'use client'

import React, { createContext, useContext, useMemo } from 'react'

export interface AdminPresence {
  user_id: string
  admin_name: string
  admin_email: string
  current_page: string
  last_seen_at: string
}

export interface RealtimeContextValue {
  isConnected: boolean
  activeAdmins: AdminPresence[]
  currentUserId: string | null
  updatePresence: (data: Partial<AdminPresence>) => void | Promise<void>
  subscribeToTable: (
    table: string,
    callback: (payload: any) => void,
    filter?: { column: string; value: string }
  ) => () => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

interface RealtimeProviderProps {
  children: React.ReactNode
  userId: string | null
  userName: string
  userEmail: string
}

// Temporary no-op provider while the admin app is being moved off Supabase Realtime.
export function RealtimeProvider({ children, userId, userName, userEmail }: RealtimeProviderProps) {
  void userName
  void userEmail

  const value: RealtimeContextValue = {
    isConnected: false,
    activeAdmins: [],
    currentUserId: userId,
    updatePresence: async () => {},
    subscribeToTable: () => () => {},
  }

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime() {
  const context = useContext(RealtimeContext)
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider')
  }
  return context
}

export function useActiveAdmins() {
  const { activeAdmins, currentUserId } = useRealtime()
  return {
    activeAdmins,
    otherAdmins: activeAdmins.filter(a => a.user_id !== currentUserId),
    currentUserId,
  }
}

export function useAdminsOnCourse(courseId: string) {
  const { activeAdmins, currentUserId } = useRealtime()

  return useMemo(() => {
    return activeAdmins.filter(admin =>
      admin.user_id !== currentUserId &&
      admin.current_page.includes(`/studio/${courseId}`)
    )
  }, [activeAdmins, currentUserId, courseId])
}

export function useAdminsByCourse() {
  const { activeAdmins, currentUserId } = useRealtime()

  return useMemo(() => {
    const map: Record<string, AdminPresence[]> = {}

    activeAdmins.forEach(admin => {
      if (admin.user_id === currentUserId) return

      const match = admin.current_page.match(/\/studio\/([^/]+)/)
      if (match) {
        const courseId = match[1]
        if (!map[courseId]) map[courseId] = []
        map[courseId].push(admin)
      }
    })

    return map
  }, [activeAdmins, currentUserId])
}

export function usePresence() {
  const { updatePresence } = useRealtime()
  return { updatePresence }
}

export function useTableSubscription(
  _table: string,
  _callback: (payload: any) => void,
  _filter?: { column: string; value: string }
) {}
