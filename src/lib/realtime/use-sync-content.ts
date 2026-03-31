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

  // Handles remote draft edits for this item while ignoring local echoes and overly-frequent updates.
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
    // Throttles incoming updates so collaborative edits do not overwhelm the editor UI.
    const now = Date.now()
    if (now - lastSyncRef.current < 100) return
    lastSyncRef.current = now

    console.log('[DraftContentSync] Received remote change:', eventType, newRecord?.user_id)

    // For inserts/updates, forward the remote draft payload to the editor callback.
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

  // Attaches and tears down the item-scoped draft_content_cache subscription.
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

  // Upserts the current editor content into draft_content_cache for collaborative editing and recovery.
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
      // Stores the latest draft plus optional cursor metadata for this admin.
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

  // Debounces draft writes so rapid typing does not trigger a database call on every keystroke.
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

  // Clears any pending debounced save when the editor unmounts.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  return { saveDraft, debouncedSave }
}
