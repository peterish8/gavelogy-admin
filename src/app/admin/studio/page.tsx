import StudioClient from './studio-client'
import { fetchQuery } from 'convex/nextjs'
import { api } from '@convex/_generated/api'

// Studio landing server page that fetches the course list once and hands it to the client studio shell.
export default async function StudioPage() {
  const courses = await fetchQuery(api.admin.getAllCourses, {})
  return <StudioClient initialCourses={courses.map((course: any) => ({ ...course, id: course._id }))} />
}
