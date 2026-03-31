'use client'

import { useActiveAdmins } from '@/lib/realtime/realtime-provider'
import { cn } from '@/lib/utils'

/**
 * PresenceAvatars - Shows active admins in the header
 * Displays avatars of all currently online admins with native title tooltips
 */
export function PresenceAvatars() {
  const { otherAdmins } = useActiveAdmins()

  if (otherAdmins.length === 0) {
    return null
  }

  // Gradient palette used to assign a stable avatar color per active admin.
  const colors = [
    'from-blue-400 to-blue-600',
    'from-green-400 to-green-600',
    'from-purple-400 to-purple-600',
    'from-orange-400 to-orange-600',
    'from-pink-400 to-pink-600',
    'from-teal-400 to-teal-600',
  ]

  // Derives a deterministic gradient from the user ID so each admin keeps the same color.
  const getColorForUser = (userId: string) => {
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return colors[hash % colors.length]
  }

  // Converts a full name into a compact 1-2 character avatar label.
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Maps admin routes to short human-readable labels shown in the avatar tooltip.
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

  // Renders the online count plus a capped stack of active-admin avatars.
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
            className="relative w-8 h-8 rounded-full flex items-center justify-center text-foreground/90 text-xs font-bold bg-muted ring-2 ring-white shadow-sm"
          >
            +{otherAdmins.length - 5}
          </div>
        )}
      </div>
    </div>
  )
}
