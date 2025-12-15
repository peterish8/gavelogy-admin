'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import RichTextEditor from '@/components/editors/rich-text-editor'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'

export default function CreateNotePage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(false)
  const [caseNumber, setCaseNumber] = useState('')
  const [content, setContent] = useState('')

  const handleSave = async () => {
    if (!caseNumber.trim()) {
      toast.error('Case number is required')
      return
    }
    if (!content.trim()) {
      toast.error('Content is required')
      return
    }

    // Validate format: CS-YY-XX or CS-YY-S-XX
    const caseNumberRegex = /^CS-\d{2}-[A-Z0-9-]+$/
    if (!caseNumberRegex.test(caseNumber)) {
      toast.error('Invalid case number format. Expected CS-YY-XX (e.g., CS-24-01)')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('contemprory_case_notes')
        .insert({
          case_number: caseNumber,
          overall_content: content
        })

      if (error) throw error

      toast.success('Note created successfully')
      router.push('/admin/notes')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to create note')
    } finally {
      setLoading(false)
    }
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
          <h1 className="text-3xl font-bold text-foreground">Create New Note</h1>
        </div>
        <Button onClick={handleSave} disabled={loading} className="gap-2">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Note
        </Button>
      </div>

      <div className="grid gap-6">
        <div className="space-y-2">
          <Label htmlFor="case-number">Case Number</Label>
          <Input
            id="case-number"
            placeholder="e.g. CS-24-01"
            value={caseNumber}
            onChange={(e) => setCaseNumber(e.target.value)}
            className="max-w-md font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Format: CS-YY-XX or CS-YY-S-XX (e.g., CS-24-01, CS-25-A-01)
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
