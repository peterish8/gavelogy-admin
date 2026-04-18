'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'

export default function CreateQuizPage() {
  const router = useRouter()
  const rawSubjects = useQuery(api.quizzes.getAllSubjects, {})
  const createQuiz = useMutation(api.quizzes.createQuiz)

  const subjects = (rawSubjects ?? []).map((s: any) => ({ id: s._id as string, name: s.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subject_id: '',
    order_index: 0
  })

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!formData.subject_id) {
      toast.error('Subject is required')
      return
    }

    setLoading(true)
    try {
      const newId = await createQuiz({
        title: formData.title,
        description: formData.description || undefined,
        subject_id: formData.subject_id as Id<'subjects'>,
        order_index: formData.order_index,
      })
      toast.success('Quiz created successfully')
      router.push(`/admin/quizzes/${newId}/edit`)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to create quiz')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/quizzes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Create New Quiz</h1>
        </div>
        <Button onClick={handleSave} disabled={loading} className="gap-2">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Create & Add Questions
        </Button>
      </div>

      <div className="grid gap-6 bg-card p-6 rounded-lg border border-border">
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Select 
            value={formData.subject_id} 
            onValueChange={(val) => setFormData({...formData, subject_id: val})}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Quiz Title</Label>
          <Input
            id="title"
            placeholder="e.g. Constitutional Law - Part 1"
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description (Optional)</Label>
          <Textarea
            id="description"
            placeholder="Brief description of what this quiz covers..."
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="order">Order Index</Label>
          <Input
            id="order"
            type="number"
            value={formData.order_index}
            onChange={(e) => setFormData({...formData, order_index: parseInt(e.target.value) || 0})}
            className="max-w-[150px]"
          />
          <p className="text-xs text-muted-foreground">
            Controls the display order of quizzes within a subject.
          </p>
        </div>
      </div>
    </div>
  )
}
