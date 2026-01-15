'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Subject, SubjectWithContent } from '@/types/course-builder'
import { useDraftStore } from '@/lib/stores/draft-store'

export function useSubjects(courseId: string) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSubjects = useCallback(async () => {
    if (!courseId) return
    
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('subjects')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true })

      if (fetchError) throw fetchError
      setSubjects(data || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch subjects'
      setError(message)
      console.error('Error fetching subjects:', err)
    } finally {
      setIsLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    fetchSubjects()
  }, [fetchSubjects])

  return { subjects, isLoading, error, refetch: fetchSubjects }
}

export function useSubject(subjectId: string) {
  const [subject, setSubject] = useState<SubjectWithContent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSubject = useCallback(async () => {
    if (!subjectId) return
    
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      
      // Fetch subject with content items
      const { data: subjectData, error: subjectError } = await supabase
        .from('subjects')
        .select(`
          *,
          content_items (
            id,
            subject_id,
            content_type,
            title,
            order_index,
            is_active,
            created_at,
            updated_at,
            version,
            note_content,
            quiz_id,
            case_number,
            interactive_data
          )
        `)
        .eq('id', subjectId)
        .single()

      if (subjectError) throw subjectError
      
      // Sort content items by order_index
      if (subjectData?.content_items) {
        subjectData.content_items.sort((a: { order_index: number }, b: { order_index: number }) => 
          a.order_index - b.order_index
        )
      }

      setSubject(subjectData)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch subject'
      setError(message)
      console.error('Error fetching subject:', err)
    } finally {
      setIsLoading(false)
    }
  }, [subjectId])

  useEffect(() => {
    fetchSubject()
  }, [fetchSubject])

  return { subject, isLoading, error, refetch: fetchSubject }
}

// Hook for CRUD operations (uses draft store)
export function useSubjectActions() {
  const addChange = useDraftStore((state) => state.addChange)

  const createSubject = useCallback((subjectData: Partial<Subject> & { course_id: string }) => {
    const tempId = crypto.randomUUID()
    addChange({
      action: 'create',
      entityType: 'subject',
      entityId: tempId,
      data: {
        id: tempId,
        name: subjectData.name || 'New Module',
        description: subjectData.description || null,
        icon: subjectData.icon || '📖',
        order_index: subjectData.order_index || 0,
        is_active: true,
        version: 1,
        ...subjectData
      }
    })
    return tempId
  }, [addChange])

  const updateSubject = useCallback((subjectId: string, updates: Partial<Subject>) => {
    addChange({
      action: 'update',
      entityType: 'subject',
      entityId: subjectId,
      data: updates
    })
  }, [addChange])

  const deleteSubject = useCallback((subjectId: string) => {
    addChange({
      action: 'delete',
      entityType: 'subject',
      entityId: subjectId,
      data: {}
    })
  }, [addChange])

  const reorderSubject = useCallback((subjectId: string, newIndex: number, originalIndex: number) => {
    addChange({
      action: 'reorder',
      entityType: 'subject',
      entityId: subjectId,
      data: { order_index: newIndex },
      originalData: { order_index: originalIndex }
    })
  }, [addChange])

  return { createSubject, updateSubject, deleteSubject, reorderSubject }
}
