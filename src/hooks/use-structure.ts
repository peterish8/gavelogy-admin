import { useMemo, useCallback } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { StructureItem, ItemType } from '@/types/structure'

function mapStructureItem(item: any): StructureItem {
  return {
    id: item._id,
    course_id: item.courseId ?? '',
    parent_id: item.parentId ?? null,
    item_type: item.item_type as ItemType,
    title: item.title,
    description: item.description ?? null,
    icon: item.icon ?? null,
    is_active: item.is_active ?? false,
    order_index: item.order_index ?? 0,
    created_at: new Date(item._creationTime).toISOString(),
    updated_at: new Date(item._creationTime).toISOString(),
    note_content: item.hasNoteContent
      ? {
          id: `${item._id}-note`,
          item_id: item._id,
          content_html: '',
          created_at: new Date(item._creationTime).toISOString(),
          updated_at: new Date(item._creationTime).toISOString(),
        }
      : null,
    attached_quiz: null,
    children: [],
  }
}

function buildTree(items: StructureItem[]): StructureItem[] {
  const itemMap = new Map<string, StructureItem>()
  const rootItems: StructureItem[] = []

  items.forEach((item) => {
    itemMap.set(item.id, { ...item, children: [] })
  })

  items.forEach((item) => {
    const node = itemMap.get(item.id)!
    if (item.parent_id && itemMap.has(item.parent_id)) {
      itemMap.get(item.parent_id)!.children!.push(node)
    } else {
      rootItems.push(node)
    }
  })

  const sortRecursive = (nodes: StructureItem[]) => {
    nodes.sort((a, b) => a.order_index - b.order_index)
    nodes.forEach((node) => sortRecursive(node.children || []))
  }

  sortRecursive(rootItems)
  return rootItems
}

export function useStructure(courseId: string) {
  const items = useQuery(
    api.admin.getStructureItemsWithNoteFlag,
    courseId ? { courseId: courseId as Id<'courses'> } : 'skip'
  )

  const tree = useMemo(
    () => buildTree((items ?? []).map(mapStructureItem)),
    [items]
  )

  return {
    items: tree,
    isLoading: items === undefined,
    error: null,
    refetch: () => {},
  }
}

export function useStructureActions() {
  const allItems = useQuery(api.admin.getAllStructureItems, {})
  const upsertStructureItem = useMutation(api.admin.upsertStructureItem)
  const deleteStructureItem = useMutation(api.admin.deleteStructureItem)

  const createItem = useCallback(async (data: {
    course_id: string
    parent_id: string | null
    item_type: ItemType
    title: string
    order_index: number
  }) => {
    return await upsertStructureItem({
      courseId: data.course_id as Id<'courses'>,
      parentId: data.parent_id ? (data.parent_id as Id<'structure_items'>) : undefined,
      item_type: data.item_type,
      title: data.title,
      order_index: data.order_index,
      is_active: true,
    })
  }, [upsertStructureItem])

  const updateItem = useCallback(async (id: string, updates: Partial<StructureItem>) => {
    const existing = allItems?.find((item: any) => item._id === id)
    if (!existing) throw new Error('Structure item not found')
    await upsertStructureItem({
      itemId: id as Id<'structure_items'>,
      courseId: (updates.course_id ?? existing.courseId) as Id<'courses'> | undefined,
      parentId: (updates.parent_id ?? existing.parentId) as Id<'structure_items'> | undefined,
      title: updates.title ?? existing.title,
      description: updates.description ?? existing.description,
      item_type: updates.item_type ?? existing.item_type,
      order_index: updates.order_index ?? existing.order_index,
      icon: updates.icon ?? existing.icon,
      is_active: updates.is_active ?? existing.is_active,
      pdf_url: existing.pdf_url,
    })
  }, [allItems, upsertStructureItem])

  const deleteItem = useCallback(async (id: string) => {
    await deleteStructureItem({ itemId: id as Id<'structure_items'> })
  }, [deleteStructureItem])

  const moveItem = useCallback(async (id: string, newParentId: string | null, newIndex: number) => {
    const existing = allItems?.find((item: any) => item._id === id)
    if (!existing) throw new Error('Structure item not found')
    await upsertStructureItem({
      itemId: id as Id<'structure_items'>,
      parentId: newParentId ? (newParentId as Id<'structure_items'>) : undefined,
      courseId: existing.courseId,
      title: existing.title,
      description: existing.description,
      item_type: existing.item_type,
      order_index: newIndex,
      icon: existing.icon,
      is_active: existing.is_active,
      pdf_url: existing.pdf_url,
    })
  }, [allItems, upsertStructureItem])

  return { createItem, updateItem, deleteItem, moveItem }
}
