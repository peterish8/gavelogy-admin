'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ContentItem } from '@/types/course-builder'
import { useDraftStore } from '@/lib/stores/draft-store'

// Fetches all content items for a subject from Supabase ordered by order_index; returns items, loading/error state, and refetch.
export function useContentItems(subjectId: string) {
  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Loads the current subject's content list and refreshes the hook state from Supabase.
  const fetchContentItems = useCallback(async () => {
    if (!subjectId) return
    
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('content_items')
        .select('*')
        .eq('subject_id', subjectId)
        .order('order_index', { ascending: true })

      if (fetchError) throw fetchError
      setContentItems(data || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch content items'
      setError(message)
      console.error('Error fetching content items:', err)
    } finally {
      setIsLoading(false)
    }
  }, [subjectId])

  useEffect(() => {
    fetchContentItems()
  }, [fetchContentItems])

  return { contentItems, isLoading, error, refetch: fetchContentItems }
}

// Fetches a single content item by ID from Supabase; returns item, loading/error state, and refetch.
export function useContentItem(contentId: string) {
  const [contentItem, setContentItem] = useState<ContentItem | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Loads a single content item record by ID and stores it for edit/detail screens.
  const fetchContentItem = useCallback(async () => {
    if (!contentId) return
    
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('content_items')
        .select('*')
        .eq('id', contentId)
        .single()

      if (fetchError) throw fetchError
      setContentItem(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch content item'
      setError(message)
      console.error('Error fetching content item:', err)
    } finally {
      setIsLoading(false)
    }
  }, [contentId])

  useEffect(() => {
    fetchContentItem()
  }, [fetchContentItem])

  return { contentItem, isLoading, error, refetch: fetchContentItem }
}

// Provides create/update/delete/reorder actions for content items; all writes go through the draft store queue.
export function useContentActions() {
  const addChange = useDraftStore((state) => state.addChange)

  // Queues a draft "create" change with sensible defaults and returns the temporary client-side ID.
  const createContentItem = useCallback((contentData: Partial<ContentItem> & { subject_id: string; content_type: ContentItem['content_type'] }) => {
    const tempId = crypto.randomUUID()
    addChange({
      action: 'create',
      entityType: 'content_item',
      entityId: tempId,
      data: {
        id: tempId,
        title: contentData.title || 'New Content',
        order_index: contentData.order_index || 0,
        is_active: true,
        version: 1,
        note_content: null,
        quiz_id: null,
        case_number: null,
        interactive_data: null,
        ...contentData
      }
    })
    return tempId
  }, [addChange])

  // Queues a draft update for an existing content item without touching the database yet.
  const updateContentItem = useCallback((contentId: string, updates: Partial<ContentItem>) => {
    addChange({
      action: 'update',
      entityType: 'content_item',
      entityId: contentId,
      data: updates
    })
  }, [addChange])

  // Queues a draft delete so the item disappears in the UI until the save-bar commits it.
  const deleteContentItem = useCallback((contentId: string) => {
    addChange({
      action: 'delete',
      entityType: 'content_item',
      entityId: contentId,
      data: {}
    })
  }, [addChange])

  // Queues an order_index change while preserving the original index for later save/discard flows.
  const reorderContentItem = useCallback((contentId: string, newIndex: number, originalIndex: number) => {
    addChange({
      action: 'reorder',
      entityType: 'content_item',
      entityId: contentId,
      data: { order_index: newIndex },
      originalData: { order_index: originalIndex }
    })
  }, [addChange])

  return { createContentItem, updateContentItem, deleteContentItem, reorderContentItem }
}
