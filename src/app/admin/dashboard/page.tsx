import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { FileText, Folder, BookOpen, Sparkles, Plus, ArrowRight, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Fetch real counts from NEW database schema
  const [
    { count: coursesCount },
    { count: modulesCount }, // Folders
    { count: notesCount }, // Files
    { count: quizzesCount },
  ] = await Promise.all([
    supabase.from('courses').select('*', { count: 'exact', head: true }),
    supabase.from('structure_items').select('*', { count: 'exact', head: true }).eq('item_type', 'folder'),
    supabase.from('structure_items').select('*', { count: 'exact', head: true }).eq('item_type', 'file'),
    supabase.from('attached_quizzes').select('*', { count: 'exact', head: true }),
  ])
  
  // Fetch recent courses
  const { data: recentCourses } = await supabase
    .from('courses')
    .select('id, name, icon, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5)

  const stats = [
    { 
      label: 'Active Courses', 
      value: coursesCount || 0, 
      icon: Sparkles,
      href: '/admin/studio',
      color: 'text-primary',
      bgColor: 'bg-primary/10'
    },
    { 
      label: 'Total Modules', 
      value: modulesCount || 0, 
      icon: Folder,
      href: '/admin/studio',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    { 
      label: 'Learning Notes', 
      value: notesCount || 0, 
      icon: FileText,
      href: '/admin/studio',
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10'
    },
    { 
      label: 'Quizzes', 
      value: quizzesCount || 0, 
      icon: BookOpen,
      href: '/admin/studio',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10'
    },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border/40 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 mt-1 text-lg">Platform overview and quick actions</p>
        </div>
        <div className="text-sm text-slate-400 font-medium">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <Link key={i} href={stat.href} className="group">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 hover:border-primary/20 relative overflow-hidden">
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className={`p-3 rounded-xl ${stat.bgColor} transition-transform group-hover:scale-110`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                  <ArrowRight className="w-4 h-4 text-slate-600" />
                </div>
              </div>
              <h3 className="text-4xl font-bold text-slate-900 mb-1">{stat.value}</h3>
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              
              {/* Decorative gradient blob */}
              <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full opacity-0 group-hover:opacity-10 transition-opacity ${stat.bgColor.replace('/10', '/30')} blur-2xl`} />
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity / Courses */}
        <div className="col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-900">Recent Courses</h3>
            <Link href="/admin/studio" className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
          <div className="space-y-4">
            {recentCourses && recentCourses.length > 0 ? (
              recentCourses.map((course: any) => (
                <Link 
                  key={course.id} 
                  href={`/admin/studio/${course.id}`}
                  className="group flex p-4 rounded-2xl border border-slate-100 hover:border-primary/20 hover:bg-slate-50/50 transition-all items-center gap-4"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                    {course.icon || '📚'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 group-hover:text-primary transition-colors">{course.name}</h4>
                    <p className="text-sm text-slate-500">Updated {new Date(course.updated_at).toLocaleDateString()}</p>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-600 group-hover:bg-white group-hover:shadow-sm transition-all">
                    Manage
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-center py-12 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <Sparkles className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="text-slate-500 font-medium">No courses yet</p>
                <Link href="/admin/studio">
                  <Button variant="link" className="mt-1 text-primary">
                    Create your first course
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
        
        {/* Quick Actions Panel */}
        <div className="bg-linear-to-br from-slate-900 to-slate-800 p-8 rounded-3xl text-white shadow-lg relative overflow-hidden">
          {/* Background pattern */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          
          <h3 className="text-xl font-bold mb-6 relative z-10">Quick Actions</h3>
          <div className="space-y-4 relative z-10">
            <Link href="/admin/studio" className="block">
              <button className="w-full text-left p-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/20 rounded-lg text-primary-foreground">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold">New Course</div>
                    <div className="text-xs text-slate-400 mt-0.5">Start a new learning world</div>
                  </div>
                </div>
              </button>
            </Link>
            
            <Link href="/admin/studio" className="block">
              <button className="w-full text-left p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg text-blue-200">
                    <Folder className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold">Manage Content</div>
                    <div className="text-xs text-slate-400 mt-0.5">Organize modules & notes</div>
                  </div>
                </div>
              </button>
            </Link>
          </div>
          
          <div className="mt-8 pt-6 border-t border-white/10 relative z-10">
            <p className="text-xs text-slate-400 mb-2">System Status</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-sm font-medium text-emerald-400">All Systems Operational</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
