import { createClient } from '@/lib/supabase/server'
import { fetchLinksForItem } from '@/actions/judgment/links'
import { redirect } from 'next/navigation'
import NoteJudgmentEditor from './NoteJudgmentEditor'

interface Props {
  params: Promise<{ caseId: string }>
}

export default async function TaggingPage({ params }: Props) {
  const { caseId } = await params
  const supabase = await createClient()

  const { data: item, error } = await supabase
    .from('structure_items')
    .select('id, title, pdf_url')
    .eq('id', caseId)
    .single()

  if (error || !item) redirect('/admin/tag')

  // Use the proxy URL — server fetches from B2, browser gets it same-origin (no CORS)
  const pdfProxyUrl = item.pdf_url ? `/api/judgment/pdf-proxy?itemId=${caseId}` : null

  const existingLinks = await fetchLinksForItem(caseId)

  const { data: noteContent } = await supabase
    .from('note_contents')
    .select('content_html')
    .eq('item_id', caseId)
    .single()

  return (
    <NoteJudgmentEditor
      caseId={caseId}
      caseTitle={item.title}
      initialSignedUrl={pdfProxyUrl}
      initialLinks={existingLinks}
      noteContentHtml={noteContent?.content_html || ''}
    />
  )
}
