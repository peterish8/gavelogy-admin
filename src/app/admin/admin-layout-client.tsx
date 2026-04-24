'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  HelpCircle,
  LogOut,
  Menu,
  ChevronsLeft,
  Sparkles,
  Gavel,
  ChevronUp,
  User,
  Settings,
  Newspaper,
  ClipboardList,
  Users,
  UserCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RealtimeProvider } from '@/lib/realtime/realtime-provider'
import { AdminProvider } from '@/contexts/admin-context'
import { PresenceAvatars } from '@/components/admin/presence-avatars'
import { useHeaderStore } from '@/lib/stores/header-store'
import { ThemeToggle } from '@/components/theme-toggle'
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
import { useAuth } from '@/lib/auth-context'

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
    title: 'Daily News',
    href: '/admin/news',
    icon: Newspaper
  },
  {
    title: 'PYQ Tests',
    href: '/admin/pyq',
    icon: ClipboardList
  },
  {
    title: 'Users',
    href: '/admin/users',
    icon: Users
  },
  {
    title: 'Revenue',
    href: '/admin/creators',
    icon: UserCircle
  },
]

interface AdminUser {
  id: string
  email: string
  full_name?: string
  is_admin: boolean
}

interface AdminLayoutClientProps {
  children: React.ReactNode
  adminUser: AdminUser
}

