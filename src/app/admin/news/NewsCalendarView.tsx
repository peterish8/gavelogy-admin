'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { NewsDateGroup } from '@/actions/news'

interface Props {
  groups: NewsDateGroup[]
  selectedDate?: string
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function NewsCalendarView({ groups, selectedDate }: Props) {
  const router = useRouter()
  const today = new Date()

  const initYear  = selectedDate ? parseInt(selectedDate.split('-')[0])     : today.getFullYear()
  const initMonth = selectedDate ? parseInt(selectedDate.split('-')[1]) - 1 : today.getMonth()

  const [year, setYear]   = useState(initYear)
  const [month, setMonth] = useState(initMonth)

  const articleDates = new Map(groups.map(g => [g.date, g]))

  // Build grid — Monday-based
  const firstDay   = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = (firstDay.getDay() + 6) % 7   // Mon=0 … Sun=6

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function prev() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function next() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const todayStr = today.toISOString().split('T')[0]
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
      {/* Month navigator */}
      <div className="px-5 py-4 border-b flex items-center justify-between bg-muted/30">
        <button onClick={prev} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="font-semibold text-base">{monthLabel}</h2>
        <button onClick={next} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 border-b bg-muted/20">
        {WEEKDAYS.map(d => (
          <div key={d} className="py-2.5 text-center text-xs font-semibold text-muted-foreground tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) {
            return <div key={`empty-${i}`} className="h-16 border-r border-b last:border-r-0 bg-muted/10" />
          }

          const pad   = (n: number) => String(n).padStart(2, '0')
          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`
          const group   = articleDates.get(dateStr)
          const isSel   = dateStr === selectedDate
          const isToday = dateStr === todayStr

          return (
            <button
              key={dateStr}
              disabled={!group}
              onClick={() => router.push(`/admin/news?date=${dateStr}`)}
              className={`h-16 border-r border-b last:border-r-0 flex flex-col items-center justify-center gap-1 transition-colors ${
                isSel
                  ? 'bg-primary/10 dark:bg-primary/20'
                  : group
                    ? 'hover:bg-muted cursor-pointer'
                    : 'cursor-default'
              }`}
            >
              {/* Day number */}
              <span className={`text-sm font-semibold w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                isSel
                  ? 'bg-primary text-primary-foreground'
                  : isToday
                    ? 'ring-2 ring-primary ring-offset-1 text-primary font-bold'
                    : group
                      ? 'text-foreground hover:bg-muted'
                      : 'text-muted-foreground/40'
              }`}>
                {day}
              </span>

              {/* Dots — green = published, amber = draft */}
              {group && (
                <div className="flex items-center gap-0.5">
                  {group.published > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" title={`${group.published} published`} />
                  )}
                  {group.draft > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title={`${group.draft} draft`} />
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="px-5 py-2.5 border-t bg-muted/10 flex items-center gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Published
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          Draft
        </span>
        <span className="ml-auto text-muted-foreground/50">{groups.length} day{groups.length !== 1 ? 's' : ''} with news</span>
      </div>
    </div>
  )
}
