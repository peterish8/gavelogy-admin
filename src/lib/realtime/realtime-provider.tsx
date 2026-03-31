'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ============================================
// TYPES
// ============================================

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
  
  updatePresence: (data: Partial<AdminPresence>) => void
  
  subscribeToTable: (
    table: string, 
    callback: (payload: any) => void,
    filter?: { column: string; value: string }
  ) => () => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

// ============================================
// PROVIDER
// ============================================

interface RealtimeProviderProps {
  children: React.ReactNode
  userId: string | null
  userName: string
  userEmail: string
}

// Provides shared Supabase Realtime presence and table-subscription helpers to the admin app tree.
export function RealtimeProvider({ children, userId, userName, userEmail }: RealtimeProviderProps) {
  const supabase = createClient()
  const pathname = usePathname()
  const [isConnected, setIsConnected] = useState(false)
  const [activeAdmins, setActiveAdmins] = useState<AdminPresence[]>([])
  
  const presenceChannelRef = useRef<RealtimeChannel | null>(null)
  const subscriptionsRef = useRef<Map<string, RealtimeChannel>>(new Map())

  // Opens the shared admin presence channel, syncs active admin state, and tracks this user on subscribe.
  useEffect(() => {
    if (!userId) return

    const presenceChannel = supabase.channel('admin-presence', {
      config: { presence: { key: userId } },
    })

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState() as Record<string, AdminPresence[]>
        const admins: AdminPresence[] = []
        Object.values(state).forEach((presences) => {
          if (presences?.[0]) admins.push(presences[0])
        })
        setActiveAdmins(admins)
      })

    presenceChannel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        setIsConnected(true)
        await presenceChannel.track({
          user_id: userId,
          admin_name: userName,
          admin_email: userEmail,
          current_page: window.location.pathname,
          last_seen_at: new Date().toISOString(),
        })
      }
    })

    presenceChannelRef.current = presenceChannel

    const subscriptions = subscriptionsRef.current
    return () => {
      presenceChannel.unsubscribe()
      subscriptions.forEach((ch) => ch.unsubscribe())
    }
  }, [userId, userName, userEmail, supabase])

  // Auto-track page changes — debounced to avoid a Supabase Realtime message on every nav
  // Debounces page-level presence updates so route changes do not spam realtime messages.
  const presenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!presenceChannelRef.current || !userId) return
    if (presenceTimerRef.current) clearTimeout(presenceTimerRef.current)
    presenceTimerRef.current = setTimeout(() => {
      presenceChannelRef.current?.track({
        user_id: userId,
        admin_name: userName,
        admin_email: userEmail,
        current_page: pathname,
        last_seen_at: new Date().toISOString(),
      })
    }, 2000)
    return () => {
      if (presenceTimerRef.current) clearTimeout(presenceTimerRef.current)
    }
  }, [pathname, userId, userName, userEmail])

  // Pushes an updated presence payload for the current admin into the shared presence channel.
  const updatePresence = useCallback(async (data: Partial<AdminPresence>) => {
    if (!presenceChannelRef.current || !userId) return
    await presenceChannelRef.current.track({
      user_id: userId,
      ...data,
      last_seen_at: new Date().toISOString(),
    })
  }, [userId])

  // Subscribes to a table's postgres_changes feed, optionally scoped by a single equality filter.
  const subscribeToTable = useCallback((
    table: string,
    callback: (payload: any) => void,
    filter?: { column: string; value: string }
  ) => {
    const channelName = filter 
      ? `${table}-${filter.column}-${filter.value}`
      : `${table}-all`
    
    // Reuses an existing channel name and returns its cleanup function when already subscribed.
    if (subscriptionsRef.current.has(channelName)) {
      return () => {
        const channel = subscriptionsRef.current.get(channelName)
        if (channel) {
          channel.unsubscribe()
          subscriptionsRef.current.delete(channelName)
        }
      }
    }

    // Builds the postgres_changes config and stores the channel for later cleanup.
    const channelConfig: any = {
      event: '*',
      schema: 'public',
      table,
    }
    if (filter) {
      channelConfig.filter = `${filter.column}=eq.${filter.value}`
    }

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', channelConfig, callback)
      .subscribe()

    subscriptionsRef.current.set(channelName, channel)

    return () => {
      channel.unsubscribe()
      subscriptionsRef.current.delete(channelName)
    }
  }, [supabase])

  const value: RealtimeContextValue = {
    isConnected,
    activeAdmins,
    currentUserId: userId,
    updatePresence,
    subscribeToTable,
  }

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  )
}

// ============================================
// HOOKS
// ============================================

// Reads the realtime context and guarantees the caller is inside RealtimeProvider.
export function useRealtime() {
  const context = useContext(RealtimeContext)
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider')
  }
  return context
}

// Returns all active admins plus the subset excluding the current user.
export function useActiveAdmins() {
  const { activeAdmins, currentUserId } = useRealtime()
  return {
    activeAdmins,
    otherAdmins: activeAdmins.filter(a => a.user_id !== currentUserId),
    currentUserId,
  }
}

/**
 * Returns other admins currently viewing a specific course.
 * Matches by checking if their current_page contains the courseId.
 */
// Returns the other admins currently viewing routes that belong to a specific course.
export function useAdminsOnCourse(courseId: string) {
  const { activeAdmins, currentUserId } = useRealtime()
  
  return useMemo(() => {
    return activeAdmins.filter(admin => 
      admin.user_id !== currentUserId && 
      admin.current_page.includes(`/studio/${courseId}`)
    )
  }, [activeAdmins, currentUserId, courseId])
}

/**
 * Returns other admins grouped by which courseId they're viewing.
 * Useful for the course list view to show badges on each card.
 */
// Groups other active admins by the courseId inferred from their current admin route.
export function useAdminsByCourse() {
  const { activeAdmins, currentUserId } = useRealtime()
  
  return useMemo(() => {
    const map: Record<string, AdminPresence[]> = {}
    
    activeAdmins.forEach(admin => {
      if (admin.user_id === currentUserId) return
      
      // Extract courseId from path like /admin/studio/{courseId} or /admin/studio/{courseId}/...
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

// Exposes only the presence update helper for components that do not need the full realtime context.
export function usePresence() {
  const { updatePresence } = useRealtime()
  return { updatePresence }
}

// Subscribes a component to table changes while keeping the callback stable across re-renders.
export function useTableSubscription(
  table: string,
  callback: (payload: any) => void,
  filter?: { column: string; value: string }
) {
  const { subscribeToTable } = useRealtime()
  // Stabilize callback with a ref so callers don't need to wrap in useCallback
  const callbackRef = useRef(callback)
  useEffect(() => { callbackRef.current = callback })

  useEffect(() => {
    const stableCallback = (payload: any) => callbackRef.current(payload)
    const unsubscribe = subscribeToTable(table, stableCallback, filter)
    return unsubscribe
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter?.column, filter?.value, subscribeToTable])
}