// Client-side admin shell that renders the sidebar, header, presence UI, and sign-out flow around all admin pages.
export default function AdminLayoutClient({
  children,
  adminUser,
}: AdminLayoutClientProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isLogoutOpen, setIsLogoutOpen] = useState(false)
  const { title: headerTitle, actions: headerActions } = useHeaderStore()
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuth()

  // Tracks viewport width so the sidebar can switch between desktop and mobile behavior.
  useEffect(() => {
    const checkScreen = () => {
      setIsMobile(window.innerWidth < 1024)
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false)
      }
    }

    checkScreen()
    window.addEventListener('resize', checkScreen)
    return () => window.removeEventListener('resize', checkScreen)
  }, [])

  const handleLogout = async () => {
    setIsLogoutOpen(false)
    try {
      await signOut()
    } catch (e) {
      console.error('Signout error:', e)
    } finally {
      router.push('/auth/login')
      router.refresh()
    }
  }

  return (
    <AdminProvider isAdmin={adminUser.is_admin} userId={adminUser.id}>
    <RealtimeProvider
      userId={adminUser.id}
      userName={adminUser.full_name || 'Admin'}
      userEmail={adminUser.email}
    >
    <div className="min-h-screen bg-bg-muted flex font-sans">
      {/* Mobile Sidebar Overlay */}
        {/* Mobile overlay that dismisses the sidebar when tapping outside it. */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Floating Menu Toggle (Visible only when sidebar is closed on desktop) */}
      {/* Desktop floating toggle shown only when the sidebar is collapsed. */}
      {!isSidebarOpen && !isMobile && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="fixed top-4 left-4 z-60 p-2 bg-card/80 backdrop-blur-md border border-border rounded-lg text-muted-foreground/70 hover:text-muted-foreground hover:bg-card shadow-sm transition-all duration-200"
          title="Expand Sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Sidebar */}
      {/* Main sidebar navigation plus the admin profile dropdown. */}
      <aside 
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-[240px] bg-card border-r border-border shadow-sm flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
          !isSidebarOpen && "-translate-x-full lg:translate-x-0 lg:w-0 lg:border-none"
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white shrink-0">
              <Gavel className="w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground truncate">
              Gavelogy
            </span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-1.5 hover:bg-muted/80 rounded-lg text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            title="Collapse Sidebar"
          >
            <ChevronsLeft className="w-5 h-5" />
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
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    !isSidebarOpen && "lg:justify-center lg:px-2"
                  )}
                  title={!isSidebarOpen ? item.title : undefined}
                >
                  {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full" />}
                  <item.icon className={cn("w-5 h-5 shrink-0 transition-colors", isActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-muted-foreground")} />
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
                suppressHydrationWarning
                className={cn(
                  "flex items-center gap-3 px-3 py-3 w-full rounded-xl hover:bg-muted transition-all group",
                  !isSidebarOpen && "lg:justify-center lg:px-2"
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-linear-to-br from-purple-500 to-primary flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0">
                  {adminUser.full_name?.charAt(0) || adminUser.email.charAt(0).toUpperCase()}
                </div>
                {isSidebarOpen && (
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-bold text-foreground truncate">
                      {adminUser.full_name || 'Admin User'}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {adminUser.email}
                    </div>
                  </div>
                )}
                {isSidebarOpen && (
                  <ChevronUp className="w-4 h-4 text-muted-foreground/70 group-hover:text-muted-foreground shrink-0 transition-colors" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 mb-2 p-1" side="top" sideOffset={12}>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1 p-2">
                  <p className="text-sm font-bold leading-none text-foreground">{adminUser.full_name || 'Admin User'}</p>
                  <p className="text-xs leading-none text-muted-foreground">{adminUser.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 rounded-lg py-2.5 cursor-pointer">
                <User className="w-4 h-4 text-muted-foreground" />
                <span>My Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 rounded-lg py-2.5 cursor-pointer">
                <Settings className="w-4 h-4 text-muted-foreground" />
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
        {/* Sticky top bar that hosts page-specific header actions, theme toggle, and presence indicators. */}
        <header className="h-16 bg-card/80 backdrop-blur-md border-b border-border/50 flex items-center justify-between px-4 lg:px-8 z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-muted/80 rounded-lg lg:hidden"
            >
              <Menu className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          
          <div className="flex items-center gap-4 flex-1 px-4 lg:px-8">
            {headerTitle && (
              <div className="flex items-center gap-3">
                <div className="h-6 w-px bg-muted hidden md:block" />
                <h2 className="text-lg font-bold text-foreground tracking-tight whitespace-nowrap">
                  {headerTitle}
                </h2>
              </div>
            )}
            
            <div className="flex items-center gap-2 ml-4">
              {headerActions}
            </div>
          </div>
          
          <div className="flex items-center gap-4 ml-auto shrink-0">
            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Live presence avatars - shows other admins online */}
            <PresenceAvatars />
            
            <div className="bg-muted h-8 w-px mx-2 hidden sm:block" />
            
            <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm shadow-green-200" />
               <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Admin Portal</span>
            </div>
          </div>
        </header>

        {/* Main page frame switches padding/scroll mode for studio, tag, and preview workspaces. */}
        <main className={cn(
          "flex-1 bg-muted/50",
          // The main list page should scroll normally
          pathname === '/admin/studio' ? "p-6 lg:p-8 overflow-y-auto" :
          // The IDE page handles its own scroll internally
          pathname.includes('/admin/studio/') ? "p-0 overflow-hidden" :
          // Tagging workspace handles its own scroll internally
          pathname.match(/\/admin\/tag\/.+/) ? "p-0 overflow-hidden" :
          // PYQ exam preview handles its own scroll internally
          pathname.match(/\/admin\/pyq\/.+\/preview/) ? "p-0 overflow-hidden" :
          // Other pages scroll normally
          "p-6 lg:p-8 overflow-y-auto"
        )}>
           <div className={cn("w-full mx-auto", pathname.includes('/admin/studio/') || pathname.match(/\/admin\/tag\/.+/) || pathname.match(/\/admin\/pyq\/.+\/preview/) ? "h-full" : "max-w-7xl")}>
             {children}
           </div>
        </main>
      </div>
    </div>
        <AlertDialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
          <AlertDialogContent className="rounded-2xl max-w-[400px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-foreground">Sign Out</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                Are you sure you want to sign out? You will need to log in again to access the admin features.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 mt-4">
              <AlertDialogCancel className="rounded-xl border-border text-muted-foreground hover:bg-muted font-medium">Cancel</AlertDialogCancel>
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
    </AdminProvider>
  )
}
