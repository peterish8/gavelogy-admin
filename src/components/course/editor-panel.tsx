'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDraftStore } from '@/lib/stores/draft-store'
import { useLocalContentCache } from '@/lib/stores/local-content-cache'
import { cn } from '@/lib/utils'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import BubbleMenuExtension from '@tiptap/extension-bubble-menu'
import { Extension } from '@tiptap/core'
import { Node, mergeAttributes } from '@tiptap/core'
import { htmlToCustom, customToHtml } from '@/lib/content-converter'
import { Loader2, Save, FileText, GripVertical, Bold, Italic, Underline as UnderlineIcon, X, AlertTriangle, CheckCircle, RotateCcw, Highlighter, Type, Minus, Maximize2, Minimize2, List, ListOrdered, Eye, Edit3, MessageSquare, StickyNote, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { QuizPreview } from './quiz-preview'
import { parseQuizText, serializeQuiz } from '@/lib/quiz-parser'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// --- Extensions ---

export const NoteBox = Node.create({
  name: 'noteBox',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      color: {
        default: 'blue',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div',
        getAttrs: element => {
            const el = element as HTMLElement
            if (el.classList.contains('note-box')) {
                const colorClass = Array.from(el.classList).find(c => c.startsWith('note-') && c !== 'note-box')
                const color = colorClass ? colorClass.replace('note-', '') : 'blue'
                return { color }
            }
            return false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: `note-box note-${HTMLAttributes.color}` }), 0]
  },

  addCommands() {
    return {
      toggleNoteBox: attributes => ({ commands }) => {
        return commands.toggleWrap(this.name, attributes)
      },
      setNoteBox: attributes => ({ commands }) => {
        return commands.setNode(this.name, attributes)
      },
      unsetNoteBox: () => ({ commands }) => {
        return commands.lift(this.name)
      },
    }
  },
})

// Font Size Extension
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
    noteBox: {
        toggleNoteBox: (attributes: { color: string }) => ReturnType
        setNoteBox: (attributes: { color: string }) => ReturnType
        unsetNoteBox: () => ReturnType
    }
  }
}

export const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return {
      types: ['textStyle'],
    }
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize.replace(/['"]+/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {}
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize })
          .run()
      },
      unsetFontSize: () => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize: null })
          .run()
      },
    }
  },
})

// Define extensions outside component to prevent re-creation on render (fixes duplicate extension warnings)
const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    // @ts-ignore
    underline: false,
  }),
  Underline,
  TextStyle,
  FontSize,
  Highlight.configure({ multicolor: true }), 
  BubbleMenuExtension,
  NoteBox as any, 
]

interface EditorPanelProps {
  itemId: string | null
  itemType: 'file' | 'folder' | null
  courseId: string
  title: string
  onClose?: () => void
  onTitleChange?: (newTitle: string) => void
}

