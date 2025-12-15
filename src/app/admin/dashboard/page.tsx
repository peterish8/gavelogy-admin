import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { FileText, HelpCircle, BookOpen, Users, Plus, ArrowRight, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Fetch real counts from database
  const [
    { count: notesCount },
    { count: quizzesCount },
    { count: caseQuizzesCount },
    { count: questionsCount },
  ] = await Promise.all([
    supabase.from('contemprory_case_notes').select('*', { count: 'exact', head: true }),
    supabase.from('quizzes').select('*', { count: 'exact', head: true }),
    supabase.from('contemporary_case_quizzes').select('*', { count: 'exact', head: true }),
    supabase.from('questions').select('*', { count: 'exact', head: true }),
  ])

  // Fetch recent case notes (last 5)
  const { data: recentNotes } = await supabase
    .from('contemprory_case_notes')
    .select('case_number, overall_content')
    .order('case_number', { ascending: false })
    .limit(5)

  // Fetch recent quizzes (last 5)
  const { data: recentQuizzes } = await supabase
    .from('quizzes')
    .select(`
      id,
      title,
      subjects (name)
    `)
    .order('order_index', { ascending: false })
    .limit(5)

  const stats = [
    { 
      label: 'Total Notes', 
      value: notesCount || 0, 
      icon: FileText,
      href: '/admin/notes',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    { 
      label: 'Subject Quizzes', 
      value: quizzesCount || 0, 
      icon: HelpCircle,
      href: '/admin/quizzes',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10'
    },
    { 
      label: 'Case Quizzes', 
      value: caseQuizzesCount || 0, 
      icon: BookOpen,
      href: '/admin/case-quizzes',
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10'
    },
    { 
      label: 'Total Questions', 
      value: questionsCount || 0, 
      icon: TrendingUp,
      href: '/admin/quizzes',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10'
    },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome to Gavelogy Admin Panel</p>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <Link key={i} href={stat.href} className="group">
            <div className="bg-card p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-all hover:border-primary/20">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <h3 className="text-3xl font-bold text-foreground">{stat.value}</h3>
              <p className="text-sm text-muted-foreground font-medium mt-1">{stat.label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Notes */}
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Recent Case Notes</h3>
            <Link href="/admin/notes" className="text-sm text-primary hover:underline">
              View All
            </Link>
          </div>
          <div className="space-y-3">
            {recentNotes && recentNotes.length > 0 ? (
              recentNotes.map((note: any) => (
                <Link 
                  key={note.case_number} 
                  href={`/admin/notes/${note.case_number}/edit`}
                  className="block p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-blue-500/10">
                      <FileText className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{note.case_number}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {note.overall_content?.replace(/<[^>]*>/g, '').slice(0, 60)}...
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No case notes yet</p>
                <Link href="/admin/notes/new">
                  <Button variant="outline" size="sm" className="mt-3">
                    <Plus className="w-4 h-4 mr-1" /> Create First Note
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
        
        {/* Recent Quizzes */}
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Recent Quizzes</h3>
            <Link href="/admin/quizzes" className="text-sm text-primary hover:underline">
              View All
            </Link>
          </div>
          <div className="space-y-3">
            {recentQuizzes && recentQuizzes.length > 0 ? (
              recentQuizzes.map((quiz: any) => (
                <Link 
                  key={quiz.id} 
                  href={`/admin/quizzes/${quiz.id}/edit`}
                  className="block p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-purple-500/10">
                      <HelpCircle className="w-4 h-4 text-purple-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{quiz.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {quiz.subjects?.name || 'No subject'}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <HelpCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No quizzes yet</p>
                <Link href="/admin/quizzes/new">
                  <Button variant="outline" size="sm" className="mt-3">
                    <Plus className="w-4 h-4 mr-1" /> Create First Quiz
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/admin/notes/new" className="group">
            <div className="p-4 border border-border rounded-lg hover:bg-muted/50 hover:border-primary/20 transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-md bg-blue-500/10">
                  <FileText className="w-4 h-4 text-blue-500" />
                </div>
                <span className="font-medium">New Note</span>
              </div>
              <p className="text-xs text-muted-foreground">Create a contemporary case note</p>
            </div>
          </Link>
          
          <Link href="/admin/quizzes/new" className="group">
            <div className="p-4 border border-border rounded-lg hover:bg-muted/50 hover:border-primary/20 transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-md bg-purple-500/10">
                  <HelpCircle className="w-4 h-4 text-purple-500" />
                </div>
                <span className="font-medium">New Quiz</span>
              </div>
              <p className="text-xs text-muted-foreground">Create a subject quiz</p>
            </div>
          </Link>
          
          <Link href="/admin/case-quizzes/new" className="group">
            <div className="p-4 border border-border rounded-lg hover:bg-muted/50 hover:border-primary/20 transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-md bg-orange-500/10">
                  <BookOpen className="w-4 h-4 text-orange-500" />
                </div>
                <span className="font-medium">New Case Quiz</span>
              </div>
              <p className="text-xs text-muted-foreground">Create a case-specific quiz</p>
            </div>
          </Link>
          
          <Link href="/admin/notes" className="group">
            <div className="p-4 border border-border rounded-lg hover:bg-muted/50 hover:border-primary/20 transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-md bg-green-500/10">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                </div>
                <span className="font-medium">Browse All</span>
              </div>
              <p className="text-xs text-muted-foreground">View all content</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
