'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import RichTextEditor from '@/components/editors/rich-text-editor'
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export default function EditNotePage({ params }: { params: Promise<{ caseNumber: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const caseNumberDecoded = decodeURIComponent(resolvedParams.caseNumber)

  const noteData = useQuery(api.caseNotes.getCaseNote, { case_number: caseNumberDecoded })
  const updateCaseNote = useMutation(api.caseNotes.updateCaseNote)
  const deleteCaseNote = useMutation(api.caseNotes.deleteCaseNote)

  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState('')
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!initialized && noteData !== undefined) {
      if (noteData) {
        setContent(noteData.overall_content ?? '')
      } else {
        toast.error('Note not found')
        router.push('/admin/notes')
      }
      setInitialized(true)
    }
  }, [noteData, initialized, router])

  const handleUpdate = async () => {
    if (!content.trim()) {
      toast.error('Content is required')
      return
    }
    setLoading(true)
    try {
      await updateCaseNote({ case_number: caseNumberDecoded, overall_content: content })
      toast.success('Note updated successfully')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update note')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      await deleteCaseNote({ case_number: caseNumberDecoded })
      toast.success('Note deleted successfully')
      router.push('/admin/notes')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete note')
      setLoading(false)
    }
  }

  if (noteData === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/notes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Edit Note: {caseNumberDecoded}</h1>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={loading}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the case note
                  for <strong>{caseNumberDecoded}</strong>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-error hover:bg-error/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
          <Button onClick={handleUpdate} disabled={loading} className="gap-2">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="space-y-2">
          <Label htmlFor="case-number">Case Number</Label>
          <Input
            id="case-number"
            value={caseNumberDecoded}
            disabled
            className="max-w-md font-mono bg-muted"
          />
          <p className="text-xs text-muted-foreground">
            Case number cannot be changed once created.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Content</Label>
          <RichTextEditor
            content={content}
            onChange={setContent}
          />
        </div>
      </div>
    </div>
  )
}