export function EditorPanel({ itemId, itemType, courseId, title, onClose, onTitleChange }: EditorPanelProps) {
  const [loading, setLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveQuizLoading, setSaveQuizLoading] = useState(false)
  const [publishLoading, setPublishLoading] = useState(false)
  const [initialContent, setInitialContent] = useState('')
  // Decoupled fetch state to handle editor race conditions
  const [fetchedData, setFetchedData] = useState<any>(null)
  
  const { changes } = useDraftStore()
  
  // Local content cache for persisting unsaved changes
  const localCache = useLocalContentCache()
  const prevItemIdRef = useRef<string | null>(null)
  
  // Reactivity State (to force toolbar updates)
  const [, setTick] = useState(0)
  
  // UI State
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Active Tab
  const [activeTab, setActiveTab] = useState("note")

  // Draft System State
  const [hasDraft, setHasDraft] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [publishedContent, setPublishedContent] = useState('') // Content from note_contents (what users see)

  // Auto-save state
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)

  // Quiz State
  const [quizContent, setQuizContent] = useState('')
  const [originalQuizContent, setOriginalQuizContent] = useState('')

  // Title Editing State (for inline rename)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(title)

  // Sync editedTitle when title prop changes (after save)
  useEffect(() => {
    setEditedTitle(title)
  }, [title])

  // Check if this item is a new draft (unsaved in structure)
  const isStructureDraft = changes.some(c => c.entityId === itemId && c.action === 'create')

  // Initialize Tiptap Editor
  const editor = useEditor({
    immediatelyRender: false,
    extensions: EDITOR_EXTENSIONS,
    content: '',
    editorProps: {
      attributes: {
        class: cn(
            'prose prose-lg max-w-none focus:outline-none p-8 text-lg leading-relaxed outline-none',
            'prose-headings:font-bold prose-h1:text-4xl prose-h2:text-3xl prose-p:text-slate-700',
            'prose-li:text-black prose-li:marker:text-black',
            'min-h-[500px]'
        ),
      },
    },
    // Force re-render on selection updates to sync toolbar state (bold, font size, etc)
    onTransaction: () => {
        setTick(prev => prev + 1)
    },
  })

  // Close expanded mode on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && isExpanded) {
            setIsExpanded(false)
        }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isExpanded])

  const [quizSplit, setQuizSplit] = useState(50) // Percentage width of left panel
  const [isDragging, setIsDragging] = useState(false)

  // Drag handler
  useEffect(() => {
     if (!isDragging) return
     
     const handleMouseMove = (e: MouseEvent) => {
         // Calculate percentage
         const container = document.getElementById('quiz-split-container')
         if (!container) return
         
         const rect = container.getBoundingClientRect()
         const x = e.clientX - rect.left
         let percentage = (x / rect.width) * 100
         
         // Clamp between 20% and 80%
         percentage = Math.max(20, Math.min(80, percentage))
         setQuizSplit(percentage)
     }
     
     const handleMouseUp = () => {
         setIsDragging(false)
         document.body.style.cursor = 'default'
         document.body.style.userSelect = 'auto'
     }
     
     document.addEventListener('mousemove', handleMouseMove)
     document.addEventListener('mouseup', handleMouseUp)
     
     document.body.style.cursor = 'col-resize'
     document.body.style.userSelect = 'none' // Prevent text selection while dragging

     return () => {
         document.removeEventListener('mousemove', handleMouseMove)
         document.removeEventListener('mouseup', handleMouseUp)
         document.body.style.cursor = 'default'
         document.body.style.userSelect = 'auto'
     }
  }, [isDragging])


  // ---------------------------------------------------------------------------
  // ARCHITECTURE: Decoupled Fetch & Apply (Fixes "Forever Loading" Bug)
  // ---------------------------------------------------------------------------

  // Effect A: Save on Leave (Cache unsaved changes before switching)
  useEffect(() => {
    if (prevItemIdRef.current && prevItemIdRef.current !== itemId && editor) {
        const currentHtml = editor.getHTML()
        // Only cache if content has changed from initial
        if (currentHtml && currentHtml !== initialContent) {
            localCache.setNoteContent(prevItemIdRef.current, currentHtml)
            console.log('EditorPanel: Cached unsaved content for', prevItemIdRef.current)
        }
        // Also cache quiz content
        if (quizContent && quizContent !== originalQuizContent) {
            localCache.setQuizContent(prevItemIdRef.current, quizContent)
        }
    }
    prevItemIdRef.current = itemId
  }, [itemId, editor, initialContent, quizContent, originalQuizContent])

  // Effect B: Fetch Content (Independent of Editor)
  useEffect(() => {
    if (!itemId || itemType !== 'file') {
        setLoading(false)
        return
    }

    // New item draft override
    if (isStructureDraft) {
        setFetchedData({ empty: true, source: 'structure-draft' })
        setLoading(false)
        return
    }

    let isMounted = true
    setLoading(true)

    async function fetch() {
        console.log('EditorPanel: [Fetch] Starting for', itemId)
        try {
            const supabase = createClient()
            
            // Check Local Cache First
            const cachedNote = localCache.getNoteContent(itemId!)
            const cachedQuiz = localCache.getQuizContent(itemId!)

            // Fetch DB Data in Parallel
            const [draftRes, liveRes, quizRes] = await Promise.all([
                supabase.from('draft_content_cache').select('*').eq('original_content_id', itemId!).maybeSingle(),
                supabase.from('note_contents').select('*').eq('item_id', itemId!).maybeSingle(),
                supabase.from('attached_quizzes').select('*, quiz_questions(*)').eq('note_item_id', itemId!).maybeSingle()
            ])

            if (!isMounted) return

            setFetchedData({
                itemId,
                source: cachedNote ? 'cache' : (draftRes.data ? 'draft' : 'live'),
                content: cachedNote || draftRes.data?.draft_data?.content_html || liveRes.data?.content_html || '',
                publishedContent: liveRes.data?.content_html || '',
                hasDraft: !!draftRes.data,
                draftId: draftRes.data?.id || null,
                
                // Quiz Data
                quizSource: cachedQuiz ? 'cache' : 'db',
                quizContent: cachedQuiz || null,
                quizData: quizRes.data
            })
            console.log('EditorPanel: [Fetch] Complete - setFetchedData called for', itemId)
            
        } catch (e) {
            console.error('Error fetching content:', e)
        } finally {
            if (isMounted) {
                console.log('EditorPanel: [Fetch] Finally - setLoading(false)')
                setLoading(false)
            }
        }
    }

    fetch()
    
    // Safety timeout - force clear loading after 5 seconds
    const safetyTimeout = setTimeout(() => {
        if (isMounted) {
            console.log('EditorPanel: [Safety Timeout] Forcing loading to false')
            setLoading(false)
        }
    }, 5000)

    return () => { 
        isMounted = false 
        clearTimeout(safetyTimeout)
    }
  }, [itemId, itemType, isStructureDraft])

  // Effect C: Apply Content (When Editor & Data are Ready)
  useEffect(() => {
    // DIAGNOSTIC LOGGING - identify which condition is failing
    console.log('EditorPanel: [Apply Check]', {
        hasEditor: !!editor,
        hasFetchedData: !!fetchedData,
        fetchedItemId: fetchedData?.itemId,
        currentItemId: itemId,
        match: fetchedData?.itemId === itemId
    })
    
    if (!editor) {
        console.log('EditorPanel: [Apply] BLOCKED - editor is null')
        return
    }
    if (!fetchedData) {
        console.log('EditorPanel: [Apply] BLOCKED - fetchedData is null')
        return
    }
    if (fetchedData.itemId !== itemId) {
        console.log('EditorPanel: [Apply] BLOCKED - itemId mismatch:', fetchedData.itemId, '!==', itemId)
        return
    }

    // Prevent re-applying same content
    // We use a timestamp or just equality check logic could work, but here we trust the dependency array
    // However, to be safe, we only apply if the editor content is empty or we just switched
    // Actually, Tiptap's setContent is smart, but let's be explicit.
    
    console.log('EditorPanel: [Apply] Applying content for', itemId, 'Source:', fetchedData.source)

    if (fetchedData.empty) {
        editor.commands.setContent('')
        setInitialContent('')
        setHasDraft(false)
        setDraftId(null)
        setPublishedContent('')
        setQuizContent('')
        setOriginalQuizContent('')
        return
    }

    // 1. Set Editor Content
    const html = customToHtml(fetchedData.content)
    // Only update if significantly different to prevent cursor jumps if this runs oddly
    // But since it runs on [fetchedData] change, it should be fine.
    editor.commands.setContent(html)
    setInitialContent(html)
    
    // 2. Set State
    setHasDraft(fetchedData.hasDraft)
    setDraftId(fetchedData.draftId)
    setPublishedContent(customToHtml(fetchedData.publishedContent))

    // 3. Set Quiz Content
    if (fetchedData.quizContent) {
        // From Cache
        setQuizContent(fetchedData.quizContent)
        // We still need regular original content for diffing
        // ... (reconstruct original logic if needed, but for now simplify)
        setOriginalQuizContent('') // Simplified for cache scenario or need to derive
    } 
    
    // Reconstruct Quiz Data if from DB
    if (fetchedData.quizData) {
        const qData = fetchedData.quizData
        const questions = (qData.quiz_questions || [])
            .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
            .map((q: any, i: number) => ({
                id: i,
                questionText: q.question_text,
                options: q.options || [],
                correctAnswer: q.correct_answer,
                explanation: q.explanation || ''
            }))
        
        const serialized = serializeQuiz({ title: qData.title, questions })
         
        if (!fetchedData.quizContent) {
             setQuizContent(serialized)
        }
        setOriginalQuizContent(serialized)
    } else if (!fetchedData.quizContent) {
        setQuizContent('')
        setOriginalQuizContent('')
    }

  }, [editor, fetchedData, itemId])

  // Save to Draft (Cache) - NOTE Only
  const handleSaveDraft = async (silent = false) => {
    // Check if structure draft first
    if (isStructureDraft) {
        if (!silent) {
            toast.error("Please save the new item in the sidebar first!", {
                description: "We need a permanent ID before saving content drafts."
            })
        }
        return
    }

    if (!itemId || !editor) return
    
    if (!silent) setSaveLoading(true)
    else setIsAutoSaving(true)

    const currentHtml = editor.getHTML()
    const customSyntax = htmlToCustom(currentHtml)
    
    try {
        const supabase = createClient()
        
        // Check if draft already exists
        const { data: existingDraft } = await supabase
            .from('draft_content_cache')
            .select('id')
            .eq('original_content_id', itemId)
            .maybeSingle()

        if (existingDraft) {
            // Update existing draft
            const { error } = await supabase
                .from('draft_content_cache')
                .update({ 
                    draft_data: { content_html: customSyntax },
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingDraft.id)

            if (error) throw error
        } else {
            // Insert new draft
            const { error } = await supabase
                .from('draft_content_cache')
                .insert({ 
                    original_content_id: itemId,
                    draft_data: { content_html: customSyntax }
                })

            if (error) throw error
        }
        
        setHasDraft(true)
        setLastSaved(new Date())
        setInitialContent(currentHtml)
        
        // Clear local cache since content is now saved to draft
        localCache.clearContent(itemId)
        
        if (!silent) toast.success("Draft saved successfully")
        
    } catch (e: any) {
        console.error('Error saving draft full:', JSON.stringify(e, null, 2))
        console.error('Error details:', e.message || e.error_description || e)
        if (!silent) toast.error(`Failed to save draft: ${e.message || 'Check console limits'}`)
    } finally {
        if (!silent) setSaveLoading(false)
        else setIsAutoSaving(false)
    }
  }

  // Save Quiz Logic - NEW UNIFIED ARCHITECTURE
  const handleSaveQuiz = async () => {
    if (!itemId) return
    setSaveQuizLoading(true)

    try {
        const supabase = createClient()
        
        // 1. Parse the quiz text into structured data
        const parsedQuiz = parseQuizText(quizContent)
        
        if (parsedQuiz.questions.length === 0) {
            toast.error("No valid questions found. Use format: Q1. Question text...")
            setSaveQuizLoading(false)
            return
        }

        console.log('Saving quiz with', parsedQuiz.questions.length, 'questions')

        // 2. Check if quiz already exists for this note
        const { data: existingQuiz } = await supabase
            .from('attached_quizzes')
            .select('id')
            .eq('note_item_id', itemId)
            .maybeSingle()

        let quizId: string

        if (existingQuiz) {
            // Update existing quiz
            const { error: updateError } = await supabase
                .from('attached_quizzes')
                .update({ 
                    title: parsedQuiz.title || title || 'Quiz',
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingQuiz.id)

            if (updateError) throw updateError
            quizId = existingQuiz.id
            console.log('Updated existing quiz:', quizId)
        } else {
            // Insert new quiz
            const { data: newQuiz, error: insertQuizError } = await supabase
                .from('attached_quizzes')
                .insert({ 
                    note_item_id: itemId,
                    title: parsedQuiz.title || title || 'Quiz'
                })
                .select('id')
                .single()

            if (insertQuizError) throw insertQuizError
            quizId = newQuiz.id
            console.log('Created new quiz:', quizId)
        }
        
        const quizIdFinal = quizId

        // 3. Delete old questions for this quiz (to handle edits)
        const { error: deleteError } = await supabase
            .from('quiz_questions')
            .delete()
            .eq('quiz_id', quizIdFinal)

        if (deleteError) {
            console.warn('Failed to delete old questions:', deleteError)
        }

        // 4. Insert new questions
        const questionsToInsert = parsedQuiz.questions.map((q, index) => ({
            quiz_id: quizIdFinal,
            question_text: q.questionText,
            options: q.options, // JSONB field
            correct_answer: q.correctAnswer,
            explanation: q.explanation,
            order_index: index
        }))

        const { error: insertError } = await supabase
            .from('quiz_questions')
            .insert(questionsToInsert)

        if (insertError) throw insertError
        
        setOriginalQuizContent(quizContent)
        toast.success(`Quiz saved with ${parsedQuiz.questions.length} questions`)
    } catch (e: any) {
        console.error("Error saving quiz:", e)
        toast.error(`Failed to save quiz: ${e.message}`)
    } finally {
        setSaveQuizLoading(false)
    }
  }

  // Ref for auto-save debounce (Notes only)
  const autoSaveTimerRef = useState<{ current: NodeJS.Timeout | null }>({ current: null })[0]
  
  // Clipboard Handler for Custom Keywords
  useEffect(() => {
      if (!editor) return

      const handleCopy = (e: ClipboardEvent) => {
          if (!editor.isFocused) return

          e.preventDefault()
          
          const selection: Selection | null = window.getSelection()
          if (!selection || selection.rangeCount === 0) return

          const container = document.createElement("div")
          for (let i = 0, len = selection.rangeCount; i < len; ++i) {
              container.appendChild(selection.getRangeAt(i).cloneContents())
          }
          const selectedHtml = container.innerHTML

          if (selectedHtml) {
              const customText = htmlToCustom(selectedHtml)
              if (e.clipboardData) {
                  e.clipboardData.setData('text/plain', customText)
                  e.clipboardData.setData('text/html', selectedHtml)
              }
          }
      }
      
      const viewDom = editor.view.dom
      viewDom.addEventListener('copy', handleCopy)
      
      return () => {
          viewDom.removeEventListener('copy', handleCopy)
      }
  }, [editor])


  // Publish (Commit Cache to Live)
  const handlePublish = async () => {
    if (!itemId || !editor) return
    
    setPublishLoading(true)
    const currentHtml = editor.getHTML()
    const customSyntax = htmlToCustom(currentHtml)
    
    try {
        const supabase = createClient()
        
        // 1. Update Live Table
        const { error: liveError } = await supabase
            .from('note_contents')
            .upsert({ 
                item_id: itemId,
                content_html: customSyntax,
                updated_at: new Date().toISOString()
            }, { onConflict: 'item_id' })

        if (liveError) throw liveError
        
        // 2. Delete Draft (Cache)
        const { error: deleteError } = await supabase
            .from('draft_content_cache')
            .delete()
            .eq('original_content_id', itemId)

        if (deleteError) console.warn('Failed to clean up draft', deleteError)
        
        setHasDraft(false)
        setDraftId(null)
        setInitialContent(currentHtml)
        setPublishedContent(currentHtml) // Update published content so Publish button disables
        
        // Clear local cache
        localCache.clearContent(itemId)
        
        toast.success("Content published successfully")
    } catch (e) {
        console.error('Error publishing content', e)
        toast.error('Failed to publish content')
    } finally {
        setPublishLoading(false)
    }
  }

  // Discard Draft
  // Discard - Reverts to published content (note_contents table), or blank if never published
  const handleDiscardDraft = async () => {
      if (!confirm('Are you sure you want to discard all changes? This will revert to the last published version.')) return
      
      setLoading(true)
      try {
          const supabase = createClient()
          
          // Delete draft from cache table
          await supabase.from('draft_content_cache').delete().eq('original_content_id', itemId)
          
          // Clear local memory cache
          if (itemId) localCache.clearContent(itemId)
          
          setHasDraft(false)
          setDraftId(null)
          
          // Fetch published content (or empty if never published)
          const { data } = await supabase
                .from('note_contents')
                .select('*')
                .eq('item_id', itemId)
                .limit(1)
            
          const rawContent = data?.[0]?.content_html || ''
          const htmlContent = customToHtml(rawContent)
          editor?.commands.setContent(htmlContent)
          setInitialContent(htmlContent)
          setPublishedContent(htmlContent) // Update published content reference
          
          toast.success(rawContent ? "Reverted to published version" : "Reverted to blank (never published)")
            
      } catch (e) {
          console.error('Error discarding draft', e)
          toast.error("Failed to discard draft")
      } finally {
          setLoading(false)  // Always ensure loading is cleared
      }
  }

  // Toggle NoteBox
  const toggleNote = (color: string) => {
    if (!editor) return

    if (editor.isActive('noteBox', { color })) {
        (editor.commands as any).unsetNoteBox()
    } else {
        (editor.commands as any).toggleNoteBox({ color })
    }
  }

  if (!itemId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-slate-50/50 rounded-xl border border-dashed border-slate-200 m-4">
        <div className="bg-white p-4 rounded-full shadow-sm mb-4">
            <FileText className="w-8 h-8 text-slate-300" />
        </div>
        <p className="font-medium">Select a note to edit content</p>
      </div>
    )
  }

  if (itemType === 'folder') {
     return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-slate-50/50 rounded-xl border border-dashed border-slate-200 m-4">
        <div className="bg-white p-4 rounded-full shadow-sm mb-4">
            <GripVertical className="w-8 h-8 text-slate-300" />
        </div>
        <p className="font-medium">Folder Selected</p>
        <p className="text-sm mt-2 max-w-xs text-center">You can rename folders in the tree. Select a file inside to edit its content.</p>
      </div>
    )
  }

  return (
    <div 
        className={cn(
            "h-full flex flex-col bg-white rounded-xl shadow-sm border border-border overflow-hidden transition-all duration-300",
            isExpanded && "fixed inset-0 z-50 rounded-none border-0"
        )}
    >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-white z-10 relative">
            <Button variant="ghost" size="sm" onClick={onClose} className="mr-2">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
            </Button>
            <div className="flex items-center gap-4">
                <div>
                     <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-5 h-5 text-blue-500" />
                        {isEditingTitle ? (
                            <input
                                type="text"
                                value={editedTitle}
                                onChange={(e) => setEditedTitle(e.target.value)}
                                onBlur={() => {
                                    if (editedTitle.trim() && editedTitle !== title && onTitleChange) {
                                        onTitleChange(editedTitle.trim())
                                    }
                                    setIsEditingTitle(false)
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        if (editedTitle.trim() && editedTitle !== title && onTitleChange) {
                                            onTitleChange(editedTitle.trim())
                                        }
                                        setIsEditingTitle(false)
                                    } else if (e.key === 'Escape') {
                                        setEditedTitle(title)
                                        setIsEditingTitle(false)
                                    }
                                }}
                                className="font-bold text-lg bg-transparent border-b-2 border-blue-500 outline-none px-1 min-w-[100px]"
                                autoFocus
                            />
                        ) : (
                            <h3 
                                className="font-bold text-lg cursor-pointer hover:text-blue-600 transition-colors"
                                onDoubleClick={() => {
                                    setEditedTitle(title)
                                    setIsEditingTitle(true)
                                }}
                                title="Double-click to rename"
                            >
                                {title}
                            </h3>
                        )}
                        {activeTab === 'note' && hasDraft && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1 border border-amber-200">
                                <AlertTriangle className="w-3 h-3" />
                                Draft
                            </span>
                        )}
                        {activeTab === 'quiz' && quizContent !== originalQuizContent && (
                             <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium flex items-center gap-1 border border-purple-200">
                                Unsaved Quiz
                            </span>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                {/* Fullscreen Toggle */}
                <Button
                     size="sm"
                     variant="ghost"
                     onClick={() => setIsExpanded(!isExpanded)}
                     className="text-slate-500 mr-2"
                     title={isExpanded ? "Exit Full Screen" : "Fill Screen"}
                >
                    {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>

                {activeTab === 'note' ? (
                    <>
                        {/* Discard - Reverts to published content */}
                        <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={handleDiscardDraft}
                            disabled={isStructureDraft || loading || (!hasDraft && editor?.getHTML() === initialContent)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Discard all changes and revert to published version"
                        >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Discard
                        </Button>
                        
                        {/* Update Draft - Saves to cache table */}
                        <Button 
                            size="sm" 
                            onClick={() => handleSaveDraft(false)} 
                            disabled={!editor || saveLoading || isStructureDraft}
                            variant="secondary"
                            className="bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-200"
                            title="Save changes as draft (not visible to users)"
                        >
                            {saveLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            Update Draft
                        </Button>
                        
                        {/* Publish - Only enabled when there's a saved draft different from published */}
                        <Button 
                            size="sm" 
                            onClick={handlePublish} 
                            disabled={publishLoading || isStructureDraft || !hasDraft || (initialContent === publishedContent)}
                            className={!hasDraft || (initialContent === publishedContent) 
                                ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
                                : "bg-green-600 hover:bg-green-700 text-white"}
                            title={!hasDraft 
                                ? "Save to draft first before publishing" 
                                : (initialContent === publishedContent) 
                                    ? "Draft is same as published content" 
                                    : "Publish content (visible to users)"}
                        >
                            {publishLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                            Publish
                        </Button>
                    </>
                ) : (
                    // Quiz Actions
                    <Button
                        size="sm"
                        onClick={handleSaveQuiz}
                        disabled={saveQuizLoading || quizContent === originalQuizContent}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                        {saveQuizLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                         Save Quiz
                    </Button>
                )}
            </div>
        </div>

        {/* Tabs & Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 border-b bg-slate-50/50">
                <TabsList className="bg-transparent p-0 h-10 w-full justify-start space-x-2">
                    <TabsTrigger 
                        value="note"
                        className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-none rounded-none px-4 h-10 border-b-2 border-transparent transition-all"
                    >
                        <StickyNote className="w-4 h-4 mr-2" />
                        Note Content
                    </TabsTrigger>
                    <TabsTrigger 
                        value="quiz" 
                        className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-purple-500 data-[state=active]:shadow-none rounded-none px-4 h-10 border-b-2 border-transparent transition-all"
                    >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Quiz
                    </TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="note" className="flex-1 overflow-hidden flex flex-col relative m-0 p-0">
                 {/* Editor Area */}
                <div className="flex-1 overflow-hidden flex flex-col relative bg-slate-50/30">
                    {loading && (
                        <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    )}
                    
                    {/* Fixed Toolbar */}
                    {editor && (
                        <div 
                            className={cn(
                                "flex items-center gap-1 p-2 border-b border-gray-100 bg-white shadow-sm z-10 flex-wrap sticky top-0",
                                isExpanded ? "justify-center" : ""
                            )}
                        >
                            {/* Toolbar Inner Container */}
                             <div className="flex items-center gap-1 flex-wrap"> 
                                {/* Text Styling */}
                                <div className="flex items-center border-r border-gray-200 pr-2 mr-2 gap-1">
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => editor.chain().focus().toggleBold().run()}
                                        className={cn("h-8 w-8 p-0", editor.isActive('bold') && "bg-slate-100 text-blue-600")}
                                        title="Bold"
                                    >
                                        <Bold className="w-4 h-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => editor.chain().focus().toggleItalic().run()}
                                        className={cn("h-8 w-8 p-0", editor.isActive('italic') && "bg-slate-100 text-blue-600")}
                                        title="Italic"
                                    >
                                        <Italic className="w-4 h-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                                        className={cn("h-8 w-8 p-0", editor.isActive('underline') && "bg-slate-100 text-blue-600")}
                                        title="Underline"
                                    >
                                        <UnderlineIcon className="w-4 h-4" />
                                    </Button>
                                    {/* List Buttons */}
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                                        className={cn("h-8 w-8 p-0", editor.isActive('bulletList') && "bg-slate-100 text-blue-600")}
                                        title="Bullet List"
                                    >
                                        <List className="w-4 h-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                                        className={cn("h-8 w-8 p-0", editor.isActive('orderedList') && "bg-slate-100 text-blue-600")}
                                        title="Ordered List"
                                    >
                                        <ListOrdered className="w-4 h-4" />
                                    </Button>
                                </div>

                                {/* Font Size */}
                                <div className="flex items-center border-r border-gray-200 pr-2 mr-2 gap-1">
                                    <Select 
                                        value={editor.getAttributes('textStyle')?.fontSize || '16px'}
                                        onValueChange={(value) => editor.chain().focus().setFontSize(value).run()}
                                    >
                                        <SelectTrigger className="h-8 w-[100px] text-xs">
                                            <SelectValue placeholder="Size" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="12px">Small (12)</SelectItem>
                                            <SelectItem value="14px">Normal (14)</SelectItem>
                                            <SelectItem value="16px">Default (16)</SelectItem>
                                            <SelectItem value="18px">Medium (18)</SelectItem>
                                            <SelectItem value="20px">Large (20)</SelectItem>
                                            <SelectItem value="24px">Extra Large (24)</SelectItem>
                                            <SelectItem value="30px">Heading (30)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => editor.chain().focus().unsetFontSize().run()}
                                        className="h-8 w-8 p-0 text-muted-foreground"
                                        title="Reset Size"
                                    >
                                        <X className="w-3 h-3" />
                                    </Button>
                                </div>

                                {/* Highlighting */}
                                <div className="flex items-center border-r border-gray-200 pr-2 mr-2 gap-1">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className={cn("h-8 w-8 p-0 gap-1", editor.isActive('highlight') && "bg-yellow-100 text-yellow-700")}
                                                title="Highlight"
                                            >
                                                <Highlighter className="w-4 h-4" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-2">
                                            <div className="flex gap-2">
                                                {['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca'].map((color) => (
                                                    <button
                                                        key={color}
                                                        onClick={() => editor.chain().focus().toggleHighlight({ color }).run()}
                                                        className="w-6 h-6 rounded-full border border-slate-200"
                                                        style={{ backgroundColor: color }}
                                                        title="Highlight Color"
                                                    />
                                                ))}
                                                <button
                                                    onClick={() => editor.chain().focus().unsetHighlight().run()}
                                                    className="w-6 h-6 rounded-full border border-slate-200 flex items-center justify-center bg-white text-slate-400"
                                                    title="Remove Highlight"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                {/* Insert Elements */}
                                <div className="flex items-center gap-1">
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => editor.chain().focus().setHorizontalRule().run()}
                                        className="h-8 w-8 p-0"
                                        title="Insert Horizontal Line (---)"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                        </div>
                    )}

                    {/* Editor Content Scroll Area */}
                    <div className={cn(
                            "flex-1 overflow-y-auto p-6 pb-20 relative flex flex-col items-center",
                            isExpanded ? "bg-slate-100" : "bg-slate-50/30"
                        )}>
                            {editor && (
                            <BubbleMenu editor={editor}>
                                {/* Bold/Italic/Underline */}
                                <div className="flex items-center gap-1 p-1 bg-white rounded-full shadow-lg border border-slate-200 animate-in zoom-in-95 duration-200 mr-2">
                                    <button 
                                        onClick={() => editor.chain().focus().toggleBold().run()}
                                        className={cn(
                                            "p-1.5 rounded-full hover:bg-slate-100 text-slate-600 transition-colors",
                                            editor.isActive('bold') && "bg-slate-100 text-blue-600 font-bold"
                                        )}
                                        title="Bold"
                                    >
                                        <Bold className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => editor.chain().focus().toggleItalic().run()}
                                        className={cn(
                                            "p-1.5 rounded-full hover:bg-slate-100 text-slate-600 transition-colors",
                                            editor.isActive('italic') && "bg-slate-100 text-blue-600 italic"
                                        )}
                                        title="Italic"
                                    >
                                        <Italic className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                                        className={cn(
                                            "p-1.5 rounded-full hover:bg-slate-100 text-slate-600 transition-colors",
                                            editor.isActive('underline') && "bg-slate-100 text-blue-600 underline"
                                        )}
                                        title="Underline"
                                    >
                                        <UnderlineIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                  <div className="flex items-center gap-1 p-1 bg-white rounded-full shadow-lg border border-slate-200 animate-in zoom-in-95 duration-200">
                                     {/* Quick Highlight in Bubble */}
                                    <button
                                        onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}
                                        className={cn(
                                            "p-1.5 rounded-full hover:bg-slate-100 text-slate-600",
                                            editor.isActive('highlight', { color: '#fef08a' }) && "bg-yellow-100 text-yellow-700"
                                        )}
                                        title="Yellow Highlight"
                                    >
                                        <Highlighter className="w-4 h-4" />
                                    </button>
                                    {/* ... rest of bubble menu ... */}
                                     <div className="w-px h-4 bg-slate-200 mx-1" />

                                    <button 
                                        onClick={() => toggleNote('red')}
                                        className={cn(
                                            "w-6 h-6 rounded-full hover:scale-110 transition-transform flex items-center justify-center", 
                                            "bg-red-100 border-2 border-red-500",
                                            editor.isActive('noteBox', { color: 'red' }) && "ring-2 ring-offset-1 ring-slate-400"
                                        )}
                                        title="Red Note Box"
                                    />
                                    <button 
                                        onClick={() => toggleNote('green')}
                                        className={cn(
                                            "w-6 h-6 rounded-full hover:scale-110 transition-transform flex items-center justify-center", 
                                            "bg-green-100 border-2 border-green-500",
                                            editor.isActive('noteBox', { color: 'green' }) && "ring-2 ring-offset-1 ring-slate-400"
                                        )}
                                        title="Green Note Box"
                                    />
                                    <button 
                                        onClick={() => toggleNote('blue')}
                                        className={cn(
                                            "w-6 h-6 rounded-full hover:scale-110 transition-transform flex items-center justify-center", 
                                            "bg-blue-100 border-2 border-blue-500",
                                            editor.isActive('noteBox', { color: 'blue' }) && "ring-2 ring-offset-1 ring-slate-400"
                                        )}
                                        title="Blue Note Box"
                                    />
                                    <button 
                                        onClick={() => toggleNote('amber')}
                                        className={cn(
                                            "w-6 h-6 rounded-full hover:scale-110 transition-transform flex items-center justify-center", 
                                            "bg-amber-100 border-2 border-amber-500",
                                            editor.isActive('noteBox', { color: 'amber' }) && "ring-2 ring-offset-1 ring-slate-400"
                                        )}
                                        title="Amber Note Box"
                                    />
                                    
                                    <div className="w-px h-4 bg-slate-200 mx-1" />
                                    
                                    <button
                                        onClick={() => (editor.commands as any).unsetNoteBox()}
                                        className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-colors"
                                        title="Clear Note Box"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </BubbleMenu>
                        )}
                        
                        <div 
                            className={cn(
                                "bg-white shadow-sm rounded-lg border border-slate-100 transition-all duration-300 h-fit shrink-0",
                                isExpanded ? "w-[850px] min-h-[900px] my-8 shadow-xl" : "w-full min-h-[600px]"
                            )}
                        >
                                <EditorContent editor={editor} />
                        </div>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="quiz" className="flex-1 overflow-hidden m-0 p-0 flex relative" id="quiz-split-container">
                {/* Quiz Editor (Left) */}
                <div 
                    className="border-r bg-slate-50 flex flex-col shrink-0" 
                    style={{ width: `${quizSplit}%` }}
                >
                    <div className="px-4 py-3 border-b bg-white text-xs font-medium text-slate-500 uppercase tracking-widest flex justify-between">
                        <span>Quiz Editor</span>
                        <span className="text-slate-300">Plain Text</span>
                    </div>
                    <textarea 
                        className="flex-1 w-full p-6 bg-slate-50 font-mono text-sm resize-none focus:outline-none focus:bg-white transition-colors"
                        value={quizContent}
                        onChange={(e) => setQuizContent(e.target.value)}
                        placeholder={`Title_display: My Quiz\nPassage: ...\n\nQ1. ...`}
                        spellCheck={false}
                    />
                </div>
                
                {/* Drag Handle */}
                <div 
                    className="w-1.5 h-full bg-slate-100 hover:bg-blue-400 cursor-col-resize z-10 hover:w-2 transition-all flex items-center justify-center group absolute"
                    style={{ left: `calc(${quizSplit}% - 3px)` }}
                    onMouseDown={() => setIsDragging(true)}
                >
                    <div className="w-0.5 h-8 bg-slate-300 group-hover:bg-white rounded-full" />
                </div>
                
                {/* Quiz Preview (Right) */}
                <div className="flex flex-col bg-white flex-1 overflow-hidden">
                     <div className="px-4 py-3 border-b bg-white text-xs font-medium text-slate-500 uppercase tracking-widest">
                        Live Preview
                    </div>
                     <div className="flex-1 overflow-auto relative">
                        {quizContent ? (
                            <QuizPreview 
                                content={quizContent} 
                                onContentChange={(newContent) => {
                                    setQuizContent(newContent)
                                }}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
                                <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
                                <p>Start typing your quiz on the left to see the preview here.</p>
                            </div>
                        )}
                    </div>
                </div>
            </TabsContent>
        </Tabs>
    </div>
  )
}
