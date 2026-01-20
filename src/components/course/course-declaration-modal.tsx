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
  onStructureCreated,
  createItem 
}: CourseDeclarationModalProps) {
  const [open, setOpen] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [parsedData, setParsedData] = useState<CourseDeclaration | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'input' | 'preview'>('input')

  // Parse JSON and validate structure
  const handleParse = useCallback(() => {
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
      // Recursively create items in the database
      const createRecursive = (
        items: CourseDeclarationItem[], 
        parentId: string | null,
        orderStart: number = 0
      ) => {
        items.forEach((item, index) => {
          const newId = createItem({
            course_id: courseId,
            parent_id: parentId,
            item_type: item.type,
            title: item.title,
            order_index: orderStart + index
          })

          // Create children recursively
          if (item.children && item.children.length > 0) {
            createRecursive(item.children, newId, 0)
          }
        })
      }

      // Create all items
      createRecursive(parsedData.structure, null, 0)

      toast.success('Course structure created successfully!')
      onStructureCreated()
      setOpen(false)
      resetModal()
    } catch (e) {
      console.error('Error creating structure:', e)
      toast.error('Failed to create structure')
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
          <div className="space-y-4 flex-1">
            <p className="text-sm text-muted-foreground">
              Paste your course structure JSON below. Use ChatGPT to generate this from your topic list.
            </p>

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
              className="min-h-[300px] font-mono text-sm"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
            />

            {parseError && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {parseError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleParse} disabled={!jsonInput.trim()}>
                Preview Structure
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 flex-1 flex flex-col">
            {/* Stats */}
            <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
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
            <div className="flex-1 border rounded-lg p-3 max-h-[350px] overflow-y-auto">
              <TreePreview items={parsedData?.structure || []} />
            </div>

            <div className="flex justify-between gap-2">
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
