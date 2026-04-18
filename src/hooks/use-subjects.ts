'use client'

import { useCallback } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { Subject, SubjectWithContent } from '@/types/course-builder'
import { useDraftStore } from '@/lib/stores/draft-store'

// Helper to map Convex subject to expected UI format
function mapSubject(subject: any): Subject {
  return {
    id: subject._id,
    course_id: subject.courseId,
    name: subject.name,
    description: subject.description,
    order_index: subject.order_index,
    is_active: true, // Convex subjects don't have is_active natively yet
    version: 1,
    icon: '📖'
  }
}

export function useSubjects(courseId: string) {
  // Since Convex uses courseId, we fetch subjects by course
  const rawSubjects = useQuery(
    api.adminQueries.getSubjectsByCourse as any,
    courseId ? { courseId: courseId as Id<"courses"> } : "skip"
  )
  
  const isLoading = rawSubjects === undefined
  const error = null
  
  const subjects = rawSubjects 
    ? [...rawSubjects].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).map(mapSubject)
    : []

  const fetchSubjects = useCallback(async () => {}, [])

  return { subjects, isLoading, error, refetch: fetchSubjects }
}

export function useSubject(subjectId: string) {
  const rawSubject = useQuery(
    api.adminQueries.getSubjectWithContent as any,
    subjectId ? { subjectId: subjectId as Id<"subjects"> } : "skip"
  )
  
  const isLoading = rawSubject === undefined
  const error = null
  
  let subject: SubjectWithContent | null = null
  
  if (rawSubject) {
    subject = {
      ...mapSubject(rawSubject.subject),
      content_items: (rawSubject.content_items || []).map((item: any) => ({
        id: item._id,
        subject_id: subjectId,
        content_type: item.item_type || 'note',
        title: item.title,
        order_index: item.order_index || 0,
        is_active: item.is_active ?? true,
        version: 1,
        note_content: null,
        quiz_id: null,
        case_number: null,
        interactive_data: null,
        pdf_url: item.pdf_url || null,
      })).sort((a: any, b: any) => a.order_index - b.order_index)
    }
  }

  const fetchSubject = useCallback(async () => {}, [])

  return { subject, isLoading, error, refetch: fetchSubject }
}

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
