'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Upload, Folder, FileText, ChevronRight, ChevronDown, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

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

interface NewCourseDeclarationModalProps {
  coursesCount: number
  onComplete: () => void
}

function TreePreview({ 
  items, 
  depth = 0,
  onDelete 
}: { 
  items: CourseDeclarationItem[]; 
  depth?: number;
  onDelete?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggle = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const isExpanded = expanded[item.id] !== false
        const hasChildren = item.children && item.children.length > 0

        return (
          <div key={item.id}>
            <div 
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer group",
                depth === 0 && "bg-slate-50"
              )}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => hasChildren && toggle(item.id)}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              ) : (
                <span className="w-4" />
              )}
              {item.type === 'folder' ? (
                <Folder className="w-4 h-4 text-amber-500 shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-blue-500 shrink-0" />
              )}
              <span className="text-sm font-medium text-slate-700 truncate">{item.title}</span>
              <span className="text-xs text-slate-400 ml-auto shrink-0">{item.id}</span>
              {item.type === 'file' && (
                <div className="flex gap-1 shrink-0">
                  {item.hasNotes && <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">Notes</span>}
                  {item.hasQuiz && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">Quiz</span>}
                </div>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(item.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all"
                  title={item.type === 'folder' ? 'Delete folder (children will be promoted)' : 'Delete file'}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              )}
            </div>
            {hasChildren && isExpanded && <TreePreview items={item.children!} depth={depth + 1} onDelete={onDelete} />}
          </div>
        )
      })}
    </div>
  )
}

export function NewCourseDeclarationModal({ coursesCount, onComplete }: NewCourseDeclarationModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [parsedData, setParsedData] = useState<CourseDeclaration | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'input' | 'preview'>('input')

  const handleParse = useCallback(() => {
    try {
      const data = JSON.parse(jsonInput) as CourseDeclaration
      if (!data.courseName) throw new Error('Missing courseName')
      if (!data.structure || !Array.isArray(data.structure)) throw new Error('Missing or invalid structure array')

      const validateItem = (item: CourseDeclarationItem, path: string) => {
        if (!item.id) throw new Error(`Missing id at ${path}`)
        if (!item.type || !['folder', 'file'].includes(item.type)) throw new Error(`Invalid type at ${path}`)
        if (!item.title) throw new Error(`Missing title at ${path}`)
        if (item.children) item.children.forEach((child, i) => validateItem(child, `${path}.children[${i}]`))
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

  const countItems = useCallback((items: CourseDeclarationItem[]): { folders: number; files: number } => {
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

  // Delete item and promote children to parent level
  const handleDeleteItem = useCallback((idToDelete: string) => {
    if (!parsedData) return

    const deleteAndPromote = (items: CourseDeclarationItem[]): CourseDeclarationItem[] => {
      const result: CourseDeclarationItem[] = []
      
      for (const item of items) {
        if (item.id === idToDelete) {
          // Found the item to delete - promote its children to this level
          if (item.children && item.children.length > 0) {
            result.push(...item.children)
          }
          // Don't add the deleted item itself
        } else {
          // Keep the item, but recursively check its children
          const newItem = { ...item }
          if (item.children) {
            newItem.children = deleteAndPromote(item.children)
          }
          result.push(newItem)
        }
      }
      
      return result
    }

    const newStructure = deleteAndPromote(parsedData.structure)
    setParsedData({
      ...parsedData,
      structure: newStructure
    })
    
    toast.success('Item removed. Children promoted to parent level.')
  }, [parsedData])

  // DIRECT SAVE TO SUPABASE - No draft store, immediate save
  const handleSave = async () => {
    if (!parsedData) return
    setSaving(true)

    try {
      const supabase = createClient()

      // 1. Create the course directly in database (PRIVATE by default: is_active = false)
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .insert({
          name: parsedData.courseName,
          description: parsedData.courseDescription || 'Course description',
          icon: '📚',
          order_index: coursesCount,
          is_active: false, // PRIVATE by default
          version: 1,
          price: 0
        })
        .select()
        .single()

      if (courseError) throw courseError
      if (!courseData) throw new Error('Failed to create course')

      const newCourseId = courseData.id

      // 2. Recursively create structure items directly in database
      const createRecursive = async (items: CourseDeclarationItem[], parentId: string | null, orderStart: number = 0) => {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          
          const { data: itemData, error: itemError } = await supabase
            .from('structure_items')
            .insert({
              course_id: newCourseId,
              parent_id: parentId,
              item_type: item.type,
              title: item.title,
              order_index: orderStart + i
            })
            .select()
            .single()

          if (itemError) {
            console.error('Error creating item:', itemError)
            continue
          }

          // Create children recursively
          if (item.children && item.children.length > 0 && itemData) {
            await createRecursive(item.children, itemData.id, 0)
          }
        }
      }

      await createRecursive(parsedData.structure, null, 0)
      
      toast.success('Course created successfully! (Private by default)')
      onComplete()
      setOpen(false)
      resetModal()
      router.push(`/admin/studio/${newCourseId}`)
    } catch (e) {
      console.error('Error creating course:', e)
      toast.error('Failed to create course')
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
        <Button variant="outline" size="default" className="gap-2 h-11">
          <Upload className="w-4 h-4" />
          Import Course
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Course Structure
          </DialogTitle>
        </DialogHeader>

        {step === 'input' ? (
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            <p className="text-sm text-muted-foreground">
              Paste your course structure JSON. This will create a <strong>new course</strong> with the full structure.
            </p>

            <Textarea
              placeholder='{"courseName": "...", "structure": [...]}'
              className="flex-1 min-h-[200px] font-mono text-sm"
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
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleParse} disabled={!jsonInput.trim()}>Preview Structure</Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/10 shrink-0">
              <p className="text-sm text-muted-foreground">New Course</p>
              <p className="font-semibold text-lg">{parsedData?.courseName}</p>
              {parsedData?.courseDescription && (
                <p className="text-sm text-muted-foreground mt-1">{parsedData.courseDescription}</p>
              )}
            </div>

            <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg shrink-0">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium">{stats?.folders} Folders</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium">{stats?.files} Files</span>
              </div>
              <span className={cn("text-xs px-2 py-1 rounded-full ml-auto", parsedData?.isPublic ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600")}>
                {parsedData?.isPublic ? 'Public' : 'Private'}
              </span>
            </div>

            <div className="flex-1 border rounded-lg p-3 overflow-y-auto min-h-[150px]">
              <TreePreview items={parsedData?.structure || []} onDelete={handleDeleteItem} />
            </div>
            <p className="text-xs text-muted-foreground shrink-0">
              💡 Hover to see delete button. Deleting a folder promotes its children to parent level.
            </p>

            <div className="flex justify-between gap-2 shrink-0">
              <Button variant="ghost" onClick={() => setStep('input')}>← Edit JSON</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Creating...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" />Create Course</>
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
