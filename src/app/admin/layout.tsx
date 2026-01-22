'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  LayoutDashboard, 
  FileText, 
  HelpCircle, 
  LogOut, 
  Menu, 
  X,
  BookOpen,
  Sparkles,
  Loader2,
  ShieldAlert,
  Gavel,
  ChevronUp,
  User,
  Settings
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RealtimeProvider } from '@/lib/realtime/realtime-provider'
import { PresenceAvatars } from '@/components/admin/presence-avatars'
import { useHeaderStore } from '@/lib/stores/header-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const sidebarItems = [
  {
    title: 'Dashboard',
    href: '/admin/dashboard',
    icon: LayoutDashboard
  },
  {
    title: 'Course Studio',
    href: '/admin/studio',
    icon: Sparkles
  },
  {
    title: 'Case Notes',
    href: '/admin/notes',
    icon: FileText
  },
  {
    title: 'Quizzes',
    href: '/admin/quizzes',
    icon: HelpCircle
  },
  {
    title: 'Case Quizzes',
    href: '/admin/case-quizzes',
    icon: BookOpen
  },
]

interface AdminUser {
  id: string
  email: string
  full_name?: string
  is_admin: boolean
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)
  const [isLogoutOpen, setIsLogoutOpen] = useState(false)
  const { title: headerTitle, actions: headerActions } = useHeaderStore()
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  // 1. Optimistic Auth Check (Instant Load)
  useEffect(() => {
    const cached = localStorage.getItem('gavelogy_admin_user')
    if (cached) {
      try {
        const user = JSON.parse(cached)
        setAdminUser(user)
        setIsLoading(false)
      } catch (e) {
        localStorage.removeItem('gavelogy_admin_user')
      }
    }
  }, [])

  // Check authentication and admin status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Get current session
        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.user) {
          router.replace('/auth/login')
          return
        }

        // Check if user is admin
        const { data: userData, error } = await supabase
          .from('users')
          .select('id, email, full_name, is_admin')
          .eq('id', session.user.id)
          .single()

        if (error || !userData) {
          await supabase.auth.signOut()
          router.replace('/auth/login')
          return
        }

        if (!userData.is_admin) {
          await supabase.auth.signOut()
          router.replace('/auth/login')
          return
        }

        setAdminUser(userData)
        localStorage.setItem('gavelogy_admin_user', JSON.stringify(userData))
        setIsLoading(false)
      } catch (err) {
        console.error('Auth check error:', err)
        router.replace('/auth/login')
      }
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: string, session: any) => {
        if (event === 'SIGNED_OUT' || !session) {
          localStorage.removeItem('gavelogy_admin_user')
          router.replace('/auth/login')
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [router, supabase])

  useEffect(() => {
    const checkScreen = () => {
      setIsMobile(window.innerWidth < 1024)
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false)
      } else {
        setIsSidebarOpen(true)
      }
    }

    checkScreen()
    window.addEventListener('resize', checkScreen)
    return () => window.removeEventListener('resize', checkScreen)
  }, [])

  const handleLogout = async () => {
    localStorage.removeItem('gavelogy_admin_user')
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4 animate-pulse">
            <Gavel className="w-8 h-8 text-primary" />
          </div>
          <p className="text-muted-foreground font-medium">Verifying admin access...</p>
        </div>
      </div>
    )
  }

  // If no admin user after loading, show access denied
  if (!adminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-md p-8 bg-white border border-border rounded-2xl shadow-lg">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 mb-4">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-6">You don't have admin privileges to access this portal.</p>
          <button
            onClick={() => router.push('/auth/login')}
            className="w-full px-4 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <RealtimeProvider>
    <div className="min-h-screen bg-bg-muted flex font-sans">
      {/* Mobile Sidebar Overlay */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-72 bg-white border-r border-border shadow-sm flex flex-col transition-all duration-300 ease-in-out",
          !isSidebarOpen && "-translate-x-full lg:translate-x-0 lg:w-20"
        )}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-border/50">
          <div className={cn("flex items-center gap-2", !isSidebarOpen && "lg:justify-center w-full")}>
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white shrink-0">
               <Gavel className="w-5 h-5" />
            </div>
            <span className={cn("font-bold text-xl tracking-tight text-slate-900 truncate", !isSidebarOpen && "lg:hidden")}>
              Gavelogy
            </span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1 hover:bg-muted rounded-md lg:hidden"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4">
          <div className={cn("text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 pl-3", !isSidebarOpen && "lg:hidden")}>
            Menu
          </div>
          <nav className="space-y-1">
            {sidebarItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative overflow-hidden",
                    isActive 
                      ? "bg-primary/5 text-primary font-semibold" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    !isSidebarOpen && "lg:justify-center lg:px-2"
                  )}
                  title={!isSidebarOpen ? item.title : undefined}
                >
                  {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full" />}
                  <item.icon className={cn("w-5 h-5 shrink-0 transition-colors", isActive ? "text-primary" : "text-slate-400 group-hover:text-slate-600")} />
                  <span className={cn("truncate", !isSidebarOpen && "lg:hidden")}>
                    {item.title}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-border/50">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-3 px-3 py-3 w-full rounded-xl hover:bg-slate-50 transition-all group",
                  !isSidebarOpen && "lg:justify-center lg:px-2"
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-linear-to-br from-purple-500 to-primary flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0">
                  {adminUser.full_name?.charAt(0) || adminUser.email.charAt(0).toUpperCase()}
                </div>
                {isSidebarOpen && (
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">
                      {adminUser.full_name || 'Admin User'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {adminUser.email}
                    </div>
                  </div>
                )}
                {isSidebarOpen && (
                  <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-slate-600 shrink-0 transition-colors" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 mb-2 p-1" side="top" sideOffset={12}>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1 p-2">
                  <p className="text-sm font-bold leading-none text-slate-900">{adminUser.full_name || 'Admin User'}</p>
                  <p className="text-xs leading-none text-slate-500">{adminUser.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 rounded-lg py-2.5 cursor-pointer">
                <User className="w-4 h-4 text-slate-500" />
                <span>My Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 rounded-lg py-2.5 cursor-pointer">
                <Settings className="w-4 h-4 text-slate-500" />
                <span>Account Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="gap-2 rounded-lg py-2.5 text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                onClick={() => setIsLogoutOpen(true)}
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-border/50 flex items-center justify-between px-4 lg:px-8 z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <button
               onClick={() => setIsSidebarOpen(!isSidebarOpen)}
               className="hidden lg:flex p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
            >
               <Menu className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center gap-4 flex-1 px-4 lg:px-8">
            {headerTitle && (
              <div className="flex items-center gap-3">
                <div className="h-6 w-px bg-slate-200 hidden md:block" />
                <h2 className="text-lg font-bold text-slate-800 tracking-tight whitespace-nowrap">
                  {headerTitle}
                </h2>
              </div>
            )}
            
            <div className="flex items-center gap-2 ml-4">
              {headerActions}
            </div>
          </div>
          
          <div className="flex items-center gap-4 ml-auto shrink-0">
            {/* Live presence avatars - shows other admins online */}
            <PresenceAvatars />
            
            <div className="bg-slate-200 h-8 w-px mx-2 hidden sm:block" />
            
            <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm shadow-green-200" />
               <span className="text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Admin Portal</span>
            </div>
          </div>
        </header>

        <main className={cn(
          "flex-1 bg-slate-50/50",
          // The main list page should scroll normally
          pathname === '/admin/studio' ? "p-6 lg:p-8 overflow-y-auto" : 
          // The IDE page handles its own scroll internally
          pathname.includes('/admin/studio/') ? "p-0 overflow-hidden" : 
          // Other pages scroll normally
          "p-6 lg:p-8 overflow-y-auto"
        )}>
           <div className={cn("w-full mx-auto", pathname.includes('/admin/studio/') ? "h-full" : "max-w-7xl")}>
             {children}
           </div>
        </main>
      </div>
    </div>
        <AlertDialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
          <AlertDialogContent className="rounded-2xl max-w-[400px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-slate-900">Sign Out</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600">
                Are you sure you want to sign out? You will need to log in again to access the admin features.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 mt-4">
              <AlertDialogCancel className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 font-medium">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium shadow-md shadow-red-100 border-none"
              >
                Sign Out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </RealtimeProvider>
  )
}
