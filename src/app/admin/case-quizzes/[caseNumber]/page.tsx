'use client'

import { useState, useEffect, use } from 'react'
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Save, Trash2, Pencil, Plus } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

interface CaseQuestion {
  id: string
  case_name: string
  case_number: string
  passage: string | null
  question: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: 'A' | 'B' | 'C' | 'D'
  explanation: string | null
}

export default function CaseQuizDetailsPage({ params }: { params: Promise<{ caseNumber: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const supabase = createClient()
  const caseNumber = decodeURIComponent(resolvedParams.caseNumber)
  
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [questions, setQuestions] = useState<CaseQuestion[]>([])
  const [caseName, setCaseName] = useState('')

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<CaseQuestion | null>(null)

  useEffect(() => {
    fetchQuestions()
  }, [caseNumber])

  const fetchQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('contemporary_case_quizzes')
        .select('*')
        .eq('case_number', caseNumber)
        .order('created_at', { ascending: true })

      if (error) throw error
      
      if (data && data.length > 0) {
        setQuestions(data as CaseQuestion[])
        setCaseName(data[0].case_name)
      }
    } catch (error) {
      toast.error('Failed to load questions')
    } finally {
      setFetching(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return

    try {
      const { error } = await supabase
        .from('contemporary_case_quizzes')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('Question deleted')
      
      // If last question deleted, redirect to list
      if (questions.length <= 1) {
        router.push('/admin/case-quizzes')
      } else {
        fetchQuestions()
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete question')
    }
  }

  const handleUpdate = async () => {
    if (!editingQuestion) return
    
    setLoading(true)
    try {
      const { error } = await supabase
        .from('contemporary_case_quizzes')
        .update({
          case_name: editingQuestion.case_name,
          passage: editingQuestion.passage,
          question: editingQuestion.question,
          option_a: editingQuestion.option_a,
          option_b: editingQuestion.option_b,
          option_c: editingQuestion.option_c,
          option_d: editingQuestion.option_d,
          correct_answer: editingQuestion.correct_answer,
          explanation: editingQuestion.explanation
        })
        .eq('id', editingQuestion.id)

      if (error) throw error
      
      toast.success('Question updated')
      setIsEditModalOpen(false)
      fetchQuestions()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update question')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/case-quizzes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{caseNumber}</h1>
            <p className="text-muted-foreground">{caseName}</p>
          </div>
        </div>
        <Link href="/admin/case-quizzes/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Question
          </Button>
        </Link>
      </div>

      <div className="space-y-6">
        {questions.map((q, index) => (
          <Card key={q.id} className="relative group">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-1">#{index + 1}</Badge>
                  <div className="space-y-2">
                    {q.passage && (
                      <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md mb-2 italic border-l-2 border-primary/20">
                        {q.passage.substring(0, 150)}...
                      </div>
                    )}
                    <CardTitle className="text-base font-medium leading-relaxed">
                      {q.question}
                    </CardTitle>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => {
                      setEditingQuestion(q)
                      setIsEditModalOpen(true)
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-error hover:text-error hover:bg-error/10" 
                    onClick={() => handleDelete(q.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm mt-2">
                <div className={q.correct_answer === 'A' ? 'text-success font-medium' : 'text-muted-foreground'}>
                  A) {q.option_a}
                </div>
                <div className={q.correct_answer === 'B' ? 'text-success font-medium' : 'text-muted-foreground'}>
                  B) {q.option_b}
                </div>
                <div className={q.correct_answer === 'C' ? 'text-success font-medium' : 'text-muted-foreground'}>
                  C) {q.option_c}
                </div>
                <div className={q.correct_answer === 'D' ? 'text-success font-medium' : 'text-muted-foreground'}>
                  D) {q.option_d}
                </div>
              </div>
              {q.explanation && (
                <div className="mt-4 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Explanation: </span>
                  {q.explanation}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Question</DialogTitle>
          </DialogHeader>
          
          {editingQuestion && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Case Name</Label>
                  <Input 
                    value={editingQuestion.case_name}
                    onChange={(e) => setEditingQuestion({...editingQuestion, case_name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Passage</Label>
                  <Textarea 
                    value={editingQuestion.passage || ''}
                    onChange={(e) => setEditingQuestion({...editingQuestion, passage: e.target.value})}
                    rows={2}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Question</Label>
                <Textarea 
                  value={editingQuestion.question}
                  onChange={(e) => setEditingQuestion({...editingQuestion, question: e.target.value})}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Option A</Label>
                  <Input 
                    value={editingQuestion.option_a}
                    onChange={(e) => setEditingQuestion({...editingQuestion, option_a: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Option B</Label>
                  <Input 
                    value={editingQuestion.option_b}
                    onChange={(e) => setEditingQuestion({...editingQuestion, option_b: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Option C</Label>
                  <Input 
                    value={editingQuestion.option_c}
                    onChange={(e) => setEditingQuestion({...editingQuestion, option_c: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Option D</Label>
                  <Input 
                    value={editingQuestion.option_d}
                    onChange={(e) => setEditingQuestion({...editingQuestion, option_d: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Correct Answer</Label>
                <Select 
                  value={editingQuestion.correct_answer} 
                  onValueChange={(val: any) => setEditingQuestion({...editingQuestion, correct_answer: val})}
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
                <Label>Explanation</Label>
                <Textarea 
                  value={editingQuestion.explanation || ''}
                  onChange={(e) => setEditingQuestion({...editingQuestion, explanation: e.target.value})}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
