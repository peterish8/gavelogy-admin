'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDraftStore } from '@/lib/stores/draft-store'
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


interface EditorPanelProps {
  itemId: string | null
  itemType: 'file' | 'folder' | null
  courseId: string
  title: string
  onClose?: () => void
}

export function EditorPanel({ itemId, itemType, courseId, title, onClose }: EditorPanelProps) {
  const [loading, setLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveQuizLoading, setSaveQuizLoading] = useState(false)
  const [publishLoading, setPublishLoading] = useState(false)
  const [initialContent, setInitialContent] = useState('')
  const { changes } = useDraftStore()
  
  // Reactivity State (to force toolbar updates)
  const [, setTick] = useState(0)
  
  // UI State
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Active Tab
  const [activeTab, setActiveTab] = useState("note")

  // Draft System State
  const [hasDraft, setHasDraft] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)

  // Auto-save state
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)

  // Quiz State
  const [quizContent, setQuizContent] = useState('')
  const [originalQuizContent, setOriginalQuizContent] = useState('')

  // Check if this item is a new draft (unsaved in structure)
  const isStructureDraft = changes.some(c => c.entityId === itemId && c.action === 'create')

  // Initialize Tiptap Editor
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontSize,
      Highlight.configure({ multicolor: true }), 
      BubbleMenuExtension,
      NoteBox as any, 
    ],
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


  // Fetch content when itemId changes
  useEffect(() => {
    async function fetchContent() {
      if (!itemId || itemType !== 'file') return
      
      // If it's a structure draft, we don't fetch from DB
      if (isStructureDraft) {
        if (editor) editor.commands.setContent('')
        setInitialContent('')
        setHasDraft(false)
        setQuizContent('')
        setOriginalQuizContent('')
        return
      }

      console.log('EditorPanel: fetching content for', itemId)
      setLoading(true)
      setHasDraft(false)
      setDraftId(null)

      try {
        const supabase = createClient()
        
        // Optimize: Fetch Draft, Live Note, AND Quiz content in parallel
        console.log('EditorPanel: Fetching content in parallel for', itemId)
        
        const [draftResponse, liveResponse, quizResponse] = await Promise.all([
            // 1. Draft Content
            supabase
                .from('draft_content_cache')
                .select('*')
                .eq('original_content_id', itemId)
                .maybeSingle(),
            // 2. Live Note Content
            supabase
                .from('note_contents')
                .select('*')
                .eq('item_id', itemId)
                .maybeSingle(),
            // 3. Quiz Content
            supabase
                .from('quizzes')
                .select('*')
                .eq('item_id', itemId)
                .maybeSingle()
        ])
        
        // Ensure editor is still mounted/available before updating
        if (!editor) return

        // 1. Check Draft First (for Note)
        if (draftResponse.data) {
             console.log('EditorPanel: Using DRAFT content')
             setHasDraft(true)
             setDraftId(draftResponse.data.id)
             
             const draftContent = draftResponse.data.draft_data?.content_html || ''
             const htmlContent = customToHtml(draftContent)
             
             if (editor.getHTML() !== htmlContent) {
                 editor.commands.setContent(htmlContent)
             }
             setInitialContent(htmlContent)
        } 
        // 2. Fallback to Live Content (for Note)
        else if (liveResponse.data) {
            console.log('EditorPanel: Using LIVE content')
            const data = liveResponse.data
            const rawContent = data.content_html || data.html || data.content || ''
            const htmlContent = customToHtml(rawContent)
            
            if (editor.getHTML() !== htmlContent) {
                editor.commands.setContent(htmlContent)
            }
            setInitialContent(htmlContent)
        } else {
            console.log('EditorPanel: No content found (New Note)')
            editor.commands.setContent('')
            setInitialContent('')
        }

        // 3. Set Quiz Content (Live only for now, no draft system for quizzes yet)
        if (quizResponse.data) {
            console.log('EditorPanel: Found Quiz Content')
            setQuizContent(quizResponse.data.content || '')
            setOriginalQuizContent(quizResponse.data.content || '')
        } else {
             setQuizContent('')
             setOriginalQuizContent('')
        }

      } catch (e) {
        console.error('Error loading content', e)
        if (editor) editor.commands.setContent('')
      } finally {
        setLoading(false)
      }
    }

    fetchContent()
  }, [itemId, itemType, isStructureDraft, editor])

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
        
        // Upsert to draft_content_cache
        const { error } = await supabase
            .from('draft_content_cache')
            .upsert({ 
                original_content_id: itemId,
                draft_data: { content_html: customSyntax },
                updated_at: new Date().toISOString()
            }, { onConflict: 'original_content_id' })

        if (error) throw error
        
        setHasDraft(true)
        setLastSaved(new Date())
        setInitialContent(currentHtml)
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

  // Save Quiz Logic (Direct Save, no draft yet)
  const handleSaveQuiz = async () => {
    if (!itemId) return
    setSaveQuizLoading(true)

    try {
        const supabase = createClient()
        
        const { error } = await supabase
            .from('quizzes')
            .upsert({ 
                item_id: itemId,
                content: quizContent,
                updated_at: new Date().toISOString()
            }, { onConflict: 'item_id' })

        if (error) throw error
        
        setOriginalQuizContent(quizContent)
        toast.success("Quiz saved successfully")
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
        toast.success("Content published successfully")
    } catch (e) {
        console.error('Error publishing content', e)
        toast.error('Failed to publish content')
    } finally {
        setPublishLoading(false)
    }
  }

  // Discard Draft
  const handleDiscardDraft = async () => {
      if (!confirm('Are you sure you want to discard your draft changes? This cannot be undone.')) return
      
      setLoading(true)
      try {
          const supabase = createClient()
          await supabase.from('draft_content_cache').delete().eq('original_content_id', itemId)
          
          setHasDraft(false)
          setDraftId(null)
          
           const { data } = await supabase
                .from('note_contents')
                .select('*')
                .eq('item_id', itemId)
                .limit(1)
            
            const rawContent = data?.[0]?.content_html || ''
            const htmlContent = customToHtml(rawContent)
            editor?.commands.setContent(htmlContent)
            setInitialContent(htmlContent)
            toast.success("Draft discarded")
            
      } catch (e) {
          console.error('Error discarding draft', e)
          toast.error("Failed to discard draft")
      } finally {
          setLoading(false)
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
                        <h3 className="font-bold text-lg">{title}</h3>
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
                        {!isStructureDraft && hasDraft && (
                            <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={handleDiscardDraft}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                title="Discard Draft Changes"
                            >
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Discard
                            </Button>
                        )}
                        
                        <Button 
                            size="sm" 
                            onClick={() => handleSaveDraft(false)} 
                            disabled={!editor || saveLoading}
                            variant={hasDraft ? "secondary" : "default"}
                            className={!isStructureDraft && hasDraft ? "bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-200" : ""}
                            title="Save Note Draft"
                        >
                            {saveLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            {hasDraft ? "Update Draft" : "Save Draft"}
                        </Button>
                        
                        {!isStructureDraft && hasDraft && (
                            <Button 
                                size="sm" 
                                onClick={handlePublish} 
                                disabled={publishLoading}
                                className="bg-green-600 hover:bg-green-700 text-white"
                                title="Publish Note"
                            >
                                {publishLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                                Publish
                            </Button>
                        )}
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
                                "bg-white shadow-sm rounded-lg border border-slate-100 transition-all duration-300 h-fit flex-shrink-0",
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
