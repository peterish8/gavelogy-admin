import { fetchQuery } from 'convex/nextjs'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import Link from 'next/link'
import { ArrowLeft, Save, FileText, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PageProps {
  params: Promise<{
    courseId: string
    itemId: string
  }>
}

export default async function ContentEditorPage(props: PageProps) {
  const params = await props.params;
  const { courseId, itemId } = params;

  const item = await fetchQuery(api.content.getStructureItemWithRelations, {
    itemId: itemId as Id<'structure_items'>,
  })

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
          <h2 className="text-2xl font-bold mb-4">Content Not Found</h2>
          <p className="text-muted-foreground mb-6">
              We couldn't find this content item.
              <br/>
              If you just created it, please <strong>Save Changes</strong> in the Course Studio first.
          </p>
          <Link href={`/admin/studio/${courseId}`}>
              <Button>Back to Studio</Button>
          </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4 bg-background z-10">
        <div className="flex items-center gap-3">
          <Link href={`/admin/studio/${courseId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex flex-col">
             <div className="flex items-center gap-2">
                {item.item_type === 'file' ? <FileText className="w-4 h-4 text-blue-500" /> : <HelpCircle className="w-4 h-4 text-purple-500" />}
                <h1 className="text-lg font-bold text-foreground leading-none">{item.title}</h1>
             </div>
             <p className="text-xs text-muted-foreground mt-1">
                {item.course?.name} / Editor
             </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <Button size="sm" className="gap-2">
                <Save className="w-4 h-4" />
                Save Content
            </Button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 overflow-hidden bg-muted relative">
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="text-center max-w-md">
                <p className="text-xl font-semibold mb-2">Content Editor Placeholder</p>
                <p>
                    {item.item_type === 'file' 
                        ? "Rich Text Editor (Tiptap) will go here for Note content." 
                        : "Quiz Builder will go here."}
                </p>
                <div className="mt-8 p-4 bg-card border border-border rounded-lg text-left text-sm font-mono shadow-sm">
                    <p className="font-bold text-xs text-muted-foreground/70 mb-2">DEBUG INFO:</p>
                    <p>Item ID: {item.id}</p>
                    <p>Type: {item.item_type}</p>
                    <p>Has Note: {item.note_content ? 'Yes' : 'No'}</p>
                    <p>Has Quiz: {item.attached_quiz ? 'Yes' : 'No'}</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  )
}
