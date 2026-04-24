import Link from 'next/link'
import { FileText, Folder, BookOpen, Sparkles, Plus, ArrowRight, IndianRupee, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchQuery } from 'convex/nextjs'
import { api } from '@convex/_generated/api'

// Dashboard server page that fetches high-level content counts and recent courses for the admin home screen.
export default async function DashboardPage() {
  const [counts, recentCourses, revenue] = await Promise.all([
    fetchQuery(api.admin.getDashboardCounts, {}),
    fetchQuery(api.admin.getRecentCourses, { limit: 5 }),
    fetchQuery(api.adminQueries.getRevenueDashboard, {}),
  ])

  // Normalizes the stat cards so the grid can be rendered from one data structure.
  const stats = [
    { 
      label: 'Active Courses', 
      value: counts.courses || 0, 
      icon: Sparkles,
      href: '/admin/studio',
      color: 'text-primary',
      bgColor: 'bg-primary/10'
    },
    { 
      label: 'Total Modules', 
      value: counts.folders || 0, 
      icon: Folder,
      href: '/admin/studio',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    { 
      label: 'Learning Notes', 
      value: counts.files || 0, 
      icon: FileText,
      href: '/admin/studio',
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10'
    },
    { 
      label: 'Quizzes', 
      value: counts.quizzes || 0, 
      icon: BookOpen,
      href: '/admin/studio',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10'
    },
    {
      label: 'Total Revenue',
      value: `₹${(revenue.totalRevenue || 0).toLocaleString('en-IN')}`,
      icon: IndianRupee,
      href: '/admin/creators',
      color: 'text-green-600',
      bgColor: 'bg-green-500/10'
    },
    {
      label: 'This Month Revenue',
      value: `₹${(revenue.currentMonthRevenue || 0).toLocaleString('en-IN')}`,
      icon: Sparkles,
      href: '/admin/creators',
      color: 'text-amber-600',
      bgColor: 'bg-amber-500/10'
    },
    {
      label: 'Successful Orders',
      value: revenue.totalOrders || 0,
      icon: Receipt,
      href: '/admin/creators',
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-500/10'
    },
    {
      label: 'Avg Order Value',
      value: `₹${Math.round(revenue.averageOrderValue || 0).toLocaleString('en-IN')}`,
      icon: ArrowRight,
      href: '/admin/creators',
      color: 'text-rose-600',
      bgColor: 'bg-rose-500/10'
    },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border/40 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-lg">Platform overview and quick actions</p>
        </div>
        <div className="text-sm text-muted-foreground/70 font-medium">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <Link key={i} href={stat.href} className="group">
            <div className="bg-card p-6 rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:border-primary/20 relative overflow-hidden">
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className={`p-3 rounded-xl ${stat.bgColor} transition-transform group-hover:scale-110`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <h3 className="text-4xl font-bold text-foreground mb-1">{stat.value}</h3>
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              
              {/* Decorative gradient blob */}
              <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full opacity-0 group-hover:opacity-10 transition-opacity ${stat.bgColor.replace('/10', '/30')} blur-2xl`} />
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity / Courses */}
        <div className="col-span-2 bg-card p-8 rounded-3xl border border-border/50 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-foreground">Recent Courses</h3>
            <Link href="/admin/studio" className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
          <div className="space-y-4">
            {recentCourses && recentCourses.length > 0 ? (
              recentCourses.map((course: any) => (
                <Link 
                  key={course._id} 
                  href={`/admin/studio/${course._id}`}
                  className="group flex p-4 rounded-2xl border border-border/50 hover:border-primary/20 hover:bg-muted/50 transition-all items-center gap-4"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                    {course.icon || '📚'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-foreground group-hover:text-primary transition-colors">{course.name}</h4>
                    <p className="text-sm text-muted-foreground">Created {new Date(course._creationTime).toLocaleDateString()}</p>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-muted/80 text-xs font-semibold text-muted-foreground group-hover:bg-card group-hover:shadow-sm transition-all">
                    Manage
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-center py-12 bg-muted/50 rounded-2xl border border-dashed border-border">
                <Sparkles className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground font-medium">No courses yet</p>
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
              <button className="w-full text-left p-4 rounded-xl bg-card/10 hover:bg-card/20 border border-white/10 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/20 rounded-lg text-primary-foreground">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold">New Course</div>
                    <div className="text-xs text-muted-foreground/70 mt-0.5">Start a new learning world</div>
                  </div>
                </div>
              </button>
            </Link>
            
            <Link href="/admin/studio" className="block">
              <button className="w-full text-left p-4 rounded-xl bg-card/5 hover:bg-card/10 border border-white/5 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg text-blue-200">
                    <Folder className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold">Manage Content</div>
                    <div className="text-xs text-muted-foreground/70 mt-0.5">Organize modules & notes</div>
                  </div>
                </div>
              </button>
            </Link>
          </div>
          
          <div className="mt-8 pt-6 border-t border-white/10 relative z-10">
            <p className="text-xs text-muted-foreground/70 mb-2">System Status</p>
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
