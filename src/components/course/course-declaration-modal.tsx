'use client'

import { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Upload, Folder, FileText, ChevronRight, ChevronDown, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Types for the course declaration JSON
interface CourseDeclarationItem {
  id: string
  type: 'folder' | 'file'
  title: string
  hasNotes?: boolean
  hasQuiz?: boolean
  children?: CourseDeclarationItem[]
}

interface CourseDeclaration {
  courseName: string
  courseDescription: string
  isPublic: boolean
  structure: CourseDeclarationItem[]
}

interface CourseDeclarationModalProps {
  courseId: string
  nextOrderIndex?: number
  onStructureCreated: () => void
  createItem: (params: {
    course_id: string
    parent_id: string | null
    item_type: 'folder' | 'file'
    title: string
    order_index: number
  }) => string
}

// Recursive Tree Preview Component
function TreePreview({ 
  items, 
  depth = 0 
}: { 
  items: CourseDeclarationItem[]
  depth?: number 
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggle = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const isExpanded = expanded[item.id] !== false // Default expanded
        const hasChildren = item.children && item.children.length > 0

        return (
          <div key={item.id}>
            <div 
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer",
                depth === 0 && "bg-slate-50"
              )}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => hasChildren && toggle(item.id)}
            >
              {/* Expand Icon */}
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                )
              ) : (
                <span className="w-4" />
              )}

              {/* Type Icon */}
              {item.type === 'folder' ? (
                <Folder className="w-4 h-4 text-amber-500 shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-blue-500 shrink-0" />
              )}

              {/* Title */}
              <span className="text-sm font-medium text-slate-700 line-clamp-2 wrap-break-word">
                {item.title}
              </span>

              {/* ID Badge Hidden */}
              {/* <span className="text-xs text-slate-400 ml-auto shrink-0">
                {item.id}
              </span> */}

              {/* Notes/Quiz Badges for files */}
              {item.type === 'file' && (
                <div className="flex gap-1 shrink-0">
                  {item.hasNotes && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                      Notes
                    </span>
                  )}
                  {item.hasQuiz && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                      Quiz
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Children */}
            {hasChildren && isExpanded && (
              <TreePreview items={item.children!} depth={depth + 1} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function CourseDeclarationModal({ 
  courseId, 
  nextOrderIndex = 0,
  onStructureCreated,
  createItem 
}: CourseDeclarationModalProps) {
  const [open, setOpen] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [parsedData, setParsedData] = useState<CourseDeclaration | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'input' | 'preview'>('input')
  const [copied, setCopied] = useState(false) // Add copied state

  // Parse JSON and validate structure
  const handleParse = useCallback(() => {
    // ... existing parse logic
    try {
      const data = JSON.parse(jsonInput) as CourseDeclaration

      // Validate required fields
      if (!data.courseName) throw new Error('Missing courseName')
      if (!data.structure || !Array.isArray(data.structure)) {
        throw new Error('Missing or invalid structure array')
      }

      // Validate structure items recursively
      const validateItem = (item: CourseDeclarationItem, path: string) => {
        if (!item.id) throw new Error(`Missing id at ${path}`)
        if (!item.type || !['folder', 'file'].includes(item.type)) {
          throw new Error(`Invalid type at ${path}`)
        }
        if (!item.title) throw new Error(`Missing title at ${path}`)
        if (item.children) {
          item.children.forEach((child, i) => validateItem(child, `${path}.children[${i}]`))
        }
      }

      data.structure.forEach((item, i) => validateItem(item, `structure[${i}]`))

      setParsedData(data)
      setParseError(null)
      setStep('preview')
    } catch (e: any) {
      setParseError(e.message || 'Invalid JSON format')
      setParsedData(null)
    }
  }, [jsonInput])

  // Count total items for stats
  const countItems = useCallback((items: CourseDeclarationItem[]): { folders: number, files: number } => {
    let folders = 0, files = 0
    const count = (list: CourseDeclarationItem[]) => {
      for (const item of list) {
        if (item.type === 'folder') folders++
        else files++
        if (item.children) count(item.children)
      }
    }
    count(items)
    return { folders, files }
  }, [])

  // Save structure to database
  const handleSave = async () => {
    if (!parsedData) return

    setSaving(true)

    try {
      // Direct Supabase Batch Insert (Bypassing DraftStore for speed)
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      
      const itemsToInsert: any[] = []
      
      // Helper to process items recursively and prepare for batch insert
      const processItems = (
        items: CourseDeclarationItem[], 
        parentId: string | null,
        orderStart: number
      ) => {
        items.forEach((item, index) => {
          const newId = crypto.randomUUID()
          
          itemsToInsert.push({
            id: newId,
            course_id: courseId,
            parent_id: parentId,
            item_type: item.type,
            title: item.title,
            order_index: orderStart + index,
            is_active: true,
            // Add note_content if it's a file with notes (placeholder for now)
            // In a real scenario we'd insert note_content separately
          })

          // Recurse for children
          if (item.children && item.children.length > 0) {
            processItems(item.children, newId, 0)
          }
        })
      }

      // 1. Prepare data
      processItems(parsedData.structure, null, nextOrderIndex)
      
      // 2. Batch Insert
      if (itemsToInsert.length > 0) {
        console.log('Batch inserting', itemsToInsert.length, 'structure items...')
        const { error } = await supabase
          .from('structure_items')
          .insert(itemsToInsert)
        
        if (error) throw error
      }

      // 3. Update Course Info (if needed)
      // We don't update name/desc here as per modal design, usually just structure.
      // But if we wanted to update course details from JSON:
      /*
      if (parsedData.courseName) {
         await supabase.from('courses').update({ 
           name: parsedData.courseName,
           description: parsedData.courseDescription 
         }).eq('id', courseId)
      }
      */

      toast.success(`Successfully imported ${itemsToInsert.length} items!`)
      onStructureCreated()
      setOpen(false)
      resetModal()
    } catch (e: any) {
      console.error('Error creating structure:', e)
      toast.error('Failed to create structure: ' + (e.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const resetModal = () => {
    setJsonInput('')
    setParsedData(null)
    setParseError(null)
    setStep('input')
  }

  const stats = parsedData ? countItems(parsedData.structure) : null

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetModal() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Upload className="w-4 h-4" />
          Import Structure
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Course Declaration
          </DialogTitle>
        </DialogHeader>

        {step === 'input' ? (
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/30 p-3 rounded-lg border">
              <p className="text-sm text-muted-foreground">
                Use ChatGPT to generate the structure JSON from your topic list.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className={cn(
                  "gap-2 h-8 shrink-0 transition-all",
                  copied 
                    ? "bg-emerald-100 text-emerald-700 border-emerald-200" 
                    : "bg-background hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                )}
                onClick={() => {
                  const prompt = `I need you to generate a valid JSON object for a course structure based on a list of topics I will provide.

IMPORTANT: The JSON must strictly follow this exact schema or the system will reject it. DO NOT add any markdown formatting or explanations, just the raw JSON.

Structure Requirements:
1. Root object must have: courseName (string), courseDescription (string), isPublic (boolean, set to false), and structure (array).
2. structure array contains items.
3. Each item must have:
   - "id": unique string (e.g., "1", "1-1")
   - "type": exact string "folder" (for modules/chapters) or "file" (for lessons)
   - "title": string name of the content
   - "children": (optional) array of items inside a folder
   - "hasNotes": true (boolean) - ADD THIS TO EVERY FILE
   - "hasQuiz": true (boolean) - ADD THIS TO EVERY FILE

Example Output Format:
{
  "courseName": "My Course",
  "courseDescription": "Generated course structure",
  "isPublic": false,
  "structure": [
    {
      "id": "1",
      "type": "folder",
      "title": "Module 1",
      "children": [
        {
          "id": "1-1",
          "type": "file",
          "title": "Lesson 1",
          "hasNotes": true,
          "hasQuiz": true
        }
      ]
    }
  ]
}

Here are the topics to convert into this JSON structure:
[PASTE YOUR TOPICS HERE]`
                  navigator.clipboard.writeText(prompt)
                  toast.success('Prompt copied to clipboard!')
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <div className="w-4 h-4 text-emerald-600">✨</div>
                    Copy AI Prompt
                  </>
                )}
              </Button>
            </div>

            <div className="flex-1 min-h-[300px] relative">
              <Textarea
                placeholder={`{
  "courseName": "Indian Contract Act",
  "courseDescription": "...",
  "isPublic": false,
  "structure": [
    {
      "id": "1",
      "type": "folder",
      "title": "Formation of Contract",
      "children": [...]
    }
  ]
}`}
                className="absolute inset-0 w-full h-full font-mono text-sm resize-none"
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
              />
            </div>

            {parseError && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {parseError}
              </div>
            )}

            <div className="flex justify-end gap-2 shrink-0 pt-2 border-t mt-auto">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleParse} disabled={!jsonInput.trim()}>
                Preview Structure
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            {/* Stats */}
            <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg shrink-0">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium">{stats?.folders} Folders</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium">{stats?.files} Files</span>
              </div>
              <div className="ml-auto">
                <span className={cn(
                  "text-xs px-2 py-1 rounded-full",
                  parsedData?.isPublic 
                    ? "bg-green-100 text-green-700" 
                    : "bg-slate-200 text-slate-600"
                )}>
                  {parsedData?.isPublic ? 'Public' : 'Private'}
                </span>
              </div>
            </div>

            {/* Preview */}
            <div className="flex-1 border rounded-lg p-3 min-h-[200px] overflow-y-auto">
              <TreePreview items={parsedData?.structure || []} />
            </div>

            <div className="flex justify-between gap-2 shrink-0 pt-2 border-t mt-auto">
              <Button variant="ghost" onClick={() => setStep('input')}>
                ← Edit JSON
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Create Structure
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
