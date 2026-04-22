'use client'

import { useCallback } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { ContentItem } from '@/types/course-builder'
import { useDraftStore } from '@/lib/stores/draft-store'

// Helper to reliably map Convex structure_items back to ContentItem for the draft store UI
function mapStructureItemToContentItem(item: any): ContentItem {
  const createdAt = item._creationTime
    ? new Date(item._creationTime).toISOString()
    : new Date().toISOString()

  return {
    id: item._id,
    subject_id: item.courseId || item.parentId || '', // fallback
    title: item.title,
    content_type: (item.item_type as any) || 'note',
    order_index: item.order_index || 0,
    is_active: item.is_active ?? true,
    created_at: createdAt,
    updated_at: createdAt,
    version: 1,
    // Add null fallbacks for fields used by the UI
    note_content: null,
    quiz_id: null,
    case_number: null,
    interactive_data: null,
  }
}

export function useContentItems(subjectId: string) {
  // Assuming subjectId here refers to a courseId for top level structure
  const rawItems = useQuery(
    api.content.getStructureItemsByCourse, 
    subjectId ? { courseId: subjectId as Id<"courses"> } : "skip"
  )
  
  const isLoading = rawItems === undefined
  const error = null // Convex handles errors at boundary or throws
  
  // Sort and map
  const contentItems = rawItems 
    ? [...rawItems].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).map(mapStructureItemToContentItem)
    : []

  // Dummy refetch as Convex is auto-updating
  const fetchContentItems = useCallback(async () => {}, [])

  return { contentItems, isLoading, error, refetch: fetchContentItems }
}

export function useContentItem(contentId: string) {
  const item = useQuery(
    api.content.getStructureItem, 
    contentId ? { itemId: contentId as Id<"structure_items"> } : "skip"
  )
  
  const isLoading = item === undefined
  const error = null
  
  const contentItem = item ? mapStructureItemToContentItem(item) : null
  
  const fetchContentItem = useCallback(async () => {}, [])

  return { contentItem, isLoading, error, refetch: fetchContentItem }
}

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
