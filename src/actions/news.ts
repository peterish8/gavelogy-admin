'use server'

import { createClient } from '@supabase/supabase-js'
import { customToHtml } from '@/lib/content-converter'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Provision {
  provision: string
  interpretation: string
}

export interface Holding {
  label: string           // H1, H2, H3 or O1, O2, O3
  type: 'ratio' | 'obiter'
  core: boolean
  text: string
}

export interface Doctrine {
  name: string
  status: string
  overruled: string
  distinguished_from: string
  relied_upon: string[]
  lineage_chain: string
}

export interface McqItem {
  type: 'case_recall' | 'statement_evaluation' | 'application'
  difficulty: 'easy' | 'medium' | 'hard'
  question: string
  options: string[]
  answer: string
  explanation: string
  holding_ref: string
}

export interface NewsCard {
  id?: string
  date: string
  title: string
  content_custom: string  // raw [tag] format (legacy, kept for edit mode)
  content_html?: string   // derived HTML
  // Gavelogy 7-field note structure
  subject?: string        // e.g. "Constitutional Law"
  topic?: string          // e.g. "Article 19(1)(a) — Freedom of Speech"
  court?: string
  priority?: 'HIGH' | 'MEDIUM' | 'LOW'
  exam_probability?: string
  capsule?: string        // one-line summary
  facts?: string[]        // 3 sentences
  provisions?: Provision[]
  holdings?: Holding[]
  doctrine?: Doctrine
  // Legacy fields kept for backward compat
  summary: string
  keywords: string[]
  category: string
  source_paper: string
  status?: 'draft' | 'published'
  display_order?: number
  page_image?: string
  mcqs?: McqItem[]
  // New reader fields
  source_url?: string      // direct link to article
  read_seconds?: number    // estimated read time (45–60 sec)
  exam_rank?: number       // 1 = highest priority article for that day
  created_at?: string
  updated_at?: string
}

export interface NewsDateGroup {
  date: string
  total: number
  published: number
  draft: number
  source_paper: string | null
}

// ─── Queries ───────────────────────────────────────────────────────────────

export async function fetchNewsGroupedByDate(): Promise<NewsDateGroup[]> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('daily_news')
    .select('date, status, source_paper')
    .order('date', { ascending: false })

  // Table may not exist yet — return empty list rather than crashing
  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes('daily_news')) return []
    throw error
  }

  const map = new Map<string, NewsDateGroup>()
  for (const row of data || []) {
    const key = row.date as string
    if (!map.has(key)) {
      map.set(key, { date: key, total: 0, published: 0, draft: 0, source_paper: row.source_paper })
    }
    const group = map.get(key)!
    group.total++
    if (row.status === 'published') group.published++
    else group.draft++
  }
  return Array.from(map.values())
}

export async function fetchNewsByDate(date: string): Promise<NewsCard[]> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('daily_news')
    .select('*')
    .eq('date', date)
    .order('display_order')

  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes('daily_news')) return []
    throw error
  }
  return (data || []) as NewsCard[]
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export async function saveNewsCards(
  cards: Omit<NewsCard, 'id' | 'content_html' | 'created_at' | 'updated_at'>[],
  status: 'draft' | 'published' = 'draft'
): Promise<{ ids: string[] }> {
  const supabase = getAdminClient()

  const rows = cards.map((card, i) => ({
    date: card.date,
    title: card.title,
    content_custom: card.content_custom,
    content_html: card.content_custom ? customToHtml(card.content_custom) : null,
    summary: card.summary,
    keywords: card.keywords,
    category: card.category,
    source_paper: card.source_paper,
    // New 7-field structure
    subject: card.subject ?? null,
    topic: card.topic ?? null,
    court: card.court ?? null,
    priority: card.priority ?? null,
    exam_probability: card.exam_probability ?? null,
    capsule: card.capsule ?? null,
    facts: card.facts ?? null,
    provisions: card.provisions ?? null,
    holdings: card.holdings ?? null,
    doctrine: card.doctrine ?? null,
    mcqs: card.mcqs ?? null,
    // Reader fields
    source_url: (card as any).source_url ?? null,
    read_seconds: (card as any).read_seconds ?? null,
    exam_rank: (card as any).exam_rank ?? null,
    status,
    display_order: i,
  }))

  let { data, error } = await supabase
    .from('daily_news')
    .insert(rows)
    .select('id')

  // If a new column doesn't exist yet, retry with only the base columns
  if (error && error.code === '42703') {
    const baseRows = rows.map(r => ({
      date: r.date, title: r.title, content_custom: r.content_custom,
      content_html: r.content_html, summary: r.summary, keywords: r.keywords,
      category: r.category, source_paper: r.source_paper,
      mcqs: r.mcqs, status: r.status, display_order: r.display_order,
    }))
    const retry = await supabase.from('daily_news').insert(baseRows).select('id')
    if (retry.error) throw retry.error
    data = retry.data
    error = null
  }

  if (error) throw error
  return { ids: (data || []).map((r: any) => r.id) }
}

export async function updateNewsCard(
  id: string,
  patch: Partial<Pick<NewsCard, 'title' | 'content_custom' | 'summary' | 'keywords' | 'category' | 'status'>>
): Promise<void> {
  const supabase = getAdminClient()

  const update: Record<string, any> = { ...patch }
  if (patch.content_custom !== undefined) {
    update.content_html = customToHtml(patch.content_custom)
  }

  const { error } = await supabase
    .from('daily_news')
    .update(update)
    .eq('id', id)

  if (error) throw error
}

export async function publishNewsCards(ids: string[]): Promise<void> {
  const supabase = getAdminClient()
  const { error } = await supabase
    .from('daily_news')
    .update({ status: 'published' })
    .in('id', ids)

  if (error) throw error
}

export async function unpublishNewsCards(ids: string[]): Promise<void> {
  const supabase = getAdminClient()
  const { error } = await supabase
    .from('daily_news')
    .update({ status: 'draft' })
    .in('id', ids)

  if (error) throw error
}

export async function deleteNewsCard(id: string): Promise<void> {
  const supabase = getAdminClient()
  const { error } = await supabase
    .from('daily_news')
    .delete()
    .eq('id', id)

  if (error) throw error
}
