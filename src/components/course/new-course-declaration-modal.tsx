'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Upload, Folder, FileText, ChevronRight, ChevronDown, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useMutation } from 'convex/react'
import { api } from '@convex/_generated/api'

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

// Recursive tree component that renders the parsed course structure with expand/collapse and optional per-item delete.
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
                "flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/80 transition-colors cursor-pointer group",
                depth === 0 && "bg-muted"
              )}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => hasChildren && toggle(item.id)}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground/70 shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground/70 shrink-0" />
              ) : (
                <span className="w-4" />
              )}
              {item.type === 'folder' ? (
                <Folder className="w-4 h-4 text-amber-500 shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-blue-500 shrink-0" />
              )}
              <span className="text-sm font-medium text-foreground/90 line-clamp-2 wrap-break-word">{item.title}</span>
              {/* ID Hidden as per request */}
              {/* <span className="text-xs text-muted-foreground/70 ml-auto shrink-0">{item.id}</span> */}
              {item.type === 'file' && (
                <div className="flex gap-1 shrink-0">
                  {item.hasNotes && <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-white rounded">Notes</span>}
                  {item.hasQuiz && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-white rounded">Quiz</span>}
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

// Modal for importing a course from a JSON declaration (AI-generated structure); validates, previews, then saves to Supabase.
export function NewCourseDeclarationModal({ coursesCount, onComplete }: NewCourseDeclarationModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [parsedData, setParsedData] = useState<CourseDeclaration | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'input' | 'preview'>('input')
  const [copied, setCopied] = useState(false)

  const importCourseStructure = useMutation(api.adminMutations.importCourseStructure)

  // Parses and validates the pasted JSON declaration, advancing to the preview step on success.
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

  // Recursively counts total folders and files across the parsed structure for the preview stats bar.
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

  // Removes a node from the preview tree; its children are promoted up one level rather than deleted.
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

  // Flattens the nested tree into a list and sends one single Convex mutation.
  const handleSave = async () => {
    if (!parsedData) return
    setSaving(true)
    const toastId = toast.loading('Creating course...')

    try {
      // Flatten nested tree → flat list with parentTempId references
      const flatItems: { tempId: string; parentTempId: string | null; item_type: string; title: string; order_index: number }[] = []

      const flatten = (items: CourseDeclarationItem[], parentTempId: string | null) => {
        items.forEach((item, i) => {
          flatItems.push({ tempId: item.id, parentTempId, item_type: item.type, title: item.title, order_index: i })
          if (item.children?.length) flatten(item.children, item.id)
        })
      }
      flatten(parsedData.structure, null)

      // Single network call — everything happens server-side
      const newCourseId = await importCourseStructure({
        courseName: parsedData.courseName,
        courseDescription: parsedData.courseDescription || '',
        items: flatItems.map(i => ({
          tempId: i.tempId,
          parentTempId: i.parentTempId ?? undefined,
          item_type: i.item_type,
          title: i.title,
          order_index: i.order_index,
        })),
      })

      toast.success('Course created!', { id: toastId })
      onComplete()
      setOpen(false)
      resetModal()
      router.push(`/admin/studio/${newCourseId}`)
    } catch (e: any) {
      console.error('Error creating course:', e)
      toast.error(e?.message || 'Failed to create course', { id: toastId })
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

      <DialogContent className="max-w-5xl max-h-[80vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Course Structure
          </DialogTitle>
        </DialogHeader>

        {step === 'input' ? (
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/30 p-3 rounded-lg border">
              <p className="text-sm text-muted-foreground">
                Use ChatGPT to generate the structure JSON from. This creates a <strong>new course</strong>.
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
                placeholder='{"courseName": "...", "structure": [...]}'
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

            <div className="flex items-center gap-4 p-3 bg-muted rounded-lg shrink-0">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium">{stats?.folders} Folders</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium">{stats?.files} Files</span>
              </div>
              <span className={cn("text-xs px-2 py-1 rounded-full ml-auto", parsedData?.isPublic ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-white" : "bg-muted text-muted-foreground dark:bg-muted/50 dark:text-white")}>
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
