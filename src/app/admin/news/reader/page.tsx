import { Suspense } from 'react'
import { fetchNewsByDate, fetchNewsGroupedByDate } from '@/actions/news'
import GavelogyReader from './GavelogyReader'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{ date?: string }>
}

export default async function GavelogyReaderPage({ searchParams }: PageProps) {
  const params = await searchParams

  // Determine which date to show — default to latest date with published articles
  let targetDate = params.date
  if (!targetDate) {
    const groups = await fetchNewsGroupedByDate()
    const latestPublished = groups.find(g => g.published > 0)
    targetDate = latestPublished?.date
  }

  const cards = targetDate ? await fetchNewsByDate(targetDate) : []
  const published = cards.filter(c => c.status === 'published')

  return (
    <>
      {/* Tiny admin dev bar — hidden in production via CSS */}
      <div className="gavelogy-devbar">
        <Link href="/admin/news" className="gavelogy-devbar-link">
          <ArrowLeft size={12} />
          Admin News
        </Link>
        <span className="gavelogy-devbar-sep">·</span>
        <span className="gavelogy-devbar-label">
          Student Reader Preview — {targetDate ?? 'no date'}
        </span>
        <span className="gavelogy-devbar-sep">·</span>
        <span className="gavelogy-devbar-label">
          {published.length}/{cards.length} published
        </span>
      </div>

      <Suspense fallback={null}>
        <GavelogyReader
          cards={published}
          date={targetDate ?? ''}
          sourcePaper={published[0]?.source_paper ?? 'The Hindu'}
        />
      </Suspense>
    </>
  )
}
