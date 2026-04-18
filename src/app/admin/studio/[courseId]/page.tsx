import CourseDetailPage from './course-detail-client'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function CourseDetailServerPage({ params }: PageProps) {
  const { courseId } = await params

  return (
    <CourseDetailPage
      courseId={courseId}
      initialCourse={null}
      initialStructure={[]}
    />
  )
}
