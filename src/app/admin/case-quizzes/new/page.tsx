'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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

export default function NewCaseQuizPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    case_name: '',
    case_number: '',
    passage: '',
    question: '',
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    correct_answer: 'A',
    explanation: ''
  })

  const handleSave = async () => {
    if (!formData.case_number.trim()) {
      toast.error('Case number is required')
      return
    }
    if (!formData.question.trim()) {
      toast.error('Question is required')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('contemporary_case_quizzes')
        .insert({
          ...formData,
          // Generate a random ID for case_question_id if needed, or let DB handle it
          case_question_id: crypto.randomUUID()
        })

      if (error) throw error

      toast.success('Case quiz question added successfully')
      router.push('/admin/case-quizzes')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to create case quiz')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/case-quizzes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Add Case Quiz Question</h1>
        </div>
        <Button onClick={handleSave} disabled={loading} className="gap-2">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Question
        </Button>
      </div>

      <div className="grid gap-6 bg-card p-6 rounded-lg border border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="case_number">Case Number</Label>
            <Input
              id="case_number"
              placeholder="e.g. CS-24-01"
              value={formData.case_number}
              onChange={(e) => setFormData({...formData, case_number: e.target.value})}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="case_name">Case Name</Label>
            <Input
              id="case_name"
              placeholder="e.g. Kesavananda Bharati v. State of Kerala"
              value={formData.case_name}
              onChange={(e) => setFormData({...formData, case_name: e.target.value})}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="passage">Passage (Optional)</Label>
          <Textarea
            id="passage"
            placeholder="Enter the passage text if this is a passage-based question..."
            value={formData.passage}
            onChange={(e) => setFormData({...formData, passage: e.target.value})}
            rows={4}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="question">Question</Label>
          <Textarea
            id="question"
            placeholder="Enter the question text..."
            value={formData.question}
            onChange={(e) => setFormData({...formData, question: e.target.value})}
            rows={3}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Option A</Label>
            <Input 
              value={formData.option_a}
              onChange={(e) => setFormData({...formData, option_a: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <Label>Option B</Label>
            <Input 
              value={formData.option_b}
              onChange={(e) => setFormData({...formData, option_b: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <Label>Option C</Label>
            <Input 
              value={formData.option_c}
              onChange={(e) => setFormData({...formData, option_c: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <Label>Option D</Label>
            <Input 
              value={formData.option_d}
              onChange={(e) => setFormData({...formData, option_d: e.target.value})}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Correct Answer</Label>
          <Select 
            value={formData.correct_answer} 
            onValueChange={(val) => setFormData({...formData, correct_answer: val})}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">Option A</SelectItem>
              <SelectItem value="B">Option B</SelectItem>
              <SelectItem value="C">Option C</SelectItem>
              <SelectItem value="D">Option D</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="explanation">Explanation</Label>
          <Textarea
            id="explanation"
            placeholder="Explain the answer..."
            value={formData.explanation}
            onChange={(e) => setFormData({...formData, explanation: e.target.value})}
            rows={3}
          />
        </div>
      </div>
    </div>
  )
}
