'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
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
  current_item_id: string | null
  cursor_position: { x: number; y: number } | null
  last_seen_at: string
}

export interface RealtimeContextValue {
  // State
  isConnected: boolean
  activeAdmins: AdminPresence[]
  currentUserId: string | null
  
  // Actions
  updatePresence: (data: Partial<AdminPresence>) => void
  broadcastCursor: (position: { x: number; y: number }) => void
  
  // Subscriptions
  subscribeToTable: (
    table: string, 
    callback: (payload: any) => void,
    filter?: { column: string; value: string }
  ) => () => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

// ============================================
// PROVIDER COMPONENT
// ============================================

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [isConnected, setIsConnected] = useState(false)
  const [activeAdmins, setActiveAdmins] = useState<AdminPresence[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  
  const presenceChannelRef = useRef<RealtimeChannel | null>(null)
  const subscriptionsRef = useRef<Map<string, RealtimeChannel>>(new Map())

  // ============================================
  // INITIALIZE CONNECTION & PRESENCE
  // ============================================
  useEffect(() => {
    const initializeRealtime = async () => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      setCurrentUserId(user.id)
      
      // Get user details
      const { data: userData } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', user.id)
        .single()

      // Create presence channel
      const presenceChannel = supabase.channel('admin-presence', {
        config: {
          presence: {
            key: user.id,
          },
        },
      })

      // Track presence state changes
      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState() as Record<string, AdminPresence[]>
          const admins: AdminPresence[] = []
          
          Object.entries(state).forEach(([_userId, presences]) => {
            if (presences && Array.isArray(presences) && presences.length > 0) {
              admins.push(presences[0])
            }
          })
          
          setActiveAdmins(admins)
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }: { key: string; newPresences: AdminPresence[] }) => {
          console.log('Admin joined:', key, newPresences)
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }: { key: string; leftPresences: AdminPresence[] }) => {
          console.log('Admin left:', key, leftPresences)
        })

      await presenceChannel.subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true)
          
          // Track our presence
          await presenceChannel.track({
            user_id: user.id,
            admin_name: userData?.full_name || 'Admin',
            admin_email: userData?.email || user.email,
            current_page: window.location.pathname,
            current_item_id: null,
            cursor_position: null,
            last_seen_at: new Date().toISOString(),
          })
        }
      })

      presenceChannelRef.current = presenceChannel
    }

    initializeRealtime()

    return () => {
      // Cleanup on unmount
      if (presenceChannelRef.current) {
        presenceChannelRef.current.unsubscribe()
      }
      subscriptionsRef.current.forEach((channel) => {
        channel.unsubscribe()
      })
    }
  }, [supabase])

  // ============================================
  // UPDATE PRESENCE (page, item, etc.)
  // ============================================
  const updatePresence = useCallback(async (data: Partial<AdminPresence>) => {
    if (!presenceChannelRef.current || !currentUserId) return
    
    await presenceChannelRef.current.track({
      user_id: currentUserId,
      ...data,
      last_seen_at: new Date().toISOString(),
    })
  }, [currentUserId])

  // ============================================
  // BROADCAST CURSOR POSITION (throttled)
  // ============================================
  const lastCursorBroadcast = useRef<number>(0)
  const broadcastCursor = useCallback((position: { x: number; y: number }) => {
    const now = Date.now()
    // Throttle to max 20 updates per second (50ms)
    if (now - lastCursorBroadcast.current < 50) return
    lastCursorBroadcast.current = now
    
    updatePresence({ cursor_position: position } as any)
  }, [updatePresence])

  // ============================================
  // SUBSCRIBE TO TABLE CHANGES
  // ============================================
  const subscribeToTable = useCallback((
    table: string,
    callback: (payload: any) => void,
    filter?: { column: string; value: string }
  ) => {
    const channelName = filter 
      ? `${table}-${filter.column}-${filter.value}`
      : `${table}-all`
    
    // Check if already subscribed
    if (subscriptionsRef.current.has(channelName)) {
      // Just return the unsubscribe function
      return () => {
        const channel = subscriptionsRef.current.get(channelName)
        if (channel) {
          channel.unsubscribe()
          subscriptionsRef.current.delete(channelName)
        }
      }
    }

    const channelConfig: any = {
      event: '*',
      schema: 'public',
      table: table,
    }
    
    if (filter) {
      channelConfig.filter = `${filter.column}=eq.${filter.value}`
    }

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', channelConfig, (payload: any) => {
        console.log(`[Realtime] ${table}:`, payload)
        callback(payload)
      })
      .subscribe()

    subscriptionsRef.current.set(channelName, channel)

    // Return unsubscribe function
    return () => {
      channel.unsubscribe()
      subscriptionsRef.current.delete(channelName)
    }
  }, [supabase])

  // ============================================
  // CONTEXT VALUE
  // ============================================
  const value: RealtimeContextValue = {
    isConnected,
    activeAdmins,
    currentUserId,
    updatePresence,
    broadcastCursor,
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

export function usePresence() {
  const { updatePresence, broadcastCursor } = useRealtime()
  return { updatePresence, broadcastCursor }
}

export function useTableSubscription(
  table: string,
  callback: (payload: any) => void,
  filter?: { column: string; value: string }
) {
  const { subscribeToTable } = useRealtime()
  
  useEffect(() => {
    const unsubscribe = subscribeToTable(table, callback, filter)
    return unsubscribe
  }, [table, callback, filter, subscribeToTable])
}
