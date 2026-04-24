import CreatorDetailClient from './creator-detail-client'
import { fetchQuery } from 'convex/nextjs'
import { api } from '@convex/_generated/api'
import { notFound } from 'next/navigation'

export default async function CreatorDetailPage({ params }: { params: { userId: string } }) {
  try {
    const creatorData = await fetchQuery(api.adminQueries.getCoursesByCreator, { userId: params.userId as any })
    const revenueData = await fetchQuery(api.adminQueries.getCreatorRevenue, { userId: params.userId as any })
    if (!creatorData.creator) {
      notFound()
    }
    return <CreatorDetailClient initialData={creatorData} initialRevenue={revenueData} />
  } catch (error) {
    notFound()
  }
}
