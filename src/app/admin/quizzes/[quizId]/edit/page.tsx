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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Save, Trash2, Plus, GripVertical, Pencil } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

interface Question {
  id: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: 'A' | 'B' | 'C' | 'D'
  explanation: string
  order_index: number
}

export default function EditQuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const supabase = createClient()
  const quizId = resolvedParams.quizId
  
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  
  // Quiz Metadata State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subject_id: '',
    order_index: 0
  })

  // Question Modal State
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false)
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null)
  const [questionForm, setQuestionForm] = useState({
    question_text: '',
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    correct_answer: 'A',
    explanation: '',
    order_index: 0
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch subjects
        const { data: subjectsData } = await supabase
          .from('subjects')
          .select('id, name')
          .order('name')
        
        if (subjectsData) setSubjects(subjectsData)

        // Fetch quiz details
        const { data: quizData, error: quizError } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', quizId)
          .single()

        if (quizError) throw quizError
        if (quizData) {
          setFormData({
            title: quizData.title,
            description: quizData.description || '',
            subject_id: quizData.subject_id,
            order_index: quizData.order_index
          })
        }

        // Fetch questions
        await fetchQuestions()

      } catch (error) {
        toast.error('Failed to load quiz data')
        router.push('/admin/quizzes')
      } finally {
        setFetching(false)
      }
    }

    fetchData()
  }, [quizId, supabase, router])

  const fetchQuestions = async () => {
    const { data: questionsData } = await supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('order_index')
    
    if (questionsData) {
      setQuestions(questionsData as Question[])
    }
  }

  const handleUpdateQuiz = async () => {
    if (!formData.title.trim()) {
      toast.error('Title is required')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('quizzes')
        .update({
          title: formData.title,
          description: formData.description || null,
          subject_id: formData.subject_id,
          order_index: formData.order_index
        })
        .eq('id', quizId)

      if (error) throw error
      toast.success('Quiz updated successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to update quiz')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveQuestion = async () => {
    if (!questionForm.question_text.trim()) {
      toast.error('Question text is required')
      return
    }
    if (!questionForm.option_a || !questionForm.option_b) {
      toast.error('At least Option A and B are required')
      return
    }

    try {
      if (editingQuestionId) {
        // Update existing question
        const { error } = await supabase
          .from('questions')
          .update({
            question_text: questionForm.question_text,
            option_a: questionForm.option_a,
            option_b: questionForm.option_b,
            option_c: questionForm.option_c,
            option_d: questionForm.option_d,
            correct_answer: questionForm.correct_answer,
            explanation: questionForm.explanation,
            order_index: questionForm.order_index
          })
          .eq('id', editingQuestionId)

        if (error) throw error
        toast.success('Question updated')
      } else {
        // Create new question
        const { error } = await supabase
          .from('questions')
          .insert({
            quiz_id: quizId,
            ...questionForm,
            // Auto-increment order index if creating new
            order_index: questions.length + 1
          })

        if (error) throw error
        toast.success('Question added')
      }

      setIsQuestionModalOpen(false)
      resetQuestionForm()
      fetchQuestions()
    } catch (error: any) {
      toast.error(error.message || 'Failed to save question')
    }
  }

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return

    try {
      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('Question deleted')
      fetchQuestions()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete question')
    }
  }

  const openEditQuestion = (q: Question) => {
    setEditingQuestionId(q.id)
    setQuestionForm({
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_answer: q.correct_answer,
      explanation: q.explanation || '',
      order_index: q.order_index
    })
    setIsQuestionModalOpen(true)
  }

  const resetQuestionForm = () => {
    setEditingQuestionId(null)
    setQuestionForm({
      question_text: '',
      option_a: '',
      option_b: '',
      option_c: '',
      option_d: '',
      correct_answer: 'A',
      explanation: '',
      order_index: questions.length + 1
    })
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/quizzes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Edit Quiz</h1>
        </div>
        <Button onClick={handleUpdateQuiz} disabled={loading} className="gap-2">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Quiz Metadata Form */}
      <div className="grid gap-6 bg-card p-6 rounded-lg border border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
            <Label htmlFor="order">Order Index</Label>
            <Input
              id="order"
              type="number"
              value={formData.order_index}
              onChange={(e) => setFormData({...formData, order_index: parseInt(e.target.value) || 0})}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Quiz Title</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            rows={2}
          />
        </div>
      </div>

      {/* Questions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Questions ({questions.length})</h2>
          <Dialog open={isQuestionModalOpen} onOpenChange={(open) => {
            setIsQuestionModalOpen(open)
            if (!open) resetQuestionForm()
          }}>
            <DialogTrigger asChild>
              <Button onClick={resetQuestionForm}>
                <Plus className="w-4 h-4 mr-2" />
                Add Question
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingQuestionId ? 'Edit Question' : 'Add New Question'}</DialogTitle>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Question Text</Label>
                  <Textarea 
                    value={questionForm.question_text}
                    onChange={(e) => setQuestionForm({...questionForm, question_text: e.target.value})}
                    placeholder="Enter the question here..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Option A</Label>
                    <Input 
                      value={questionForm.option_a}
                      onChange={(e) => setQuestionForm({...questionForm, option_a: e.target.value})}
                      placeholder="Option A text"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Option B</Label>
                    <Input 
                      value={questionForm.option_b}
                      onChange={(e) => setQuestionForm({...questionForm, option_b: e.target.value})}
                      placeholder="Option B text"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Option C</Label>
                    <Input 
                      value={questionForm.option_c}
                      onChange={(e) => setQuestionForm({...questionForm, option_c: e.target.value})}
                      placeholder="Option C text"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Option D</Label>
                    <Input 
                      value={questionForm.option_d}
                      onChange={(e) => setQuestionForm({...questionForm, option_d: e.target.value})}
                      placeholder="Option D text"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Correct Answer</Label>
                    <Select 
                      value={questionForm.correct_answer} 
                      onValueChange={(val: any) => setQuestionForm({...questionForm, correct_answer: val})}
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
                    <Label>Order Index</Label>
                    <Input 
                      type="number"
                      value={questionForm.order_index}
                      onChange={(e) => setQuestionForm({...questionForm, order_index: parseInt(e.target.value) || 0})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Explanation</Label>
                  <Textarea 
                    value={questionForm.explanation}
                    onChange={(e) => setQuestionForm({...questionForm, explanation: e.target.value})}
                    placeholder="Explain why the answer is correct..."
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsQuestionModalOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveQuestion}>Save Question</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-4">
          {questions.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-lg text-muted-foreground">
              No questions added yet. Click "Add Question" to get started.
            </div>
          ) : (
            questions.map((q, index) => (
              <Card key={q.id} className="relative group">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-1">#{index + 1}</Badge>
                      <div>
                        <CardTitle className="text-base font-medium leading-relaxed">
                          {q.question_text}
                        </CardTitle>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={() => openEditQuestion(q)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-error hover:text-error hover:bg-error/10" onClick={() => handleDeleteQuestion(q.id)}>
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
            ))
          )}
        </div>
      </div>
    </div>
  )
}
