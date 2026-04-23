import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{
    courseId: string
    itemId: string
  }>
}

export default async function ContentEditorPage(props: PageProps) {
  const params = await props.params;
  const { itemId } = params;

  // Redirect to the working notes editor
  redirect(`/admin/notes/edit/${itemId}`)
}
