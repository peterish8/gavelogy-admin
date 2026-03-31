'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Course } from '@/types/course-builder'
import { useDraftStore } from '@/lib/stores/draft-store'
import { useCourseStore } from '@/lib/stores/course-store'

// Global lock that persists across HMR
declare global {
  interface Window {
    __gavelogy_courses_fetching?: boolean
    __gavelogy_courses_fetched?: boolean
  }
}

// Fetches all courses from Supabase with a global dedup lock to prevent concurrent fetches across HMR reloads.
// Returns courses array, loading/fetching state, error, and a force-refetch function.
export function useCourses() {
  const store = useCourseStore()
  const [error, setError] = useState<string | null>(null)
  
  // If we have data in store, we are NOT loading from user perspective (Instant Load)
  const isLoaded = store.coursesLoaded
  const [isFetching, setIsFetching] = useState(false)
  
  // Use refs to persist across re-renders
  const isFetchingRef = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasFetchedRef = useRef(false)

  // Fetches the course list once, with HMR-safe locking and timeouts to avoid duplicate client queries.
  const fetchCourses = useCallback(async (force = false) => {
    // Check global lock (survives HMR)
    if (typeof window !== 'undefined') {
      if (window.__gavelogy_courses_fetching) {
        console.log('useCourses: skipping, global fetch in progress')
        return
      }
      if (window.__gavelogy_courses_fetched && !force) {
        console.log('useCourses: skipping, already fetched globally')
        return
      }
    }
    
    // Skip if already fetching or already fetched (unless forced)
    if (isFetchingRef.current) {
      console.log('useCourses: skipping, already fetching')
      return
    }
    if (hasFetchedRef.current && !force) {
      console.log('useCourses: skipping, already fetched')
      return
    }
    
    isFetchingRef.current = true
    hasFetchedRef.current = true
    if (typeof window !== 'undefined') {
      window.__gavelogy_courses_fetching = true
    }
    setIsFetching(true)
    setError(null)
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    // Safety timeout (30s)
    timeoutRef.current = setTimeout(() => {
      if (isFetchingRef.current) {
        console.warn('useCourses: forced timeout')
        isFetchingRef.current = false
        setIsFetching(false)
        setError('Connection timed out. Please check your internet or try again.')
      }
    }, 30000)
    
    try {
      console.log('useCourses: invoking supabase client')
      const supabase = createClient()
      console.log('useCourses: supabase client created, querying...')
      
      // Create abort controller for 10s timeout
      const controller = new AbortController()
      const queryTimeout = setTimeout(() => {
        console.warn('useCourses: aborting query due to timeout')
        controller.abort()
      }, 10000)
      
      // Race between the query and a timeout promise
      const queryPromise = supabase
        .from('courses')
        .select('*')
        .order('order_index', { ascending: true })
        .abortSignal(controller.signal)
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Query timed out after 10 seconds')), 10000)
      })
      
      const { data, error: fetchError } = await Promise.race([queryPromise, timeoutPromise])
      clearTimeout(queryTimeout)

      console.log('useCourses: query completed', { dataLength: data?.length, error: fetchError?.message })
      
      if (fetchError) throw fetchError
      
      console.log('useCourses: fetch success', data?.length)
      store.setCourses(data || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch courses'
      console.error('useCourses: caught error', message)
      setError(message)
    } finally {
      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      isFetchingRef.current = false
      if (typeof window !== 'undefined') {
        window.__gavelogy_courses_fetching = false
        window.__gavelogy_courses_fetched = true
      }
      setIsFetching(false)
    }
  }, [store])

  // Kicks off the initial course fetch and clears the timeout guard on unmount.
  useEffect(() => {
    console.log('useCourses: mount, fetching...')
    fetchCourses()
    
    // Cleanup on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [fetchCourses])

  const refetch = useCallback(() => fetchCourses(true), [fetchCourses])

  return { 
    courses: store.courses, 
    isLoading: !isLoaded && isFetching,
    isFetching,
    error, 
    refetch 
  }
}

// Fetches a single course by ID, merging cache + draft store overrides so the latest unsaved edits are visible.
export function useCourse(courseId: string) {
  const store = useCourseStore()
  const [error, setError] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  
  const getChangeForEntity = useDraftStore((state) => state.getChangeForEntity)
  const setCourseDetail = store.setCourseDetail // Extract stable reference

  // Reads the course from either the list cache or the dedicated detail cache for instant first render.
  const cachedCourse = store.courses.find(c => c.id === courseId) || store.courseDetails[courseId]
  
  // Loads the latest course row unless this course only exists as a pending draft creation.
  const fetchCourse = useCallback(async () => {
    if (!courseId) return
    
    // If we found it in cache, we assume "good enough" for instant load, 
    // but maybe we want to re-fetch details if it was just a summary? 
    // For now assuming summary is enough or we fetch to be sure.
    
    console.log('useCourse: fetching course', courseId)
    setIsFetching(true)
    setError(null)

    // Safety timeout (increased to 30s)
    const timeoutId = setTimeout(() => {
        setIsFetching(false)
        setError('Connection timed out. Please check your internet or try again.')
    }, 30000)

    // 1. Check drafts (unchanged logic)
    const draftChange = getChangeForEntity(courseId)
    if (draftChange && draftChange.entityType === 'course' && draftChange.action === 'create') {
        setIsFetching(false)
        clearTimeout(timeoutId)
        return // We return specialized logic below
    }

    // 2. Fetch from Supabase
    try {
      const supabase = createClient()
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .maybeSingle()

      if (courseError) throw courseError
      
      if (courseData) {
          setCourseDetail(courseData)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch course'
      setError(message)
    } finally {
      clearTimeout(timeoutId)
      setIsFetching(false)
    }
  }, [courseId, getChangeForEntity, setCourseDetail])

  useEffect(() => {
      // If not in cache, strictly fetch. 
      // Even if in cache, re-fetch for updates.
      fetchCourse()
  }, [courseId, fetchCourse])

  // Merges cached course data with any pending draft change so editors see unsaved values immediately.
  const mergedCourse = useMemo(() => {
      // Logic: Start with Cache or Null
      // Warning: draftChange is used in logic but not dependency above? 
      // Just re-calc here.
      
      const draftChange = getChangeForEntity(courseId)
      if (draftChange && draftChange.entityType === 'course' && draftChange.action === 'create') {
          return {
              ...draftChange.data as Course,
              subjects: []
          }
      }
      
      if (!cachedCourse) return null
      
      const base = { ...cachedCourse, subjects: [] }
      if (draftChange && draftChange.action === 'update') {
          Object.assign(base, draftChange.data)
      }
      return base
  }, [cachedCourse, courseId, getChangeForEntity])

  return { 
      course: mergedCourse, 
      isLoading: !mergedCourse && isFetching, // Only load if no data at all
      error, 
      refetch: fetchCourse 
  }
}

// Provides async create/update/delete/reorder actions that write directly to Supabase (instant save, no draft queue).
export function useCourseActions() {
    // Note: create and delete are now handled directly in page.tsx for better optimistic control
    // taking them out here or keeping them as legacy wrappers isn't ideal. 
    // Let's refactor to keep logic central if possible, but for Page's specific needs we did inline.
    // For consistency, let's make these powerful async functions too.

  // Inserts a new course row immediately and returns the generated temporary ID used throughout the UI.
  const createCourse = useCallback(async (courseData: Partial<Course>) => {
      // NOTE: This is used by some components, better to have a central async version
      const supabase = createClient()
      const tempId = crypto.randomUUID()
      const newCourse = {
        id: tempId,
        name: courseData.name || 'New Course',
        description: courseData.description || null,
        price: courseData.price || 0,
        icon: courseData.icon || '📚',
        order_index: courseData.order_index || 0,
        is_active: false,
        version: 1,
        ...courseData,
        updated_at: new Date().toISOString()
      }
      
      const { error } = await supabase.from('courses').insert(newCourse)
      if (error) throw error
      return tempId
  }, [])

  // Persists partial course updates directly to Supabase for instant-save interactions.
  const updateCourse = useCallback(async (courseId: string, updates: Partial<Course>) => {
    try {
        const supabase = createClient()
        const { error } = await supabase
            .from('courses')
            .update(updates)
            .eq('id', courseId)
        
        if (error) throw error
        // Toast handled by caller usually, but for instant save:
        // toast.success('Saved') // Too spammy for every character?
    } catch (e) {
        console.error('Failed to update course', e)
        // toast.error('Failed to save')
        throw e
    }
  }, [])

  // Deletes the course row from Supabase; callers handle any surrounding UI cleanup.
  const deleteCourse = useCallback(async (courseId: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('courses').delete().eq('id', courseId)
      if (error) throw error
  }, [])

  // Updates a course's display order in Supabase after drag/drop or manual reordering.
  const reorderCourse = useCallback(async (courseId: string, newIndex: number) => {
    try {
       const supabase = createClient()
       const { error } = await supabase
        .from('courses')
        .update({ order_index: newIndex })
        .eq('id', courseId)
       
       if (error) throw error
    } catch (e) {
        console.error('Failed to reorder', e)
        throw e
    }
  }, [])

  return { createCourse, updateCourse, deleteCourse, reorderCourse }
}
