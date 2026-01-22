import { create } from 'zustand'
import { Course } from '@/types/course-builder'
import { StructureItem } from '@/types/structure'

interface CourseStore {
  // Course List Cache
  courses: Course[]
  coursesLoaded: boolean
  lastCoursesFetch: number // Timestamp
  setCourses: (courses: Course[]) => void
  
  // Specific Course Data Cache
  courseDetails: Record<string, Course>
  setCourseDetail: (course: Course) => void

  // Structure Cache
  structures: Record<string, StructureItem[]> 
  setStructure: (courseId: string, items: StructureItem[]) => void
  
  // Invalidate
  invalidate: () => void
}

import { persist } from 'zustand/middleware'

export const useCourseStore = create<CourseStore>()(
  persist(
    (set) => ({
      courses: [],
      coursesLoaded: false,
      lastCoursesFetch: 0,
      courseDetails: {},
      structures: {},

      setCourses: (courses) => set({ 
        courses, 
        coursesLoaded: true, 
        lastCoursesFetch: Date.now() 
      }),

      setCourseDetail: (course) => set((state) => ({
        courseDetails: { ...state.courseDetails, [course.id]: course }
      })),

      setStructure: (courseId, items) => set((state) => ({
        structures: { ...state.structures, [courseId]: items }
      })),

      invalidate: () => set({ 
        coursesLoaded: false, 
        lastCoursesFetch: 0 
      })
    }),
    {
      name: 'gavelogy-courses-cache',
      // Only persist specific keys to avoid bloat
      partialize: (state) => ({ 
        courses: state.courses, 
        coursesLoaded: state.coursesLoaded,
        lastCoursesFetch: state.lastCoursesFetch
      }),
    }
  )
)
