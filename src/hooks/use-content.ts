'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ContentItem } from '@/types/course-builder'
import { useDraftStore } from '@/lib/stores/draft-store'

export function useContentItems(subjectId: string) {
  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

export function useContentItem(contentId: string) {
  const [contentItem, setContentItem] = useState<ContentItem | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

// Hook for CRUD operations (uses draft store)
export function useContentActions() {
  const addChange = useDraftStore((state) => state.addChange)

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

  const updateContentItem = useCallback((contentId: string, updates: Partial<ContentItem>) => {
    addChange({
      action: 'update',
      entityType: 'content_item',
      entityId: contentId,
      data: updates
    })
  }, [addChange])

  const deleteContentItem = useCallback((contentId: string) => {
    addChange({
      action: 'delete',
      entityType: 'content_item',
      entityId: contentId,
      data: {}
    })
  }, [addChange])

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
