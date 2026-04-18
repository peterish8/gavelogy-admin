'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'

import { useMutation } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { cn } from '@/lib/utils'

interface DeletePyqButtonProps {
  testId: string
  testTitle: string
  variant?: 'card' | 'header'
  onDeletedRedirectTo?: string
}

export function DeletePyqButton({
  testId,
  testTitle,
  variant = 'card',
  onDeletedRedirectTo,
}: DeletePyqButtonProps) {
  const router = useRouter()
  const deletePyqTest = useMutation(api.pyq.deletePyqTest)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete "${testTitle}"?\n\nThis will permanently remove the PYQ test, its passages, and all linked questions.`)
    if (!confirmed) return

    setIsDeleting(true)
    try {
      await deletePyqTest({ testId: testId as Id<'pyq_tests'> })
      if (onDeletedRedirectTo) {
        router.push(onDeletedRedirectTo)
      } else {
        router.refresh()
      }
    } catch (e: any) {
      window.alert(`Delete failed: ${e.message || 'Unknown error'}`)
    } finally {
      setIsDeleting(false)
    }
  }

  if (variant === 'header') {
    return (
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl border transition-colors',
          'text-red-600 border-red-300 hover:bg-red-50 disabled:opacity-50'
        )}
      >
        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        Delete Test
      </button>
    )
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
    >
      {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      Delete
    </button>
  )
}
