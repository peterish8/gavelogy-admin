'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronDown, Check, FileText, HelpCircle, BookOpen } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

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

export function CaseListView({ cases }: CaseListViewProps) {
  // Group cases by year
  const casesByYear = cases.reduce((acc, item) => {
    const year = item.year || 'Unknown'
    if (!acc[year]) {
      acc[year] = []
    }
    acc[year].push(item)
    return acc
  }, {} as Record<string, CaseItem[]>)

  // Sort years descending
  const years = Object.keys(casesByYear).sort((a, b) => b.localeCompare(a))

  // Color mapping for years (simulated based on screenshot sequence)
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
          <h2 className="text-3xl font-bold tracking-tight text-slate-800">{year}</h2>
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
                <span className="absolute text-[10px] font-bold text-slate-600">{styles.progress}</span>
             </div>
          </div>
          
          <div className={cn("p-1 rounded-full bg-white/20 text-slate-600 transition-transform duration-300", isOpen && "rotate-90")}>
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
            <div className="p-4 bg-slate-50/50 space-y-4">
              
              {/* Category Header (Mocked for now as per screenshot) */}
              <div className="bg-white/50 p-3 rounded-xl flex items-center justify-between cursor-pointer hover:bg-white/80 transition-colors">
                <div className="flex items-center gap-2">
                   <div className="p-1.5 bg-orange-100 rounded-lg">
                      <div className="w-4 h-4 text-orange-500">⚖️</div>
                   </div>
                   <span className="font-semibold text-slate-700">Constitutional & Administrative Law</span>
                   <span className="bg-purple-100 text-purple-600 px-2 py-0.5 rounded-md text-xs font-bold">{cases.length} cases</span>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </div>

              {/* Case List */}
              <div className="space-y-3 pl-2">
                {cases.map((item, i) => (
                  <div key={item.case_number} className="group bg-white rounded-2xl p-4 shadow-sm border border-slate-100/60 hover:shadow-md transition-all flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <span className="text-slate-400 font-bold w-6">{i + 1}.</span>
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-800 text-lg">
                          {item.case_name || item.case_number}
                        </span>
                        {item.case_name && (
                           <span className="text-xs text-slate-400 font-mono mt-0.5">{item.case_number}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Status Check */}
                        <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center border-2",
                             item.has_notes ? "bg-green-500 border-green-500" : "border-slate-200"
                        )}>
                            {item.has_notes && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                        </div>

                        {/* Notes Button */}
                        <Link href={`/admin/notes/${item.case_number}/edit`}>
                            <div className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors cursor-pointer font-medium text-sm">
                                <BookOpen className="w-4 h-4" />
                                Notes
                            </div>
                        </Link>

                        {/* Quiz Button */}
                        <Link href={`/admin/case-quizzes/${item.case_number}`}>
                            <div className="w-10 h-10 rounded-full bg-yellow-400 hover:bg-yellow-500 text-white flex items-center justify-center shadow-sm shadow-yellow-200 transition-all cursor-pointer">
                                <span className="font-bold text-lg font-serif">Q</span>
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
