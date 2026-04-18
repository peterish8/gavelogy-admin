'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, EyeOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { publishNewsCards, unpublishNewsCards, deleteNewsCard } from '@/actions/news'

interface Props {
  cardId: string
  status: 'draft' | 'published'
}

// Per-article action bar with publish/unpublish toggle and delete; refreshes the page on success via router.refresh().
export default function NewsListActions({ cardId, status }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // Switches the article between draft and published states, showing a toast for each outcome.
  async function togglePublish() {
    setLoading(true)
    try {
      if (status === 'published') {
        await unpublishNewsCards([cardId])
        toast.success('Article moved back to draft')
      } else {
        await publishNewsCards([cardId])
        toast.success('Article published')
      }
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Confirms then permanently deletes the article row.
  async function handleDelete() {
    if (!confirm('Delete this article? This cannot be undone.')) return
    setLoading(true)
    try {
      await deleteNewsCard(cardId)
      toast.success('Article deleted')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={togglePublish}
        disabled={loading}
        className={`flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
          status === 'published'
            ? 'text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30'
            : 'text-green-600 dark:text-green-400 border border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-950/30'
        }`}
      >
        {status === 'published' ? <EyeOff className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
        {status === 'published' ? 'Unpublish' : 'Publish'}
      </button>
      <button
        onClick={handleDelete}
        disabled={loading}
        className="flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
