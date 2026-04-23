'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronDown, Check, HelpCircle, BookOpen } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export interface CaseItem {
  case_number: string
  case_name?: string
  has_notes: boolean
  has_quiz: boolean
  year: string
}

interface CaseListViewProps {
  cases: CaseItem[]
}

// Grouped case list view that organizes case entries by year and links into the notes editor.
export function CaseListView({ cases }: CaseListViewProps) {
  // Groups incoming cases by year so the UI can render collapsible year sections.
  const casesByYear = cases.reduce((acc, item) => {
    const year = item.year || 'Unknown'
    if (!acc[year]) {
      acc[year] = []
    }
    acc[year].push(item)
    return acc
  }, {} as Record<string, CaseItem[]>)

  // Sorts years newest-first for an exam-style archive view.
  const years = Object.keys(casesByYear).sort((a, b) => b.localeCompare(a))

  // Assigns a repeating accent palette and mock progress value to each year block.
  const getYearStyles = (year: string, index: number) => {
    // 2025 (Index 0 in desc) -> Purple
    // 2024 (Index 1) -> Green
    // 2023 (Index 2) -> Blue
    // Cycle if more
    const i = index % 3
    if (i === 0) return { bg: 'bg-purple-100/50', border: 'border-purple-100', text: 'text-purple-900', accent: 'text-purple-600', countBg: 'bg-purple-200/50', progress: '8%' }
    if (i === 1) return { bg: 'bg-green-100/50', border: 'border-green-100', text: 'text-green-900', accent: 'text-green-600', countBg: 'bg-green-200/50', progress: '18%' }
    return { bg: 'bg-blue-100/50', border: 'border-blue-100', text: 'text-blue-900', accent: 'text-blue-600', countBg: 'bg-blue-200/50', progress: '0%' }
  }

  return (
    <div className="space-y-4 font-sans">
      {years.map((year, index) => (
        <YearSection 
          key={year} 
          year={year} 
          cases={casesByYear[year]} 
          styles={getYearStyles(year, index)}
        />
      ))}
    </div>
  )
}

// Expandable section for one year's cases, including mocked category chrome and item actions.
function YearSection({ year, cases, styles }: { year: string, cases: CaseItem[], styles: any }) {
  const [isOpen, setIsOpen] = useState(year === '2025') // Default open 2025 for demo

  return (
    <div className="rounded-3xl overflow-hidden transition-all duration-300">
      {/* Header */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between p-6 transition-colors",
          styles.bg
        )}
      >
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">{year}</h2>
          <span className={cn("px-3 py-1 rounded-full text-xs font-semibold", styles.countBg, styles.accent)}>
            {cases.length} Cases
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Progress Circle Mockup */}
          <div className="flex items-center gap-2">
             <div className="relative w-10 h-10 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-white/30" />
                  <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="transparent" 
                    className={styles.accent}
                    strokeDasharray={100}
                    strokeDashoffset={100 - parseInt(styles.progress)}
                    strokeLinecap="round"
                   />
                </svg>
                <span className="absolute text-[10px] font-bold text-muted-foreground">{styles.progress}</span>
             </div>
          </div>
          
          <div className={cn("p-1 rounded-full bg-card/20 text-muted-foreground transition-transform duration-300", isOpen && "rotate-90")}>
            <ChevronRight className="w-5 h-5" />
          </div>
        </div>
      </button>

      {/* Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="p-4 bg-muted/50 space-y-4">
              
              {/* Category Header (Mocked for now as per screenshot) */}
              <div className="bg-card/50 p-3 rounded-xl flex items-center justify-between cursor-pointer hover:bg-card/80 transition-colors">
                <div className="flex items-center gap-2">
                   <div className="p-1.5 bg-orange-100 rounded-lg">
                      <div className="w-4 h-4 text-orange-500">⚖️</div>
                   </div>
                   <span className="font-semibold text-foreground/90">Constitutional & Administrative Law</span>
                   <span className="bg-purple-100 text-purple-600 px-2 py-0.5 rounded-md text-xs font-bold">{cases.length} cases</span>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground/70" />
              </div>

              {/* Case List */}
              <div className="space-y-3 pl-2">
                {cases.map((item, i) => (
                  <div key={item.case_number} className="group bg-card rounded-2xl p-4 shadow-sm border border-border/50/60 hover:shadow-md transition-all flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <span className="text-muted-foreground/70 font-bold w-6">{i + 1}.</span>
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground text-lg">
                          {item.case_name || item.case_number}
                        </span>
                        {item.case_name && (
                           <span className="text-xs text-muted-foreground/70 font-mono mt-0.5">{item.case_number}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Status Check */}
                        <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center border-2",
                             item.has_notes ? "bg-green-500 border-green-500" : "border-border"
                        )}>
                            {item.has_notes && <Check className="w-3.5 h-3.5 text-white stroke-3" />}
                        </div>

                        {/* Notes Button */}
                        <Link href={`/admin/notes/${item.case_number}/edit`}>
                            <div className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors cursor-pointer font-medium text-sm">
                                <BookOpen className="w-4 h-4" />
                                Notes
                            </div>
                        </Link>

                        <Link href={`/admin/quizzes/new?caseId=${item.case_number}`}>
                            <div className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer font-medium text-sm">
                                <HelpCircle className="w-4 h-4" />
                                Quiz
                            </div>
                        </Link>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
