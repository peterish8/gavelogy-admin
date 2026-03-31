import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import CourseDetailPage from './course-detail-client'

interface PageProps {
  params: Promise<{ courseId: string }>
}

// Server page: pre-fetches course metadata and flat structure items in parallel, then seeds the client component.
export default async function CourseDetailServerPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = await createClient()

  // Fetch course and structure in parallel (server-side, instant with middleware)
  const [courseResult, structureResult] = await Promise.all([
    supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .maybeSingle(),
    supabase
      .from('structure_items')
      .select(`
        *,
        note_content:note_contents(id)
      `)
      .eq('course_id', courseId)
      .order('order_index', { ascending: true })
  ])

  if (courseResult.error || !courseResult.data) {
    notFound()
  }

  return (
    <CourseDetailPage
      courseId={courseId}
      initialCourse={courseResult.data}
      initialStructure={structureResult.data || []}
    />
  )
}
