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
  
  // Hydration tracking (kept for compatibility but not used without persist)
  _hasHydrated: boolean
  setHasHydrated: (state: boolean) => void
}

// SIMPLIFIED: Removed persist middleware to test if localStorage is causing issues
export const useCourseStore = create<CourseStore>((set) => ({
  courses: [],
  coursesLoaded: false,
  lastCoursesFetch: 0,
  courseDetails: {},
  structures: {},
  _hasHydrated: true, // Always true without persist

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
  }),
  
  setHasHydrated: () => {}, // No-op without persist
}))

