'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface NotePdfLink {
  id: string
  item_id: string
  link_id: string
  pdf_page: number
  x: number
  y: number
  width: number
  height: number
  label: string | null
  created_at: string
}

export interface CaseItem {
  id: string
  title: string
  item_type: string
  pdf_url: string | null
  created_at: string
}

export async function fetchLinksForItem(itemId: string): Promise<NotePdfLink[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('note_pdf_links')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function checkItemHasPdf(itemId: string): Promise<string | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('structure_items')
    .select('pdf_url')
    .eq('id', itemId)
    .single()
  if (error || !data) return null
  return (data as any).pdf_url || null
}

export async function insertLink(payload: {
  item_id: string
  link_id: string
  pdf_page: number
  x: number
  y: number
  width: number
  height: number
  label?: string
}): Promise<NotePdfLink> {
  const adminClient = getAdminClient()
  const { data, error } = await adminClient
    .from('note_pdf_links')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateLinkLabel(id: string, label: string): Promise<void> {
  const adminClient = getAdminClient()
  const { error } = await adminClient
    .from('note_pdf_links')
    .update({ label })
    .eq('id', id)
  if (error) throw error
}

export async function deleteLink(id: string): Promise<void> {
  const adminClient = getAdminClient()
  const { error } = await adminClient
    .from('note_pdf_links')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function updateItemPdfUrl(itemId: string, pdfUrl: string): Promise<void> {
  const adminClient = getAdminClient()
  const { error } = await adminClient
    .from('structure_items')
    .update({ pdf_url: pdfUrl })
    .eq('id', itemId)
  if (error) throw error
}

export async function fetchAllCaseItems(): Promise<CaseItem[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('structure_items')
    .select('id, title, item_type, pdf_url, created_at')
    .or('title.ilike.CS-%,title.ilike.CQ-%,title.ilike.CR-%')
    .order('title')
  if (error) throw error
  return (data || []) as CaseItem[]
}

export async function clearItemPdfUrl(itemId: string): Promise<void> {
  const adminClient = getAdminClient()
  const { error } = await adminClient
    .from('structure_items')
    .update({ pdf_url: null })
    .eq('id', itemId)
  if (error) throw error
}

export async function fetchLinkCountsForItems(
  itemIds: string[]
): Promise<Record<string, number>> {
  if (itemIds.length === 0) return {}
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('note_pdf_links')
    .select('item_id')
    .in('item_id', itemIds)
  if (error) return {}
  const counts: Record<string, number> = {}
  for (const row of data || []) {
    counts[row.item_id] = (counts[row.item_id] || 0) + 1
  }
  return counts
}
