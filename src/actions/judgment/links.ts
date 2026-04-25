'use server'

import { fetchMutation, fetchQuery } from 'convex/nextjs'
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'

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

function mapLink(link: any): NotePdfLink {
  return {
    id: link._id,
    item_id: link.itemId,
    link_id: link.link_id,
    pdf_page: link.pdf_page,
    x: link.x,
    y: link.y,
    width: link.width,
    height: link.height,
    label: link.label ?? null,
    created_at: new Date(link._creationTime).toISOString(),
  }
}

async function getToken() {
  return await convexAuthNextjsToken()
}

export async function fetchLinksForItem(itemId: string): Promise<NotePdfLink[]> {
  const data = await fetchQuery(api.content.getNotePdfLinks, {
    itemId: itemId as Id<'structure_items'>,
  })
  return data.map(mapLink)
}

export async function checkItemHasPdf(itemId: string): Promise<string | null> {
  const item = await fetchQuery(api.content.getStructureItem, {
    itemId: itemId as Id<'structure_items'>,
  })
  return item?.pdf_url ?? null
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
  const token = await getToken()
  const linkId = await fetchMutation(
    api.content.createNotePdfLink,
    {
      itemId: payload.item_id as Id<'structure_items'>,
      link_id: payload.link_id,
      pdf_page: payload.pdf_page,
      x: payload.x,
      y: payload.y,
      width: payload.width,
      height: payload.height,
      label: payload.label,
    },
    token ? { token } : undefined
  )

  return {
    id: linkId,
    item_id: payload.item_id,
    link_id: payload.link_id,
    pdf_page: payload.pdf_page,
    x: payload.x,
    y: payload.y,
    width: payload.width,
    height: payload.height,
    label: payload.label ?? null,
    created_at: new Date().toISOString(),
  }
}

export async function updateLinkLabel(id: string, label: string): Promise<void> {
  const token = await getToken()
  await fetchMutation(
    api.admin.updateNotePdfLinkLabel,
    { linkId: id as Id<'note_pdf_links'>, label },
    token ? { token } : undefined
  )
}

export async function updateLinkRegion(payload: {
  id: string
  pdf_page: number
  x: number
  y: number
  width: number
  height: number
}): Promise<void> {
  const token = await getToken()
  await fetchMutation(
    (api as any).admin.updateNotePdfLinkRegion,
    {
      linkId: payload.id as Id<'note_pdf_links'>,
      pdf_page: payload.pdf_page,
      x: payload.x,
      y: payload.y,
      width: payload.width,
      height: payload.height,
    },
    token ? { token } : undefined
  )
}

export async function deleteLink(id: string): Promise<void> {
  const token = await getToken()
  await fetchMutation(
    api.content.deleteNotePdfLink,
    { linkId: id as Id<'note_pdf_links'> },
    token ? { token } : undefined
  )
}

export async function updateItemPdfUrl(itemId: string, pdfUrl: string): Promise<void> {
  const token = await getToken()
  await fetchMutation(
    api.content.updateStructureItemPdf,
    {
      itemId: itemId as Id<'structure_items'>,
      pdf_url: pdfUrl,
    },
    token ? { token } : undefined
  )
}

export async function fetchAllCaseItems(): Promise<CaseItem[]> {
  const data = await fetchQuery(api.admin.getCaseItemsForTagging, {})
  return data.map((item: any) => ({
    id: item._id,
    title: item.title,
    item_type: item.item_type,
    pdf_url: item.pdf_url ?? null,
    created_at: new Date(item._creationTime).toISOString(),
  }))
}

export async function clearItemPdfUrl(itemId: string): Promise<void> {
  const token = await getToken()
  await fetchMutation(
    api.content.updateStructureItemPdf,
    {
      itemId: itemId as Id<'structure_items'>,
      pdf_url: '',
    },
    token ? { token } : undefined
  )
}

export async function fetchLinkCountsForItems(
  itemIds: string[]
): Promise<Record<string, number>> {
  if (itemIds.length === 0) return {}
  return fetchQuery(api.admin.getNotePdfLinkCountsForItems, { itemIds })
}
