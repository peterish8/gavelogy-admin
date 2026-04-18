import { fetchLinksForItem } from '@/actions/judgment/links'
import { redirect } from 'next/navigation'
import NoteJudgmentEditor from './NoteJudgmentEditor'
import { fetchQuery } from 'convex/nextjs'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'

interface Props {
  params: Promise<{ caseId: string }>
}

// Server page: loads the case item, its PDF proxy URL, existing tag links, and note content, then renders NoteJudgmentEditor.
export default async function TaggingPage({ params }: Props) {
  const { caseId } = await params
  const [item, noteContent] = await Promise.all([
    fetchQuery(api.content.getStructureItem, { itemId: caseId as Id<'structure_items'> }),
    fetchQuery(api.content.getNoteContent, { itemId: caseId as Id<'structure_items'> }),
  ])

  if (!item) redirect('/admin/tag')

  // Use the proxy URL — server fetches from B2, browser gets it same-origin (no CORS)
  const pdfProxyUrl = item.pdf_url ? `/api/judgment/pdf-proxy?itemId=${caseId}` : null

  const existingLinks = await fetchLinksForItem(caseId)

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
