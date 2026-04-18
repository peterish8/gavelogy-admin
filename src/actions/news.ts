'use server'

import { customToHtml } from '@/lib/content-converter'
import { fetchQuery, fetchMutation } from 'convex/nextjs'
import { api } from '@convex/_generated/api'
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server'

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
  _id?: string
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
  const token = await convexAuthNextjsToken();
  const data = await fetchQuery(api.adminQueries.getNewsGroupedByDate, {}, { token });
  return data;
}

export async function fetchNewsByDate(date: string): Promise<NewsCard[]> {
  const token = await convexAuthNextjsToken();
  const data = await fetchQuery(api.adminQueries.getNewsByDate, { date }, { token });
  return data as any;
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export async function saveNewsCards(
  cards: Omit<NewsCard, 'id' | 'content_html' | 'created_at' | 'updated_at'>[],
  status: 'draft' | 'published' = 'draft'
): Promise<{ ids: string[] }> {
  const token = await convexAuthNextjsToken();

  const rows = cards.map((card, i) => ({
    date: card.date,
    title: card.title,
    content_custom: card.content_custom,
    content_html: card.content_custom ? customToHtml(card.content_custom) : undefined,
    summary: card.summary,
    keywords: card.keywords,
    category: card.category,
    source_paper: card.source_paper,
    subject: card.subject ?? undefined,
    topic: card.topic ?? undefined,
    court: card.court ?? undefined,
    priority: card.priority ?? undefined,
    exam_probability: card.exam_probability ?? undefined,
    capsule: card.capsule ?? undefined,
    facts: card.facts ?? undefined,
    provisions: card.provisions ?? undefined,
    holdings: card.holdings ?? undefined,
    doctrine: card.doctrine ?? undefined,
    mcqs: card.mcqs ?? undefined,
    source_url: (card as any).source_url ?? undefined,
    read_seconds: (card as any).read_seconds ?? undefined,
    exam_rank: (card as any).exam_rank ?? undefined,
    status,
    display_order: i,
  }));

  const insertedIds = await fetchMutation(api.adminMutations.createDailyNews, { rows }, { token });
  return { ids: insertedIds };
}

export async function updateNewsCard(
  id: string,
  patch: Partial<Pick<NewsCard, 'title' | 'content_custom' | 'summary' | 'keywords' | 'category' | 'status'>>
): Promise<void> {
  const token = await convexAuthNextjsToken();

  const update: any = { ...patch };
  if (patch.content_custom !== undefined) {
    update.content_html = customToHtml(patch.content_custom);
  }

  await fetchMutation(api.adminMutations.updateDailyNews, { id, patch: update }, { token });
}

export async function publishNewsCards(ids: string[]): Promise<void> {
  const token = await convexAuthNextjsToken();
  await fetchMutation(api.adminMutations.bulkPublishNews, { ids, status: 'published' }, { token });
}

export async function unpublishNewsCards(ids: string[]): Promise<void> {
  const token = await convexAuthNextjsToken();
  await fetchMutation(api.adminMutations.bulkPublishNews, { ids, status: 'draft' }, { token });
}

export async function deleteNewsCard(id: string): Promise<void> {
  const token = await convexAuthNextjsToken();
  await fetchMutation(api.adminMutations.deleteDailyNews, { id }, { token });
}
