'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useRealtime } from '@/lib/realtime/realtime-provider'
import { createClient } from '@/lib/supabase/client'

/**
 * useDraftContentSync - Real-time sync for draft content (collaborative editing)
 * 
 * Subscribes to draft_content_cache changes for a specific item
 * and updates the editor when other admins make changes
 */
export function useDraftContentSync(
  itemId: string | null,
  onRemoteChange: (draftData: any, cursorData: any) => void
) {
  const { subscribeToTable, isConnected, currentUserId } = useRealtime()
  const lastSyncRef = useRef<number>(0)

  const handleDraftChange = useCallback((payload: any) => {
    if (!itemId) return
    
    const { eventType, new: newRecord, old: oldRecord } = payload
    
    // Only process changes for this item
    if (newRecord?.original_content_id !== itemId && oldRecord?.original_content_id !== itemId) {
      return
    }

    // Ignore our own changes (to prevent feedback loops)
    if (newRecord?.user_id === currentUserId) {
      return
    }

    // Throttle: Don't process changes more than once per 100ms
    const now = Date.now()
    if (now - lastSyncRef.current < 100) return
    lastSyncRef.current = now

    console.log('[DraftContentSync] Received remote change:', eventType, newRecord?.user_id)

    switch (eventType) {
      case 'INSERT':
      case 'UPDATE':
        // Remote admin saved a draft - update our editor
        onRemoteChange(newRecord.draft_data, newRecord.cursor_data)
        break
        
      case 'DELETE':
        // Draft was published/discarded - could refresh to show published content
        // For now, just log it
        console.log('[DraftContentSync] Draft deleted, may need to refresh')
        break
    }
  }, [itemId, currentUserId, onRemoteChange])

  useEffect(() => {
    if (!isConnected || !itemId) return

    console.log('[DraftContentSync] Subscribing to draft_content_cache for item:', itemId)
    
    const unsubscribe = subscribeToTable(
      'draft_content_cache',
      handleDraftChange,
      { column: 'original_content_id', value: itemId }
    )

    return () => {
      console.log('[DraftContentSync] Unsubscribing from draft_content_cache')
      unsubscribe()
    }
  }, [isConnected, itemId, subscribeToTable, handleDraftChange])

  return { isConnected }
}

/**
 * useAutoSaveDraft - Debounced auto-save to draft_content_cache
 * 
 * Saves content to the draft table on every change (debounced)
 * enabling real-time sync across all admins
 */
export function useAutoSaveDraft(itemId: string | null) {
  const supabase = createClient()
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedContentRef = useRef<string>('')

  const saveDraft = useCallback(async (content: string, cursorPosition?: { x: number; y: number }) => {
    if (!itemId) return
    
    // Don't save if content hasn't changed
    if (content === lastSavedContentRef.current) return
    lastSavedContentRef.current = content

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const draftData = { content }
      const cursorData = cursorPosition || {}

      // Upsert the draft
      const { error } = await supabase
        .from('draft_content_cache')
        .upsert({
          original_content_id: itemId,
          user_id: user.id,
          draft_data: draftData,
          cursor_data: cursorData,
          updated_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
        }, {
          onConflict: 'original_content_id'
        })

      if (error) {
        console.error('[AutoSaveDraft] Error saving draft:', error)
      } else {
        console.log('[AutoSaveDraft] Draft saved for item:', itemId)
      }
    } catch (err) {
      console.error('[AutoSaveDraft] Exception:', err)
    }
  }, [itemId, supabase])

  const debouncedSave = useCallback((content: string, cursorPosition?: { x: number; y: number }) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Schedule save in 500ms
    saveTimeoutRef.current = setTimeout(() => {
      saveDraft(content, cursorPosition)
    }, 500)
  }, [saveDraft])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  return { saveDraft, debouncedSave }
}
