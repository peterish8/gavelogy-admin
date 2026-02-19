'use client'

import { DraftProvider } from '@/contexts/draft-context'
import { SaveBar } from '@/components/admin/save-bar'

interface StudioLayoutProps {
  children: React.ReactNode
}

export default function StudioLayout({ children }: StudioLayoutProps) {
  return (
    <DraftProvider>
      <div className="min-h-[calc(100vh-4rem)]">
        {children}
        
        {/* Sticky save bar - appears when there are unsaved changes */}
        <SaveBar />
      </div>
    </DraftProvider>
  )
}
