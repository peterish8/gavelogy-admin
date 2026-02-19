'use client'

import { cn } from '@/lib/utils'
import type { AdminPresence } from '@/lib/realtime/realtime-provider'

// Color palette for presence badges
const BADGE_COLORS = [
  'from-blue-400 to-blue-600',
  'from-green-400 to-green-600',
  'from-purple-400 to-purple-600',
  'from-orange-400 to-orange-600',
  'from-pink-400 to-pink-600',
  'from-teal-400 to-teal-600',
  'from-rose-400 to-rose-600',
  'from-cyan-400 to-cyan-600',
]

function getColorForUser(userId: string) {
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return BADGE_COLORS[hash % BADGE_COLORS.length]
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * A small circular badge showing admin initials.
 * Shows full name on hover via native tooltip.
 */
export function PresenceBadge({ 
  admin, 
  size = 'sm' 
}: { 
  admin: AdminPresence
  size?: 'sm' | 'md'
}) {
  const sizeClass = size === 'sm' 
    ? 'w-6 h-6 text-[10px]' 
    : 'w-7 h-7 text-xs'

  return (
    <div
      title={`${admin.admin_name} is here`}
      className={cn(
        sizeClass,
        'rounded-full flex items-center justify-center text-white font-bold',
        'ring-2 ring-white shadow-sm cursor-default',
        'hover:scale-110 hover:z-10 transition-transform',
        `bg-linear-to-br ${getColorForUser(admin.user_id)}`
      )}
    >
      {getInitials(admin.admin_name || 'A')}
    </div>
  )
}

/**
 * A row of stacked presence badges.
 * Shows up to 3 badges, then a "+N" indicator.
 */
export function PresenceBadgeStack({ 
  admins, 
  maxVisible = 3 
}: { 
  admins: AdminPresence[]
  maxVisible?: number
}) {
  if (!admins || admins.length === 0) return null

  const visible = admins.slice(0, maxVisible)
  const overflow = admins.length - maxVisible

  return (
    <div className="flex -space-x-1.5 items-center">
      {visible.map((admin) => (
        <PresenceBadge key={admin.user_id} admin={admin} size="sm" />
      ))}
      {overflow > 0 && (
        <div 
          title={admins.slice(maxVisible).map(a => a.admin_name).join(', ')}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-slate-200 text-slate-600 ring-2 ring-white"
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}
