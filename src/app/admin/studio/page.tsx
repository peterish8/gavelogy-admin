import { createClient } from '@/lib/supabase/server'
import StudioClient from './studio-client'

export default async function StudioPage() {
  const supabase = await createClient()
  
  // Fetch courses on the server (reliable, like Dashboard)
  const { data: courses, error } = await supabase
    .from('courses')
    .select('*')
    .order('order_index', { ascending: true })
  
  if (error) {
    console.error('Server: Failed to fetch courses', error.message)
  }
  
  return <StudioClient initialCourses={courses || []} />
}
