'use client'

import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import {
  Search, Users, BookOpen, Coins, Flame, Shield, X,
  ChevronRight, Calendar, CheckCircle2, XCircle, Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type SortKey = 'name' | 'email' | 'courses' | 'coins' | 'streak' | 'joined'
type SortDir = 'asc' | 'desc'

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMs(ms: number) {
  return new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── User courses modal ────────────────────────────────────────────────────────
function UserCoursesModal({
  userId,
  userName,
  open,
  onClose,
}: {
  userId: Id<'users'> | null
  userName: string
  open: boolean
  onClose: () => void
}) {
  const purchases = useQuery(
    api.admin.getUserPurchases,
    userId ? { userId } : 'skip'
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <BookOpen className="w-5 h-5 text-primary" />
            {userName}&apos;s Courses
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {purchases === undefined ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : purchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <BookOpen className="w-10 h-10 opacity-30" />
              <p className="text-sm">No courses purchased yet</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Course</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Price Paid</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Purchased</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p._id} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{p.courseName}</span>
                        {!p.courseActive && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                            Inactive
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={cn(
                        'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
                        p.status === 'active'
                          ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300'
                          : p.status === 'refunded'
                          ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {p.status === 'active' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {p.course_price != null ? `₹${p.course_price}` : '—'}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">
                      {fmt(p.purchased_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UsersClient() {
  const users = useQuery(api.admin.getAllUsersWithPurchases, {})

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('joined')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedUserId, setSelectedUserId] = useState<Id<'users'> | null>(null)
  const [selectedUserName, setSelectedUserName] = useState('')

  const filtered = useMemo(() => {
    if (!users) return []
    const q = search.toLowerCase().trim()
    return users.filter(
      (u) =>
        !q ||
        u.email.toLowerCase().includes(q) ||
        (u.full_name ?? '').toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
    )
  }, [users, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: number | string = 0
      let bv: number | string = 0
      if (sortKey === 'name') { av = (a.full_name ?? a.username).toLowerCase(); bv = (b.full_name ?? b.username).toLowerCase() }
      else if (sortKey === 'email') { av = a.email; bv = b.email }
      else if (sortKey === 'courses') { av = a.activeCourseCount; bv = b.activeCourseCount }
      else if (sortKey === 'coins') { av = a.total_coins; bv = b.total_coins }
      else if (sortKey === 'streak') { av = a.streak_count; bv = b.streak_count }
      else if (sortKey === 'joined') { av = a._creationTime; bv = b._creationTime }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="opacity-20 ml-1">↕</span>
    return <span className="ml-1 text-primary">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const totalActive = users?.reduce((s, u) => s + u.activeCourseCount, 0) ?? 0
  const totalCoins = users?.reduce((s, u) => s + u.total_coins, 0) ?? 0

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              Users
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              All registered users and their course purchases
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Users', value: users?.length ?? '—', icon: Users, color: 'text-blue-500' },
            { label: 'Total Enrollments', value: totalActive, icon: BookOpen, color: 'text-green-500' },
            { label: 'Total Coins', value: totalCoins.toLocaleString(), icon: Coins, color: 'text-amber-500' },
            { label: 'Admins', value: users?.filter((u) => u.is_admin).length ?? 0, icon: Shield, color: 'text-purple-500' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
              <Icon className={cn('w-5 h-5 shrink-0', color)} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold text-foreground">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email or username…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 text-sm bg-card border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/60"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {users === undefined ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Users className="w-10 h-10 opacity-30" />
              <p className="text-sm">{search ? 'No users match your search' : 'No users found'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {(
                      [
                        { key: 'name', label: 'Name' },
                        { key: 'email', label: 'Email' },
                        { key: 'courses', label: 'Courses' },
                        { key: 'coins', label: 'Coins' },
                        { key: 'streak', label: 'Streak' },
                        { key: 'joined', label: 'Joined' },
                      ] as { key: SortKey; label: string }[]
                    ).map(({ key, label }) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        className="text-left py-3 px-4 font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                      >
                        {label}
                        <SortIcon k={key} />
                      </th>
                    ))}
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((user) => (
                    <tr
                      key={user._id}
                      onClick={() => {
                        setSelectedUserId(user._id)
                        setSelectedUserName(user.full_name ?? user.username)
                      }}
                      className="border-b border-border/50 hover:bg-muted/40 transition-colors cursor-pointer group"
                    >
                      {/* Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-primary flex items-center justify-center text-white font-bold text-xs shrink-0">
                            {(user.full_name ?? user.username).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground truncate">
                                {user.full_name ?? user.username}
                              </span>
                              {user.is_admin && (
                                <Shield className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">@{user.username}</div>
                          </div>
                        </div>
                      </td>
                      {/* Email */}
                      <td className="py-3 px-4 text-muted-foreground truncate max-w-[200px]">
                        {user.email}
                      </td>
                      {/* Courses */}
                      <td className="py-3 px-4">
                        <span className={cn(
                          'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
                          user.activeCourseCount > 0
                            ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          <BookOpen className="w-3 h-3" />
                          {user.activeCourseCount}
                          {user.courseCount > user.activeCourseCount && (
                            <span className="opacity-60">/{user.courseCount}</span>
                          )}
                        </span>
                      </td>
                      {/* Coins */}
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                          <Coins className="w-3.5 h-3.5" />
                          {user.total_coins.toLocaleString()}
                        </span>
                      </td>
                      {/* Streak */}
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-1 text-orange-500 font-medium">
                          <Flame className="w-3.5 h-3.5" />
                          {user.streak_count}
                        </span>
                      </td>
                      {/* Joined */}
                      <td className="py-3 px-4 text-muted-foreground text-xs whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {fmtMs(user._creationTime)}
                        </span>
                      </td>
                      {/* Arrow */}
                      <td className="py-3 px-4">
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {sorted.length > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            Showing {sorted.length} of {users?.length ?? 0} users
          </p>
        )}
      </div>

      <UserCoursesModal
        userId={selectedUserId}
        userName={selectedUserName}
        open={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
      />
    </>
  )
}
