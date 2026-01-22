'use client'

import { useActiveAdmins } from '@/lib/realtime/realtime-provider'
import { cn } from '@/lib/utils'

/**
 * PresenceAvatars - Shows active admins in the header
 * Displays avatars of all currently online admins with native title tooltips
 */
export function PresenceAvatars() {
  const { activeAdmins, otherAdmins, currentUserId } = useActiveAdmins()

  if (otherAdmins.length === 0) {
    return null
  }

  // Color palette for avatars
  const colors = [
    'from-blue-400 to-blue-600',
    'from-green-400 to-green-600',
    'from-purple-400 to-purple-600',
    'from-orange-400 to-orange-600',
    'from-pink-400 to-pink-600',
    'from-teal-400 to-teal-600',
  ]

  const getColorForUser = (userId: string) => {
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return colors[hash % colors.length]
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getPageLabel = (page: string) => {
    if (page.includes('/admin/studio/')) {
      return 'Course Studio'
    }
    if (page === '/admin/studio') {
      return 'Course List'
    }
    if (page.includes('/admin/notes')) {
      return 'Notes'
    }
    if (page.includes('/admin/quizzes')) {
      return 'Quizzes'
    }
    if (page.includes('/admin/dashboard')) {
      return 'Dashboard'
    }
    return 'Admin Panel'
  }

  return (
    <div className="flex items-center gap-1">
      {/* Online indicator */}
      <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-200 rounded-full mr-2">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs font-medium text-green-700">
          {otherAdmins.length + 1} online
        </span>
      </div>

      {/* Avatar stack */}
      <div className="flex -space-x-2">
        {otherAdmins.slice(0, 5).map((admin, index) => (
          <div
            key={admin.user_id}
            title={`${admin.admin_name} (${admin.admin_email}) - ${getPageLabel(admin.current_page)}`}
            className={cn(
              'relative w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold',
              'ring-2 ring-white shadow-sm cursor-pointer hover:z-10 hover:scale-110 transition-transform',
              `bg-linear-to-br ${getColorForUser(admin.user_id)}`
            )}
            style={{ zIndex: otherAdmins.length - index }}
          >
            {getInitials(admin.admin_name || 'A')}
            
            {/* Activity indicator */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full" />
          </div>
        ))}

        {/* Overflow indicator */}
        {otherAdmins.length > 5 && (
          <div 
            title={otherAdmins.slice(5).map(a => a.admin_name).join(', ')}
            className="relative w-8 h-8 rounded-full flex items-center justify-center text-slate-700 text-xs font-bold bg-slate-200 ring-2 ring-white shadow-sm"
          >
            +{otherAdmins.length - 5}
          </div>
        )}
      </div>
    </div>
  )
}
