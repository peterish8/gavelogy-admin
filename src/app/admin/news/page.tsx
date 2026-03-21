import Link from 'next/link'
import { Newspaper, Plus, ArrowLeft, BookOpen } from 'lucide-react'
import { fetchNewsGroupedByDate, fetchNewsByDate, type NewsCard } from '@/actions/news'
import NewsCarousel from './NewsCarousel'
import NewsCalendarView from './NewsCalendarView'

interface PageProps {
  searchParams: Promise<{ date?: string }>
}


function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function NewsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const selectedDate = params.date

  const groups = await fetchNewsGroupedByDate()
  const cards: NewsCard[] = selectedDate ? await fetchNewsByDate(selectedDate) : []

  // ── Expanded single-date view (carousel) ─────────────────────────────────
  if (selectedDate) {
    const sourcePaper = cards[0]?.source_paper || ''
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Link href="/admin/news" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              All dates
            </Link>
            <div className="w-px h-4 bg-border" />
            <h1 className="text-base font-semibold">{formatDate(selectedDate)}</h1>
            {cards.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">{cards.length} article{cards.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {cards.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No articles for this date.</p>
            </div>
          ) : (
            <NewsCarousel cards={cards} date={selectedDate} sourcePaper={sourcePaper} />
          )}
        </div>
      </div>
    )
  }

  // ── Timeline list view ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <Newspaper className="w-6 h-6" />
              Daily News
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Law-related news extracted from newspapers for students</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/news/reader"
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold border border-border hover:bg-muted transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Student View
            </Link>
            <Link
              href="/admin/news/new"
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Process Newspaper
            </Link>
          </div>
        </div>

{/* Empty state */}
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Newspaper className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No news processed yet</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Upload a newspaper PDF to extract and highlight law-related news articles for students.
            </p>
            <Link
              href="/admin/news/new"
              className="flex items-center gap-2 h-9 px-5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Process First Newspaper
            </Link>
          </div>
        )}

        {/* Calendar view */}
        {groups.length > 0 && (
          <NewsCalendarView groups={groups} selectedDate={selectedDate} />
        )}
      </div>
    </div>
  )
}
