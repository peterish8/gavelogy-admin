'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useConvex, useMutation } from 'convex/react'
import { api } from '@convex/_generated/api'
import { useDraftStore } from '@/lib/stores/draft-store'
import { useLocalContentCache } from '@/lib/stores/local-content-cache'
import { cn } from '@/lib/utils'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus' 
import { DOMParser as ProseMirrorDOMParser } from 'prosemirror-model'
import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import BubbleMenuExtension from '@tiptap/extension-bubble-menu'
import { Node, Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import TextAlign from '@tiptap/extension-text-align'
import { htmlToCustom, customToHtml, fixAiMistakes } from '@/lib/content-converter'
import { fetchLinksForItem, insertLink, deleteLink } from '@/actions/judgment/links'
import type { NotePdfLink } from '@/actions/judgment/links'
import { saveNoteContent, saveFlashcardsJson } from '@/actions/judgment/note-content'
import { JudgmentPdfPanel } from './judgment-pdf-panel'
import { 
    findTextInPageData 
} from '@/lib/pdf-search'
import { 
    encodeLinkMeta, 
    parseLinkMeta
} from '@/lib/pdf-utils'
import type { ConnectionViz } from './judgment-pdf-panel'
import { LineHeight } from '@/lib/line-height-extension'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import {
    Bold, Italic, Underline as UnderlineIcon,
    List, ListOrdered, Save, X, RotateCcw, CheckCircle, AlertTriangle,
    Maximize2, Minimize2, ChevronRight, StickyNote, FileText,
    Highlighter, Braces,
    GripVertical, ChevronLeft, Loader2, MessageSquare, Minus, Link2, Unlink2, Wand2,
    Table as TableIcon, Check, CreditCard, Edit2,
    AlignLeft, AlignCenter, AlignRight,
    Download, ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { QuizPreview } from './quiz-preview'
import { FullscreenQuizView } from './fullscreen-quiz-view'
import { parseQuizText, serializeQuiz } from '@/lib/quiz-parser'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { NotesReaderBar, type NotesReaderBarRef } from './notes-reader-bar'
import type { TTSSnapshot, TTSToken } from '@/lib/tts-processor'
import { buildTTSSnapshotFromDoc } from '@/lib/tts-processor'
import { getActiveSource, stopTTS } from '@/lib/tts-manager'

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

// Font Size + Font Family type declarations
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
    fontFamily: {
      setFontFamily: (fontFamily: string) => ReturnType
      unsetFontFamily: () => ReturnType
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

// Font Family Extension — applies font-family to selected text via textStyle
export const FontFamily = Extension.create({
  name: 'fontFamily',
  addOptions() {
    return { types: ['textStyle'] }
  },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontFamily: {
          default: null,
          parseHTML: element => (element as HTMLElement).style.fontFamily?.replace(/['"]+/g, '') || null,
          renderHTML: attributes => {
            if (!attributes.fontFamily) return {}
            return { style: `font-family: ${attributes.fontFamily}` }
          },
        },
      },
    }]
  },
  addCommands() {
    return {
      setFontFamily: (fontFamily: string) => ({ chain }) =>
        chain().setMark('textStyle', { fontFamily }).run(),
      unsetFontFamily: () => ({ chain }) =>
        chain().setMark('textStyle', { fontFamily: null }).run(),
    }
  },
})

// Available font options for the toolbar picker
export const FONT_OPTIONS = [
  { label: 'Default',          value: '',                                           sample: 'Aa' },
  { label: 'Playfair Display', value: 'var(--font-playfair), serif',                sample: 'Aa' },
  { label: 'Lora',             value: 'var(--font-lora), Georgia, serif',           sample: 'Aa' },
  { label: 'IBM Plex Mono',    value: 'var(--font-ibm-mono), monospace',            sample: 'Aa' },
  { label: 'Inter',            value: 'var(--font-inter), sans-serif',              sample: 'Aa' },
] as const

// LinkedText mark — renders amber span for note↔PDF connections
const LinkedText = Mark.create({
  name: 'linkedText',
  addAttributes() {
    return {
      linkId: {
        default: null,
        parseHTML: el => (el as HTMLElement).getAttribute('data-link-id'),
        renderHTML: attrs => attrs.linkId ? { 'data-link-id': attrs.linkId } : {},
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-link-id]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      class: 'linked-text',
      style: 'color:#c9922a;border-bottom:2px dashed #c9922a;cursor:pointer;padding-bottom:1px;display:inline',
    }), 0]
  },
})

// TTSHighlight extension — highlights the current word being spoken
const TTSHighlight = Extension.create({
  name: 'ttsHighlight',
  addStorage() {
    return {
      range: null as { start: number, end: number } | null,
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('ttsHighlight'),
        props: {
          decorations: (state) => {
            const range = this.storage.range
            if (!range || range.start >= range.end) return DecorationSet.empty
            
            const start = Math.max(0, Math.min(range.start, state.doc.content.size))
            const end = Math.max(0, Math.min(range.end, state.doc.content.size))
            
            if (start >= end) return DecorationSet.empty

            return DecorationSet.create(state.doc, [
              Decoration.inline(start, end, {
                class: 'tts-highlight-word',
                style: 'background-color: rgba(250, 204, 21, 0.4); border-bottom: 2px solid #eab308; border-radius: 2px; transition: all 0.1s ease-in-out;',
              }),
            ])
          },
        },
      }),
    ]
  },
})


// Define extensions outside component to prevent re-creation on render (fixes duplicate extension warnings)
const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    underline: false,
  }),
  Underline,
  TextStyle,
  FontSize,
  FontFamily,
  LineHeight,
  Highlight.configure({ multicolor: true }),
  BubbleMenuExtension,
  NoteBox as any,
  LinkedText,
  TTSHighlight,
  TextAlign.configure({
    types: ['heading', 'paragraph'],
  }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
]

interface EditorPanelProps {
  itemId: string | null
  itemType: 'file' | 'folder' | null
  courseId: string
  title: string
  onClose?: () => void
  onTitleChange?: (newTitle: string) => void
  mode?: 'all' | 'notes-only' | 'quiz-only'
  // Controlled Expansion State (Optional)
  isExpandedControlled?: boolean
  onExpandChange?: (expanded: boolean) => void
}

export function EditorPanel({ itemId, itemType, title, onClose, onTitleChange, mode = 'all', isExpandedControlled, onExpandChange }: EditorPanelProps) {
  const [loading, setLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveQuizLoading, setSaveQuizLoading] = useState(false)
  const [publishLoading, setPublishLoading] = useState(false)
  const [initialContent, setInitialContent] = useState('')
  // Decoupled fetch state to handle editor race conditions
  const [fetchedData, setFetchedData] = useState<any>(null)
  
  // ── Judgment PDF Lock State ──
  const [hasPdfAttached, setHasPdfAttached] = useState(false)

  // ── Mobile Bottom Sheet State ──
  const [mobileTagTab, setMobileTagTab] = useState<'notes' | 'pdf'>('notes')
  const [mobileSheetLink, setMobileSheetLink] = useState<NotePdfLink | null>(null)
  const [mobileSheetText, setMobileSheetText] = useState<string>('')
  const [mobileSheetLoading, setMobileSheetLoading] = useState(false)
  const [ttsSnapshot, setTtsSnapshot] = useState<TTSSnapshot | null>(null)
  const cachedPdfDoc = useRef<any>(null)
  const ttsReaderRef = useRef<NotesReaderBarRef | null>(null)
  const shouldAutoScrollTtsRef = useRef(false)

  const { changes } = useDraftStore()
  const convex = useConvex()
  const saveDraftMutation = useMutation(api.adminMutations.saveDraft as any)
  const saveQuizMutation = useMutation(api.adminMutations.saveQuiz as any)
  const publishMutation = useMutation(api.adminMutations.publishNoteContent as any)
  const discardDraftMutation = useMutation(api.adminMutations.discardDraft as any)
  const saveScriptMutation = useMutation((api as any).content.updateNoteScript)

  // Active highlight color for "paint bucket" mode — shows tick on selection
  const [selectedHighlightColor, setSelectedHighlightColor] = useState<string | null>(null)

  // Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [isAiFormatOpen, setIsAiFormatOpen] = useState(false)
  const [aiInstructions, setAiInstructions] = useState('')
  const [aiFormatting, setAiFormatting] = useState(false)
  const [aiQuizzing, setAiQuizzing] = useState(false)

  const handleAiFormat = async (instructions: string) => {
    if (!editor) return
    const rawText = editor.getText()
    if (!rawText.trim()) { toast.error('Nothing to format — write some notes first'); return }
    setAiFormatting(true)
    setIsAiFormatOpen(false)
    const toastId = toast.loading('✨ AI is formatting your notes…')
    try {
      const res = await fetch('/api/ai-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText, instructions }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'AI failed')
      const html = customToHtml(data.formatted)
      editor.commands.setContent(html)
      toast.success(`✨ Notes beautifully formatted!${data.provider ? ` (via ${data.provider})` : ''}`, { id: toastId })
    } catch (e: any) {
      toast.error(e.message || 'AI formatting failed', { id: toastId })
    } finally {
      setAiFormatting(false)
    }
  }

  const handleAiQuiz = async () => {
    if (!editor) return
    const notesText = editor.getText()
    if (!notesText.trim()) { toast.error('Nothing to quiz — write or generate notes first'); return }
    setAiQuizzing(true)
    const toastId = toast.loading('🧠 AI is generating quiz from your notes…')
    try {
      const res = await fetch('/api/ai-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notesText }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'AI failed')
      setQuizContent(data.quiz)
      setActiveTab('quiz')
      toast.success(`🧠 10 questions ready in Quiz tab!${data.provider ? ` (via ${data.provider})` : ''}`, { id: toastId })
    } catch (e: any) {
      toast.error(e.message || 'AI quiz generation failed', { id: toastId })
    } finally {
      setAiQuizzing(false)
    }
  }

  const handleAiFlashcards = async (notesTextOverride?: string) => {
    if (!editor && !notesTextOverride) return
    const notesText = notesTextOverride ?? editor!.getText()
    if (!notesText.trim()) return
    setAiFlashcarding(true)
    const toastId = toast.loading('🃏 Generating flashcards…')
    try {
      const res = await fetch('/api/ai-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notesText }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'AI failed')
      setFlashcards(data.flashcards || [])
      setFlashcardIdx(0)
      setFlashcardFlipped(false)
      toast.success(`🃏 ${data.flashcards?.length ?? 0} flashcards ready!`, { id: toastId })
    } catch (e: any) {
      toast.error(e.message || 'Flashcard generation failed', { id: toastId })
    } finally {
      setAiFlashcarding(false)
    }
  }

  /**
   * MAGIC PASTE: Processes AI output that includes ---CONNECTIONS_JSON---
   * This automatically finds coordinates in the PDF and creates interactive links.
   */
  const handleMagicPaste = async (text: string) => {
    if (!editor || !itemId) return
    const [formattedPart, jsonPart] = text.split('---CONNECTIONS_JSON---')
    if (!jsonPart) return

    const toastId = toast.loading('🔗 Connecting AI notes to PDF…')
    try {
        // 1. Parse JSON
        let connections: any[] = []
        try {
            connections = JSON.parse(jsonPart.trim())
        } catch {
            throw new Error('Malformed connections JSON at bottom of text')
        }

        if (!Array.isArray(connections) || connections.length === 0) {
            // No connections? Just paste formatted text
            const html = customToHtml(formattedPart.trim())
            editor.commands.setContent(html)
            toast.success('AI Content Processed!', { id: toastId })
            return
        }

        // 2. Load PDF and build index
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        
        let doc = cachedPdfDoc.current
        if (!doc) {
            const proxyUrl = `/api/judgment/pdf-proxy?itemId=${itemId}`
            doc = await pdfjsLib.getDocument(proxyUrl).promise
            cachedPdfDoc.current = doc
        }

        const pageData: { pageNum: number; items: any[] }[] = []
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i)
            const content = await page.getTextContent()
            pageData.push({ pageNum: i, items: content.items })
        }

        // 3. Delete old links (clean slate for new AI note)
        const oldLinks = await fetchLinksForItem(itemId)
        for (const old of oldLinks) {
            try { await deleteLink(old.id) } catch {}
        }

        // 4. Process each connection
        let taggedFormatted = formattedPart.trim()
        const createdLinks: NotePdfLink[] = []

        for (const conn of connections) {
            const searchText = conn.pdfSearchText || conn.searchText || ''
            const endText = conn.pdfSearchTextEnd || undefined
            const pos = findTextInPageData(pageData, searchText, conn.pdfPage, endText)
            
            if (pos) {
                const label = encodeLinkMeta(conn.label || '', conn.color || '#c9922a')
                const newLink = await insertLink({
                    item_id: itemId,
                    link_id: conn.linkId,
                    pdf_page: pos.page,
                    x: pos.x,
                    y: pos.y,
                    width: pos.width,
                    height: pos.height,
                    label,
                })
                createdLinks.push(newLink)

                // Inject [link:X] tag into the note text
                const anchor = conn.noteAnchor || conn.noteText || ''
                if (anchor && !taggedFormatted.includes(`[link:${conn.linkId}]`)) {
                    const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    // Try to wrap inside a heading tag — allow emoji/chars before the anchor text
                    const headingRe = new RegExp(`(\\[h[123]\\][^\\[]*?)(${escaped})(\\[/h[123]\\])`, 'i')
                    if (headingRe.test(taggedFormatted)) {
                        taggedFormatted = taggedFormatted.replace(headingRe, `$1[link:${conn.linkId}]$2[/link]$3`)
                    } else {
                        // Fall back: wrap first occurrence
                        taggedFormatted = taggedFormatted.replace(new RegExp(escaped, 'i'), `[link:${conn.linkId}]${anchor}[/link]`)
                    }
                }
            }
        }

        // 5. Apply to editor
        const html = customToHtml(taggedFormatted)
        editor.commands.setContent(html)
        
        // 6. Refresh UI
        setJLinks(createdLinks)
        setJLinksLoaded(true)
        
        toast.success(`✨ Success! ${createdLinks.length} interactive connections created.`, { id: toastId })
    } catch (e: any) {
        toast.error(e.message || 'Magic Paste failed', { id: toastId })
        // Fallback: just paste the formatted part
        const html = customToHtml(formattedPart.trim())
        editor.commands.setContent(html)
    }
  }

  const handleImportContent = () => {
      if (!importText || !editor) return
      
      try {
          // Convert raw bracket syntax to HTML
          const html = customToHtml(importText)
          
           editor.commands.setContent(html)
           
          setImportText('')
          setIsImportOpen(false)
          toast.success("Content imported successfully")
      } catch (e) {
          console.error(e)
          toast.error("Failed to parse content")
      }
  }
  
  // Local content cache for persisting unsaved changes
  const localCache = useLocalContentCache()
  const prevItemIdRef = useRef<string | null>(null)
  const currentLoadedItemId = useRef<string | null>(null) // Tracks which item is ACTUALLY in the editor
  
  // UI State
  const [internalIsExpanded, setInternalIsExpanded] = useState(false)
  const isExpanded = isExpandedControlled ?? internalIsExpanded

  const handleToggleExpand = () => {
    const newState = !isExpanded
    if (onExpandChange) {
      onExpandChange(newState)
    } else {
      setInternalIsExpanded(newState)
    }
  }
  
  // Active Tab - set default based on mode
    const [activeTab, setActiveTab] = useState(mode === 'quiz-only' ? 'quiz' : 'note')

    // -------------------------------------------------------------------------
    // REUSABLE EDITOR TOOLBAR
    // -------------------------------------------------------------------------
    // Apply line height to paragraphs/headings within the current selection only
    const setAllLineHeights = (value: string | null) => {
      if (!editor) return;
      editor.chain().focus().command(({ tr, state }) => {
        const { from, to } = state.selection
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === 'paragraph' || node.type.name === 'heading') {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight: value })
          }
        })
        return true
      }).run()
    }

    const renderEditorToolbar = () => {
        if (!editor) return null;
        return (
            <div className="flex items-center gap-1 p-1 bg-card rounded-lg shadow-sm border border-border overflow-x-auto whitespace-nowrap [&>div]:shrink-0 [&>button]:shrink-0 notes-editor-scroll">
                {/* Text Styling Group */}
                <div className="flex items-center gap-0.5 border-r border-border pr-1 mr-1">
                    <button 
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-muted/80 text-muted-foreground transition-colors",
                            editor.isActive('bold') && "bg-muted/80 text-blue-600 font-bold"
                        )}
                        title="Bold"
                    >
                        <Bold className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-muted/80 text-muted-foreground transition-colors",
                            editor.isActive('italic') && "bg-muted/80 text-blue-600 italic"
                        )}
                        title="Italic"
                    >
                        <Italic className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-muted/80 text-muted-foreground transition-colors",
                            editor.isActive('underline') && "bg-muted/80 text-blue-600 underline"
                        )}
                        title="Underline"
                    >
                        <UnderlineIcon className="w-4 h-4" />
                    </button>
                </div>

                {/* Lists & Code */}
                <div className="flex items-center gap-0.5 border-r border-border pr-1 mr-1">
                    <button 
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-muted/80 text-muted-foreground transition-colors",
                            editor.isActive('bulletList') && "bg-muted/80 text-blue-600"
                        )}
                        title="Bullet List"
                    >
                        <List className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => editor.chain().focus().toggleCode().run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-muted/80 text-muted-foreground transition-colors",
                            editor.isActive('code') && "bg-muted/80 text-blue-600"
                        )}
                        title="Inline Code"
                    >
                        <Braces className="w-4 h-4" />
                    </button>
                </div>

                {/* Text Alignment */}
                <div className="flex items-center gap-0.5 border-r border-border pr-1 mr-1">
                    <button 
                        onClick={() => editor.chain().focus().setTextAlign('left').run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-muted/80 text-muted-foreground transition-colors",
                            editor.isActive({ textAlign: 'left' }) && "bg-muted/80 text-blue-600"
                        )}
                        title="Align Left"
                    >
                        <AlignLeft className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => editor.chain().focus().setTextAlign('center').run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-muted/80 text-muted-foreground transition-colors",
                            editor.isActive({ textAlign: 'center' }) && "bg-muted/80 text-blue-600"
                        )}
                        title="Align Center"
                    >
                        <AlignCenter className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => editor.chain().focus().setTextAlign('right').run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-muted/80 text-muted-foreground transition-colors",
                            editor.isActive({ textAlign: 'right' }) && "bg-muted/80 text-blue-600"
                        )}
                        title="Align Right"
                    >
                        <AlignRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Font Size Selector */}
                <div className="flex items-center border-r border-border pr-1 mr-1">
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                className="flex items-center gap-1 h-7 px-2 text-xs font-medium rounded hover:bg-muted/80 text-muted-foreground transition-colors"
                                title="Font Size"
                            >
                                {(() => {
                                    const size = editor.getAttributes('textStyle')?.fontSize
                                    if (size === '12px') return 'Small'
                                    if (size === '14px') return 'Normal'
                                    if (size === '18px') return 'Medium'
                                    if (size === '20px') return 'Large'
                                    if (size === '24px') return 'Ex-Lg'
                                    if (size === '30px') return 'H1'
                                    return 'Default'
                                })()}
                                <ChevronRight className="w-3 h-3 text-muted-foreground/70" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-36 p-1.5" side="bottom" align="start">
                            <div className="flex flex-col gap-0.5">
                                {[
                                    { size: '12px', label: 'Small (12)' },
                                    { size: '14px', label: 'Normal (14)' },
                                    { size: '16px', label: 'Default (16)' },
                                    { size: '18px', label: 'Medium (18)' },
                                    { size: '20px', label: 'Large (20)' },
                                    { size: '24px', label: 'XL (24)' },
                                    { size: '30px', label: 'H1 (30)' },
                                ].map((item) => {
                                    const currentSize = editor.getAttributes('textStyle')?.fontSize
                                    const isActive = currentSize === item.size || (!currentSize && item.size === '16px')
                                    return (
                                        <button
                                            key={item.size}
                                            onClick={() => {
                                                if (item.size === '16px') {
                                                    editor.chain().focus().unsetFontSize().run()
                                                } else {
                                                    editor.chain().focus().setFontSize(item.size).run()
                                                }
                                            }}
                                            className={cn(
                                                "flex items-center justify-between w-full px-2 py-1.5 text-xs font-medium rounded hover:bg-muted transition-colors text-left",
                                                isActive ? "bg-muted text-foreground" : "text-muted-foreground"
                                            )}
                                        >
                                            {item.label}
                                            {isActive && <Check className="w-3 h-3 ml-2 shrink-0 text-primary" />}
                                        </button>
                                    )
                                })}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Font Family Picker */}
                <div className="flex items-center border-r border-border pr-1 mr-1">
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                className="flex items-center gap-1 h-7 px-2 text-xs font-medium rounded hover:bg-muted/80 text-muted-foreground transition-colors min-w-[72px]"
                                title="Font family"
                            >
                                {(() => {
                                    const current = editor.getAttributes('textStyle')?.fontFamily || ''
                                    if (current.includes('playfair')) return <span style={{ fontFamily: 'var(--font-playfair), serif' }}>Playfair</span>
                                    if (current.includes('lora') || current.includes('Lora')) return <span style={{ fontFamily: 'var(--font-lora), serif' }}>Lora</span>
                                    if (current.includes('ibm') || current.includes('mono') || current.includes('IBM')) return <span style={{ fontFamily: 'var(--font-ibm-mono), monospace' }}>Mono</span>
                                    if (current.includes('inter') || current.includes('Inter')) return <span style={{ fontFamily: 'var(--font-inter), sans-serif' }}>Inter</span>
                                    return <span>Font</span>
                                })()}
                                <ChevronRight className="w-3 h-3 opacity-50 ml-auto" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-52 p-1.5" side="bottom" align="start">
                            <div className="flex flex-col gap-0.5">
                                {FONT_OPTIONS.map(({ label, value }) => {
                                    const current = editor.getAttributes('textStyle')?.fontFamily || ''
                                    const isActive = value ? current.includes(value.split(',')[0].replace('var(', '').replace('--font-', '').replace(')', '').trim()) : !current
                                    return (
                                        <button
                                            key={label}
                                            onClick={() => {
                                                if (!value) {
                                                    editor.chain().focus().unsetFontFamily().run()
                                                } else {
                                                    editor.chain().focus().setFontFamily(value).run()
                                                }
                                            }}
                                            className={cn(
                                                "flex items-center gap-3 w-full px-2 py-1.5 rounded text-left hover:bg-muted transition-colors",
                                                isActive && "bg-muted"
                                            )}
                                        >
                                            <span
                                                className="text-base font-semibold w-7 text-center shrink-0"
                                                style={{ fontFamily: value || 'var(--font-inter), sans-serif' }}
                                            >
                                                Ag
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-xs font-medium text-foreground truncate">{label}</p>
                                            </div>
                                            {isActive && <Check className="w-3 h-3 ml-auto shrink-0 text-primary" />}
                                        </button>
                                    )
                                })}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Line Height */}
                <div className="flex items-center border-r border-border pr-1 mr-1">
                    {[
                        { label: '1.2×', value: '1.2' },
                        { label: '1.4×', value: '1.4' },
                        { label: '1.6×', value: '1.6' },
                        { label: '1.8×', value: '1.8' },
                        { label: '2.0×', value: '2' },
                    ].map(({ label, value }) => (
                        <button
                            key={value}
                            onClick={() => setAllLineHeights(value)}
                            className={cn(
                                "h-7 px-1.5 text-xs font-medium rounded hover:bg-muted/80 transition-colors",
                                editor.getAttributes('paragraph')?.lineHeight === value
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground"
                            )}
                            title={`Line Height ${label}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Highlight & Note Boxes */}
                <div className="flex items-center gap-1.5">
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                className={cn(
                                    "p-1.5 rounded hover:bg-muted/80 flex items-center gap-1 transition-colors relative",
                                    selectedHighlightColor
                                        ? "text-foreground"
                                        : "text-muted-foreground"
                                )}
                                title={selectedHighlightColor ? "Highlight mode ON — select text to apply" : "Pick highlight color"}
                            >
                                <Highlighter
                                    className="w-4 h-4"
                                    style={selectedHighlightColor ? { color: selectedHighlightColor, filter: 'brightness(0.7)' } : undefined}
                                />
                                {/* Active color dot */}
                                {selectedHighlightColor && (
                                    <span
                                        className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white shadow-sm"
                                        style={{ backgroundColor: selectedHighlightColor }}
                                    />
                                )}
                                <ChevronRight className="w-3 h-3 text-muted-foreground/70" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2.5" side="bottom" align="start">
                            <p className="text-[10px] text-muted-foreground mb-2 font-medium uppercase tracking-wide">Pick color → select text → click ✓</p>
                            <div className="flex gap-2 items-center">
                                {[
                                    { color: '#D4A96A', title: 'Gold — Key Terms' },
                                    { color: '#7EC8B8', title: 'Teal — Doctrines' },
                                    { color: '#F0A0A0', title: 'Rose — Principles' },
                                    { color: '#9EC4D8', title: 'Sky — Case Refs' },
                                    { color: '#C4A8E0', title: 'Lavender — Notes' },
                                ].map(({ color, title }) => (
                                    <button
                                        key={color}
                                        onClick={() => {
                                            setSelectedHighlightColor(prev => prev === color ? null : color)
                                            // If text already selected, apply immediately
                                            if (!editor.state.selection.empty) {
                                                editor.chain().focus().toggleHighlight({ color }).run()
                                            }
                                        }}
                                        className={cn(
                                            "w-7 h-7 rounded-full border-2 shadow-sm hover:scale-110 transition-transform",
                                            selectedHighlightColor === color
                                                ? "border-slate-600 scale-110 ring-2 ring-slate-300 ring-offset-1"
                                                : "border-transparent hover:border-slate-300"
                                        )}
                                        style={{ backgroundColor: color }}
                                        title={title}
                                    />
                                ))}
                                <div className="w-px h-5 bg-border mx-0.5" />
                                <button
                                    onClick={() => {
                                        setSelectedHighlightColor(null)
                                        editor.chain().focus().unsetHighlight().run()
                                    }}
                                    className="w-7 h-7 rounded-full border border-border flex items-center justify-center bg-card text-muted-foreground/70 hover:bg-muted text-xs"
                                    title="Clear highlight"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        </PopoverContent>
                    </Popover>

                    <div className="w-px h-4 bg-muted" />

                    <div className="flex items-center gap-1">
                        {['red', 'green', 'blue', 'amber', 'violet'].map(color => (
                            <button 
                                key={color}
                                onClick={() => editor.chain().focus().toggleNoteBox({ color }).run()}
                                className={cn(
                                    "w-4 h-4 rounded-full hover:scale-125 transition-transform border",
                                    color === 'red' && "bg-red-100 border-red-400",
                                    color === 'green' && "bg-green-100 border-green-400",
                                    color === 'blue' && "bg-blue-100 border-blue-400",
                                    color === 'amber' && "bg-amber-100 border-amber-400",
                                    color === 'violet' && "bg-violet-100 border-violet-400",
                                    editor.isActive('noteBox', { color }) && "ring-2 ring-offset-1 ring-slate-400 scale-110"
                                )}
                                title={`${color.charAt(0).toUpperCase() + color.slice(1)} Box`}
                            />
                        ))}
                    </div>
                </div>
                
                <div className="w-px h-4 bg-muted mx-1" />

                {/* Insert Table */}
                <button
                    onClick={() => (editor.chain().focus() as any).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                    className="p-1.5 rounded hover:bg-muted/80 text-muted-foreground transition-colors"
                    title="Insert Table"
                >
                    <TableIcon className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-muted mx-1" />

                {/* Fix AI Mistakes */}
                <button
                    onClick={() => {
                        const fixed = fixAiMistakes(editor.getHTML())
                        editor.commands.setContent(fixed)
                        toast.success('Fixed AI formatting issues')
                    }}
                    className="flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                    title="Fix AI Mistakes — cleans up raw tags, markdown artifacts, empty paragraphs"
                >
                    <Wand2 className="w-3.5 h-3.5" />
                    Fix
                </button>

                <div className="w-px h-4 bg-muted mx-1" />

                {/* Clear Format */}
                <button
                    onClick={() => {
                        editor.chain().focus().unsetAllMarks().run()
                        if (editor.isActive('noteBox')) {
                            (editor.commands as any).unsetNoteBox()
                        }
                    }}
                    className="p-1.5 rounded hover:bg-muted/80 text-muted-foreground/70 hover:text-red-500 transition-colors"
                    title="Clear Formatting"
                >
                    <X className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-muted mx-1" />

                {/* ✨ AI Format buttons */}
                <div className="flex items-center gap-1">
                    {/* Quick format — no instructions */}
                    <button
                        onClick={() => handleAiFormat('')}
                        disabled={aiFormatting}
                        className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-semibold transition-all bg-linear-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 shadow-sm disabled:opacity-50"
                        title="AI Format — auto-beautify notes"
                    >
                        {aiFormatting
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <span>✨</span>
                        }
                        AI Format
                    </button>
                    {/* Instructions button */}
                    <button
                        onClick={() => setIsAiFormatOpen(true)}
                        disabled={aiFormatting}
                        className="flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium border border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors disabled:opacity-50"
                        title="AI Format with custom instructions"
                    >
                        <ChevronRight className="w-3.5 h-3.5" />
                        Instructions
                    </button>
                </div>
            </div>
        )
    }

  // Draft System State
  const [hasDraft, setHasDraft] = useState(false)
  const [, setDraftId] = useState<string | null>(null) // draftId unused, kept for logic potential
  const [publishedContent, setPublishedContent] = useState('') // Content from note_contents (what users see)

  // Auto-save state
  const autoSaveTimerRef = useState<{ current: NodeJS.Timeout | null }>({ current: null })[0]
  const [, setLastSaved] = useState<Date | null>(null) // lastSaved unused
  const [, setIsAutoSaving] = useState(false) // isAutoSaving unused

  // Quiz State
  const [quizContent, setQuizContent] = useState('')
  const [originalQuizContent, setOriginalQuizContent] = useState('')

  // Flashcard State
  interface Flashcard { front: string; back: string }
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [flashcardIdx, setFlashcardIdx] = useState(0)
  const [flashcardFlipped, setFlashcardFlipped] = useState(false)
  const [aiFlashcarding, setAiFlashcarding] = useState(false)
  const [flashcardEditing, setFlashcardEditing] = useState(false)
  const [flashcardEditFront, setFlashcardEditFront] = useState('')
  const [flashcardEditBack, setFlashcardEditBack] = useState('')
  const [flashcardSaving, setFlashcardSaving] = useState(false)
  const [scriptContent, setScriptContent] = useState('')
  const [originalScriptContent, setOriginalScriptContent] = useState('')
  const [saveScriptLoading, setSaveScriptLoading] = useState(false)

  // Right panel tab — controls what's shown in the right panel
  const [jRightTab, setJRightTab] = useState<'judgment' | 'quiz' | 'flashcards' | 'script'>('judgment')

  // Title Editing State (for inline rename)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(title)

  // Sync editedTitle when title prop changes (after save)
  useEffect(() => {
    setEditedTitle(title)
  }, [title])

  // Check if this item is a new draft (unsaved in structure)
  const isStructureDraft = changes.some(c => c.entityId === itemId && c.action === 'create')

  // ── Tag Case Notes Mode ───────────────────────────────────────────────────
  // When true: hides Quiz tab, focuses on Note + Judgment View only
  const [isTagCaseMode, setIsTagCaseMode] = useState(false)

  // ── Judgment Mode State ──────────────────────────────────────────────────
  const [judgmentMode, setJudgmentMode] = useState(false)
  const [jSplitPct, setJSplitPct] = useState(50)
  const jDraggingRef = useRef(false)
  const jContainerRef = useRef<HTMLDivElement>(null)
  const jNoteContainerRef = useRef<HTMLDivElement>(null)

  const [jLinks, setJLinks] = useState<NotePdfLink[]>([])
  const [jLinksLoaded, setJLinksLoaded] = useState(false)
  const [badgePositions, setBadgePositions] = useState<{ linkId: string; color: string; top: number }[]>([])
  const [jConnectMode, setJConnectMode] = useState(false)
  const [jConnectStep, setJConnectStep] = useState<'note' | 'pdf' | null>(null)
  const [jConnectNoteCapture, setJConnectNoteCapture] = useState<{ text: string; linkId: string } | null>(null)
  const [jConnectPdfCapture, setJConnectPdfCapture] = useState<{
    page: number; x: number; y: number; width: number; height: number; text: string
  } | null>(null)
  const [jHighlightedLinkId, setJHighlightedLinkId] = useState<string | null>(null)
  const [jConnectionViz, setJConnectionViz] = useState<ConnectionViz | null>(null)
  const [jSavingLink, setJSavingLink] = useState(false)
  const [jNoteMode, setJNoteMode] = useState<'edit' | 'preview'>('edit')
  const [jNoteZoom, setJNoteZoom] = useState(1.0)
  const [jPreviewHtml, setJPreviewHtml] = useState('')
  const [jNavigateToLinkId, setJNavigateToLinkId] = useState<string | null>(null)
  const [jVizFading, setJVizFading] = useState(false)
  const jVizTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const [jRedrawTick, setJRedrawTick] = useState(0)

  // Load links when judgment mode first activates for this item
  useEffect(() => {
    if (!judgmentMode || !itemId || jLinksLoaded) return
    fetchLinksForItem(itemId)
      .then(loadedLinks => { setJLinks(loadedLinks); setJLinksLoaded(true) })
      .catch(() => toast.error('Failed to load connections'))
  }, [judgmentMode, itemId, jLinksLoaded])

  // When judgment mode activates and links exist but editor has no linked spans,
  // load the published note_contents (which has [link:xxx] tags) so linked text is visible
  useEffect(() => {
    if (!judgmentMode || !jLinksLoaded || !editor || !itemId) return
    if (jLinks.length === 0) return
    const editorHtml = editor.getHTML()
    const hasLinkedSpans = /data-link-id=/.test(editorHtml)
    if (!hasLinkedSpans) {
      // Editor has no linked text but DB has links — load live content via Convex
      convex.query(api.adminQueries.getEditorData as any, { itemId })
        .then((dbData: any) => {
          const content = dbData?.liveRes?.data?.content_html
          if (content) {
            const html = customToHtml(content)
            if (/data-link-id=/.test(html)) {
              editor.commands.setContent(html)
              toast.info('Loaded published content with linked text')
            }
          }
        })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [judgmentMode, jLinksLoaded])

  // Reset judgment state when item changes
  useEffect(() => {
    setJLinks([])
    setJLinksLoaded(false)
    setJConnectMode(false)
    setJConnectStep(null)
    setJConnectNoteCapture(null)
    setJConnectPdfCapture(null)
    setJHighlightedLinkId(null)
    setJConnectionViz(null)
    setJNoteMode('edit')
    setJNavigateToLinkId(null)
    setJRightTab('judgment')
    setFlashcards([])
    setFlashcardIdx(0)
    setFlashcardFlipped(false)
    setScriptContent('')
    setOriginalScriptContent('')
  }, [itemId])

  // Auto-hide connection viz after 5 seconds with a 0.5s fade
  useEffect(() => {
    jVizTimersRef.current.forEach(clearTimeout)
    jVizTimersRef.current = []
    if (!jConnectionViz) { setJVizFading(false); return }
    setJVizFading(false)
    jVizTimersRef.current = [
      setTimeout(() => setJVizFading(true), 4500),
      setTimeout(() => { setJConnectionViz(null); setJVizFading(false) }, 5000),
    ]
    return () => { jVizTimersRef.current.forEach(clearTimeout) }
  }, [jConnectionViz])

  // Resizable judgment splitter
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!jDraggingRef.current || !jContainerRef.current) return
      const rect = jContainerRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setJSplitPct(Math.max(28, Math.min(72, pct)))
    }
    function onUp() { jDraggingRef.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  // Recalc badge positions after content/mode/links change
  useEffect(() => {
    if (!judgmentMode || !jLinks.length) { setBadgePositions([]); return }
    const timer = setTimeout(recalcBadgePositions, 250)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jPreviewHtml, jNoteMode, jLinks, judgmentMode])

  // ── Ctrl+Scroll Zoom Handler for Note Editor ──
  useEffect(() => {
    const el = jNoteContainerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const zoomDelta = -(e.deltaY * 0.002) // Smooth scaling based on wheel delta magnitude
        setJNoteZoom(prev => Math.min(Math.max(0.5, prev + zoomDelta), 3.0))
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  function autoLinkId(text: string): string {
    const base = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).slice(0, 3).join('-')
    return `link-${base || Date.now()}`
  }

  function getNoteLinkSpan(linkId: string): HTMLElement | null {
    if (!jContainerRef.current) return null
    // In preview mode, the editor is hidden, and its bounds are skewed.
    // Querying jContainerRef ensures we find the span in the visible pane (edit or preview).
    const spans = Array.from(jContainerRef.current.querySelectorAll(`[data-link-id="${linkId}"]`)) as HTMLElement[]
    return spans.find(span => span.offsetParent !== null) || spans[0] || null
  }

  function getJNoteText(linkId: string): string {
    const el = getNoteLinkSpan(linkId)
    return el?.textContent?.trim() || linkId
  }

  function flashNoteSpan(linkId: string) {
    const span = getNoteLinkSpan(linkId)
    if (!span) return
    span.classList.remove('note-span-flash')
    void (span as HTMLElement).offsetWidth  // force reflow to restart animation
    span.classList.add('note-span-flash')
    setTimeout(() => span.classList.remove('note-span-flash'), 2100)
  }

  function scrollNotesToLink(linkId: string) {
    const span = getNoteLinkSpan(linkId)
    if (!span) return
    span.scrollIntoView({ behavior: 'smooth', block: 'center' })
    flashNoteSpan(linkId)
  }

  // Calculate citation badge positions from span getBoundingClientRect.
  // Badges are rendered as React elements in an overlay — completely outside TipTap's DOM.
  function recalcBadgePositions() {
    const container = jNoteContainerRef.current
    if (!container || !judgmentMode || !jLinks.length) { setBadgePositions([]); return }
    const scrollEl = container.querySelector('.notes-editor-scroll') as HTMLElement | null
    const scrollTop = scrollEl?.scrollTop ?? 0
    const containerRect = container.getBoundingClientRect()
    const seenLinkIds = new Set<string>()
    const positions: { linkId: string; color: string; top: number }[] = []
    
    container.querySelectorAll<HTMLElement>('span[data-link-id]').forEach(span => {
      if (span.closest('h1,h2,h3')) return
      const linkId = span.getAttribute('data-link-id')!
      if (seenLinkIds.has(linkId)) return
      seenLinkIds.add(linkId)
      const para = span.closest('p,li') as HTMLElement | null
      if (!para) return
      
      const paraRect = para.getBoundingClientRect()
      const link = jLinks.find(l => l.link_id === linkId)
      const color = link ? parseLinkMeta(link.label).color : '#c9922a'
      
      // Fix for zoom skewing hitboxes:
      // When CSS zoom is active, getBoundingClientRect returns scaled values.
      // We divide the visual delta by jNoteZoom to get the correct unscaled offset.
      const visualDelta = paraRect.bottom - containerRect.top
      const top = (visualDelta / jNoteZoom) + scrollTop - 10
      
      positions.push({ linkId, color, top })
    })
    setBadgePositions(positions)
  }

  async function extractTextForLink(link: NotePdfLink) {
    setMobileSheetLoading(true)
    setMobileSheetText('')
    try {
      let doc = cachedPdfDoc.current
      if (!doc) {
        let proxyUrl = ''
        if (itemId) {
           proxyUrl = `/api/judgment/pdf-proxy?itemId=${itemId}`
        }
        if (!proxyUrl) throw new Error('No PDF URL')
        
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        doc = await pdfjsLib.getDocument(proxyUrl).promise
        cachedPdfDoc.current = doc
      }
      
      const page = await doc.getPage(link.pdf_page)
      const content = await page.getTextContent()
      const items = content.items as any[]
      
      let extracted = ''
      for (const item of items) {
        if (!item.transform) continue
        const tx = item.transform[4] as number
        const ty = item.transform[5] as number
        const tw = item.width as number || 0
        const th = item.height as number || 0
        
        const cx = tx + tw / 2
        const cy = ty + th / 2
        
        if (cx >= link.x && cx <= link.x + link.width && cy >= link.y && cy <= link.y + link.height) {
          extracted += (item.str ?? '') + ' '
        }
      }
      
      setMobileSheetText(extracted.trim() || 'No clear text found in this region.')
    } catch (err) {
      console.error('Failed to extract PDF text:', err)
      setMobileSheetText('Failed to extract text from PDF.')
    } finally {
      setMobileSheetLoading(false)
    }
  }

  // Click on a linked-text span in note (edit or preview mode) → navigate PDF
  function handleJLinkedTextClick(e: React.MouseEvent) {
    if (jConnectMode) return
    const span = (e.target as HTMLElement).closest('[data-link-id]') as HTMLElement | null

    if (span) {
      const linkId = span.getAttribute('data-link-id')
      if (!linkId) return
      e.preventDefault()
      e.stopPropagation()

      // Mobile Bottom Sheet
      if (window.innerWidth < 1024) {
        const link = jLinks.find(l => l.link_id === linkId)
        if (link) {
          setMobileSheetLink(link)
          extractTextForLink(link)
        }
        return
      }

      setJNavigateToLinkId(linkId)
      setJHighlightedLinkId(linkId)
      setJRightTab('judgment')
      flashNoteSpan(linkId)
      setTimeout(() => setJHighlightedLinkId(null), 2000)
      return
    }

    if (jNoteMode !== 'preview' || !editor || !ttsSnapshot) return

    const posInfo = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
    if (!posInfo) return
    const pmPos = Math.max(1, Math.min(posInfo.pos, editor.state.doc.content.size))

    ttsReaderRef.current?.playFromPmPosition(pmPos)
    handleClickPosition(pmPos, { fromScrub: true })
  }

  function switchJNoteMode(mode: 'edit' | 'preview') {
    if (mode === 'preview' && editor) {
      setJPreviewHtml(editor.getHTML())
    }
    setJNoteMode(mode)
  }

  function startJConnect() {
    switchJNoteMode('edit') // Force edit mode since we rely on Tiptap's editor.state.selection
    setJConnectMode(true)
    setJConnectStep('note')
    setJConnectNoteCapture(null)
    setJConnectPdfCapture(null)
    toast.info('Step 1: Select text in the note to link')
  }

  // saved=true means connection was committed — keep the mark; saved=false means cancel — remove it
  function exitJConnect(saved = false) {
    if (!saved && jConnectNoteCapture?.linkId && jConnectStep === 'pdf' && editor) {
      const safeId = jConnectNoteCapture.linkId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const spanRe = new RegExp(`<span[^>]*data-link-id="${safeId}"[^>]*>(.*?)<\\/span>`, 'gi')
      const newHtml = editor.getHTML().replace(spanRe, '$1')
      editor.commands.setContent(newHtml)
    }
    setJConnectMode(false)
    setJConnectStep(null)
    setJConnectNoteCapture(null)
    setJConnectPdfCapture(null)
  }

  // Called when user releases mouse after selecting text in judgment mode note panel
  function handleJNoteMouseUp() {
    if (!jConnectMode || jConnectStep !== 'note' || !editor) return
    const { from, to } = editor.state.selection
    if (from === to) return
    const text = editor.state.doc.textBetween(from, to, ' ', ' ').trim()
    if (!text) return
    const linkId = autoLinkId(text)
    editor.chain().focus().setMark('linkedText', { linkId }).run()
    setJConnectNoteCapture({ text, linkId })
    setJConnectStep('pdf')
    toast.info('Note text captured — now select text in the PDF →')
  }

  async function handleJConnectSave() {
    if (!jConnectNoteCapture || !jConnectPdfCapture || !itemId || !editor) return
    const { linkId, text: noteText } = jConnectNoteCapture
    setJSavingLink(true)
    try {
      const newLink = await insertLink({
        item_id: itemId,
        link_id: linkId,
        pdf_page: jConnectPdfCapture.page,
        x: jConnectPdfCapture.x,
        y: jConnectPdfCapture.y,
        width: jConnectPdfCapture.width,
        height: jConnectPdfCapture.height,
      })
      setJLinks(prev => [...prev, newLink])

      // Save note content with the new linked mark
      const customTags = htmlToCustom(editor.getHTML())
      await saveNoteContent(itemId, customTags)

      toast.success(`Connected "${noteText}" ↔ page ${jConnectPdfCapture.page}`)
      exitJConnect(true) // true = saved, keep the mark
    } catch (err: any) {
      toast.error(err.message || 'Failed to save connection')
    } finally {
      setJSavingLink(false)
    }
  }

  async function handleJDeleteLink(linkDbId: string) {
    const linkToDelete = jLinks.find(l => l.id === linkDbId)
    if (!linkToDelete || !editor || !itemId) return
    try {
      await deleteLink(linkDbId)
      setJLinks(prev => prev.filter(l => l.id !== linkDbId))

      // Remove the mark from editor content
      const safeId = linkToDelete.link_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const spanRe = new RegExp(`<span[^>]*data-link-id="${safeId}"[^>]*>(.*?)<\\/span>`, 'gi')
      const newHtml = editor.getHTML().replace(spanRe, '$1')
      editor.commands.setContent(newHtml)

      // Save updated note content
      const customTags = htmlToCustom(editor.getHTML())
      await saveNoteContent(itemId, customTags)

      if (jHighlightedLinkId === linkToDelete.link_id) {
        setJHighlightedLinkId(null)
        setJConnectionViz(null)
      }
      toast.success('Connection removed')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  // Initialize Tiptap Editor
  const editor = useEditor({
    immediatelyRender: false,
    extensions: EDITOR_EXTENSIONS,
    content: '',
    editorProps: {
        attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none outline-none',
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain')
        if (!text) return false

        // 1. MAGIC AI PASTE: Detect AI connections JSON
        if (text.includes('---CONNECTIONS_JSON---')) {
            handleMagicPaste(text)
            return true // Prevent default paste
        }

        // 2. MAGIC FORMAT PASTE: Detect AI syntax and render it instantly
        if (text.includes('[box:') || text.includes('[h1]') || text.includes('[p]') || text.includes('[size:')) {
            try {
                const html = customToHtml(text)
                
                // Parse HTML to ProseMirror Slice
                const parser = new DOMParser()
                const dom = parser.parseFromString(html, 'text/html').body
                
                const pmSlice = ProseMirrorDOMParser.fromSchema(view.state.schema)
                    .parseSlice(dom)
                
                // Insert content
                view.dispatch(view.state.tr.replaceSelection(pmSlice))
                
                toast.success('AI Content Auto-Formatted!')
                return true // Prevent default paste
            } catch (e) {
                console.error("Auto-format failed", e)
                return false // Fallback to normal paste
            }
        }
        return false // Normal paste
      }
    },
    onUpdate: ({ editor }) => {
        const nextSnapshot = buildTTSSnapshotFromDoc(editor.state.doc)
        setTtsSnapshot(nextSnapshot)

        if (getActiveSource() === 'notes') {
          stopTTS('notes')
        }

        // LOCAL AUTOSAVE: Debounced save to local storage
        if (!itemId) return
        const html = editor.getHTML()
        debouncedSave(itemId, html)

        // AUTO-DELETE: if a linked span was deleted from the editor, remove the DB connection too
        if (judgmentMode && jLinks.length > 0) {
          const presentIds = new Set(
            Array.from(html.matchAll(/data-link-id="([^"]+)"/g)).map(m => m[1])
          )
          jLinks.forEach(link => {
            if (!presentIds.has(link.link_id)) {
              deleteLink(link.id).catch(() => {})
              setJLinks(prev => prev.filter(l => l.id !== link.id))
            }
          })
        }
    }
  })

  // Debounced Autosave Implementation
  const debouncedSave = useCallback((id: string, content: string) => {
     // We define this but actually use useDebouncedCallback or just use-debounce lib
     // But since we can't easily import useDebouncedCallback without checking package.json
     // Let's implement a simple ref-based debounce here or assumes useDebounce exists?
     // Actually, let's use a custom lightweight debounce within the effect or onUpdate
     // Simpler: Just direct call localCache.setNoteContent here, as it's just zustand
     // persistence might be heavy? No, writing to localStorage 60fps is bad.
     // Let's use a timeout ref.
     
     if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
     autoSaveTimerRef.current = setTimeout(() => {
        localCache.setNoteContent(id, content)
        // Also save quiz if changed
        if (quizContent) localCache.setQuizContent(id, quizContent)
        console.log('Autosave: Saved to localStorage')
     }, 1000) // 1 second debounce

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizContent])
  
  // Cleanup timer
  useEffect(() => {
      return () => {
          if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // Close expanded mode on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && isExpanded) {
            if (onExpandChange) onExpandChange(false)
            else setInternalIsExpanded(false)
        }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isExpanded, onExpandChange])

  const [quizSplit, setQuizSplit] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const [previewFullscreen, setPreviewFullscreen] = useState(false)

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
  // Effect A: Save on Leave (Cache unsaved changes before switching)
  useEffect(() => {
    // SECURITY CHECK: Only cache if we are leaving an item that was FULLY LOADED.
    // This prevents "pollution" where rapid clicking caches empty/stale content for an item that never finished loading.
    const isSafeToCache = prevItemIdRef.current && 
                          prevItemIdRef.current === currentLoadedItemId.current && 
                          editor

    if (isSafeToCache && prevItemIdRef.current) {
        const currentHtml = editor!.getHTML()
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Safety timeout defined BEFORE fetch so we can clear it
    const safetyTimeout = setTimeout(() => {
        if (isMounted) {
            console.log('EditorPanel: [Safety Timeout] Forcing loading to false')
            setLoading(false)
            toast.error('Loading timed out. Please refresh the page.')
        }
    }, 30000)

    async function fetch() {
        console.log('EditorPanel: [Fetch] Starting for', itemId)
        try {
            // Check Local Cache First
            const cachedNote = localCache.getNoteContent(itemId!)
            const cachedNoteSavedAt = localCache.getNoteContentSavedAt(itemId!)
            const cachedQuiz = localCache.getQuizContent(itemId!)

            // Fetch DB Data via Convex
            const dbData = await convex.query(api.adminQueries.getEditorData as any, { itemId })
            const { draftRes, liveRes, itemRes, quizRes } = dbData

            if (!isMounted) return

            // If the DB note was saved AFTER the local cache entry (e.g. saved via MCP/Claude),
            // discard the stale local cache so the fresh DB content is shown.
            const dbUpdatedAt = liveRes.data?.updated_at
            const cacheIsStale = cachedNote && dbUpdatedAt && (
                !cachedNoteSavedAt || new Date(dbUpdatedAt) > new Date(cachedNoteSavedAt)
            )
            if (cacheIsStale) {
                localCache.clearContent(itemId!)
            }
            const freshCachedNote = cacheIsStale ? undefined : cachedNote

            setFetchedData({
                itemId,
                source: freshCachedNote ? 'cache' : (draftRes.data ? 'draft' : 'live'),
                content: freshCachedNote || draftRes.data?.draft_data?.content_html || liveRes.data?.content_html || '',
                publishedContent: liveRes.data?.content_html || '',
                hasDraft: !!draftRes.data,
                draftId: draftRes.data?.id || null,
                hasPdf: !!itemRes.data?.pdf_url,
                
                // Quiz Data
                quizSource: cachedQuiz ? 'cache' : 'db',
                quizContent: cachedQuiz || null,
                quizData: quizRes.data,

                // Flashcard Data (from node_contents.flashcards_json)
                flashcardsJson: liveRes.data?.flashcards_json || null,
                scriptText: liveRes.data?.script_text || '',
            })
            console.log('EditorPanel: [Fetch] Complete - setFetchedData called for', itemId)
            
        } catch (e: any) {
            console.error('Error fetching content:', e)
            toast.error("Failed to load content. Please check your connection or permissions.", {
                description: e.message || "Unknown error"
            })
        } finally {
            if (isMounted) {
                console.log('EditorPanel: [Fetch] Finally - setLoading(false)')
                setLoading(false)
                clearTimeout(safetyTimeout) // Clear timeout on completion
            }
        }
    }

    fetch()

    return () => { 
        isMounted = false 
        clearTimeout(safetyTimeout)
        clearTimeout(safetyTimeout)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setScriptContent('')
        setOriginalScriptContent('')
        return
    }

    // 1. Set Editor Content
    const html = customToHtml(fetchedData.content)
    // Only update if significantly different to prevent cursor jumps if this runs oddly
    // But since it runs on [fetchedData] change, it should be fine.
    editor.commands.setContent(html)
    setInitialContent(html)
    currentLoadedItemId.current = itemId // MARK AS LOADED
    
    // 2. Set State
    setHasDraft(fetchedData.hasDraft)
    setDraftId(fetchedData.draftId)
    setPublishedContent(customToHtml(fetchedData.publishedContent))
    setHasPdfAttached(fetchedData.hasPdf)
    if (fetchedData.hasPdf) {
        setIsTagCaseMode(true)
        setJudgmentMode(true)
    }

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

    // 4. Load Flashcards from DB if available and not already in memory
    if (fetchedData.flashcardsJson && flashcards.length === 0) {
        try {
            const parsed = JSON.parse(fetchedData.flashcardsJson)
            if (Array.isArray(parsed) && parsed.length > 0) {
                setFlashcards(parsed)
                setFlashcardIdx(0)
                setFlashcardFlipped(false)
            }
        } catch { /* malformed JSON — ignore */ }
    }

    const nextScriptText = typeof fetchedData.scriptText === 'string' ? fetchedData.scriptText : ''
    setScriptContent(nextScriptText)
    setOriginalScriptContent(nextScriptText)

  }, [editor, fetchedData, itemId, flashcards.length])

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
        await saveDraftMutation({ itemId, contentHtml: customSyntax })
        
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
        const parsedQuiz = parseQuizText(quizContent)
        if (parsedQuiz.questions.length === 0) {
            toast.error("No valid questions found. Use format: Q1. Question text...")
            setSaveQuizLoading(false)
            return
        }

        console.log('Saving quiz with', parsedQuiz.questions.length, 'questions')

        await saveQuizMutation({
            itemId,
            title: parsedQuiz.title || title || 'Quiz',
            questions: parsedQuiz.questions
        })
        
        setOriginalQuizContent(quizContent)
        toast.success(`Quiz saved with ${parsedQuiz.questions.length} questions`)
    } catch (e: any) {
        console.error("Error saving quiz:", e)
        toast.error(`Failed to save quiz: ${e.message}`)
    } finally {
        setSaveQuizLoading(false)
    }
  }

  const handleSaveScript = async () => {
    if (!itemId) return
    setSaveScriptLoading(true)
    try {
      await saveScriptMutation({
        itemId,
        script_text: scriptContent,
      })
      setOriginalScriptContent(scriptContent)
      toast.success('Script saved')
    } catch (e: any) {
      toast.error(`Failed to save script: ${e?.message || 'Unknown error'}`)
    } finally {
      setSaveScriptLoading(false)
    }
  }

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

  useEffect(() => {
    if (!editor) return
    setTtsSnapshot(buildTTSSnapshotFromDoc(editor.state.doc))
  }, [editor])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(jNoteMode === 'edit')
  }, [editor, jNoteMode])

  useEffect(() => {
    return () => {
      stopTTS('notes')
    }
  }, [])

  useEffect(() => {
    stopTTS('notes')
  }, [itemId])

  const scrollPmPosIntoView = useCallback((pmPos: number) => {
    if (!editor) return

    const findScrollContainer = () => {
      const editorDom = editor.view.dom as HTMLElement
      const notesScroll = editorDom.closest('.notes-editor-scroll') as HTMLElement | null
      if (notesScroll) return notesScroll

      let el: HTMLElement | null = editorDom.parentElement
      while (el) {
        const style = window.getComputedStyle(el)
        const canScrollY = style.overflowY === 'auto' || style.overflowY === 'scroll'
        if (canScrollY && el.scrollHeight > el.clientHeight) return el
        el = el.parentElement
      }
      return null
    }

    const scrollEl = findScrollContainer()
    if (!scrollEl) return

    const rect = editor.view.coordsAtPos(pmPos)
    const containerRect = scrollEl.getBoundingClientRect()
    if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
      scrollEl.scrollTo({
        top: scrollEl.scrollTop + (rect.top - containerRect.top) - containerRect.height / 2,
        behavior: 'smooth',
      })
    }
  }, [editor])

  // TTS Handlers
  const handleActiveTokenChange = useCallback((token: TTSToken | null) => {
    if (!editor) return
    const ttsStorage = editor.storage as { ttsHighlight: { range: { start: number, end: number } | null } }

    if (token) {
      const safeEnd = Math.max(token.pmFrom + 1, token.pmTo)
      ttsStorage.ttsHighlight.range = { start: token.pmFrom, end: safeEnd }
      editor.view.dispatch(editor.state.tr)

      if (shouldAutoScrollTtsRef.current) {
        scrollPmPosIntoView(token.pmFrom)
        shouldAutoScrollTtsRef.current = false
      }
      return
    }

    ttsStorage.ttsHighlight.range = null
    editor.view.dispatch(editor.state.tr)
  }, [editor, scrollPmPosIntoView])

  const handleClickPosition = useCallback((pmPos: number, meta?: { fromScrub?: boolean }) => {
    if (!editor) return

    const safePos = Math.max(0, Math.min(pmPos, editor.state.doc.content.size))
    shouldAutoScrollTtsRef.current = !!meta?.fromScrub
    editor.commands.setTextSelection(safePos)
    editor.view.focus()

    if (meta?.fromScrub) {
      window.requestAnimationFrame(() => {
        scrollPmPosIntoView(safePos)
      })
    }
  }, [editor, scrollPmPosIntoView])

  useEffect(() => {
    return () => {
      handleActiveTokenChange(null)
    }
  }, [handleActiveTokenChange])

  useEffect(() => {
    handleActiveTokenChange(null)
  }, [handleActiveTokenChange, itemId])


  // Publish (Commit Cache to Live)
  const handlePublish = async () => {
    if (!itemId || !editor) return
    
    setPublishLoading(true)
    const currentHtml = editor.getHTML()
    const customSyntax = htmlToCustom(currentHtml)
    
    try {
        await publishMutation({ itemId, contentHtml: customSyntax })
        
        localCache.clearContent(itemId)
        setHasDraft(false)
        setDraftId(null)
        setInitialContent(currentHtml)
        setPublishedContent(currentHtml)
        
        toast.success("Content published successfully", {
            description: "Draft cleared and content is now live."
        })
    } catch (e: any) {
        console.error('Error publishing content', e)
        toast.error('Failed to publish content', {
            description: e.message || "Unknown error"
        })
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
          await discardDraftMutation({ itemId: itemId! })
          if (itemId) localCache.clearContent(itemId)
          
          setHasDraft(false)
          setDraftId(null)
          
          const dbData = await convex.query(api.adminQueries.getEditorData as any, { itemId })
          const liveRes = dbData.liveRes
            
          const rawContent = liveRes.data?.content_html || ''
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

  if (!itemId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-muted/50 rounded-xl border border-dashed border-border m-4">
        <div className="bg-card p-4 rounded-full shadow-sm mb-4">
            <FileText className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <p className="font-medium">Select a note to edit content</p>
      </div>
    )
  }

  if (itemType === 'folder') {
     return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-muted/50 rounded-xl border border-dashed border-border m-4">
        <div className="bg-card p-4 rounded-full shadow-sm mb-4">
            <GripVertical className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <p className="font-medium">Folder Selected</p>
        <p className="text-sm mt-2 max-w-xs text-center">You can rename folders in the tree. Select a file inside to edit its content.</p>
      </div>
    )
  }

  return (
    <div 
        className={cn(
            "h-full flex flex-col bg-card rounded-xl shadow-sm border border-border overflow-hidden transition-all duration-300",
            isExpanded && "fixed inset-0 z-40 rounded-none border-0"
        )}
    >
        {/* Header */}
        <div className="border-b border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/85 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2 xl:flex-nowrap">
                <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={isExpanded ? () => onExpandChange?.(false) : onClose}
                        className={cn("h-9 rounded-lg px-3", isExpanded && "ml-12")}
                    >
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Back
                    </Button>

                    <button
                        onClick={() => {
                            if (hasPdfAttached) return
                            const next = !isTagCaseMode
                            setIsTagCaseMode(next)
                            if (next) setActiveTab('note')
                            if (!next) setJudgmentMode(false)
                        }}
                        disabled={hasPdfAttached}
                        className={cn(
                            "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-all",
                            isTagCaseMode
                                ? "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-300"
                                : "border-border bg-muted text-muted-foreground hover:border-amber-300 hover:text-foreground",
                            hasPdfAttached && "cursor-not-allowed opacity-60"
                        )}
                        title={hasPdfAttached ? "Judgment PDF is attached, so Tag Case Notes mode is locked." : (isTagCaseMode ? "Switch back to full notes mode (show all tabs)" : "Switch to Tag Case Notes mode (Note + Judgment only)")}
                    >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M8 2L10 6H14L11 9L12 13L8 11L4 13L5 9L2 6H6L8 2Z" strokeLinejoin="round" />
                        </svg>
                        {isTagCaseMode ? 'Tag Case Notes' : 'Enable Tag Mode'}
                    </button>

                    <div className="mx-1 hidden h-6 w-px bg-border md:block" />

                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                            <FileText className="h-5 w-5 shrink-0 text-blue-500" />
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
                                    className="min-w-[120px] border-b-2 border-blue-500 bg-transparent px-1 text-lg font-bold outline-none"
                                    autoFocus
                                />
                            ) : (
                                <h3
                                    className="max-w-[min(34vw,460px)] truncate text-lg font-bold text-foreground transition-colors hover:text-blue-600"
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
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                    <AlertTriangle className="h-3 w-3" />
                                    Draft
                                </span>
                            )}
                            {activeTab === 'quiz' && quizContent !== originalQuizContent && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                                    Unsaved Quiz
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-1.5 overflow-x-auto whitespace-nowrap">
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleToggleExpand}
                            className="h-8 w-8 p-0 text-muted-foreground"
                            title={isExpanded ? "Exit Full Screen" : "Fill Screen"}
                        >
                            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </Button>
                    </div>

                    {activeTab === 'note' ? (
                        <>
                            {itemId && isTagCaseMode && (
                                <button
                                    onClick={() => setJudgmentMode((v) => !v)}
                                    className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors"
                                    style={judgmentMode ? {
                                        background: 'rgba(201,146,42,0.18)',
                                        border: '1px solid #c9922a',
                                        color: '#c9922a',
                                    } : {
                                        background: 'rgba(201,146,42,0.07)',
                                        border: '1px solid rgba(201,146,42,0.3)',
                                        color: '#c9922a',
                                    }}
                                    title={judgmentMode ? 'Exit judgment split view' : 'Open Notes + Judgment split view'}
                                >
                                    {judgmentMode ? (
                                        <Unlink2 className="h-4 w-4" />
                                    ) : (
                                        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                            <rect x="1" y="2" width="6" height="12" rx="1" />
                                            <rect x="9" y="2" width="6" height="12" rx="1" />
                                        </svg>
                                    )}
                                    {judgmentMode ? 'Exit Judgment' : 'Judgment View'}
                                </button>
                            )}

                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleDiscardDraft}
                                disabled={isStructureDraft || loading || (!hasDraft && editor?.getHTML() === initialContent)}
                                className="h-9 rounded-lg px-3 text-red-500 hover:bg-red-50 hover:text-red-700"
                                title="Discard all changes and revert to published version"
                            >
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Discard
                            </Button>

                            <Button
                                size="sm"
                                onClick={() => handleSaveDraft(false)}
                                disabled={!editor || saveLoading || isStructureDraft || (!hasDraft && editor?.getHTML() === initialContent)}
                                variant="secondary"
                                className="h-9 rounded-lg border border-amber-200 bg-amber-100 px-3 text-amber-900 hover:bg-amber-200"
                                title="Save changes as draft (not visible to users)"
                            >
                                {saveLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save Draft
                            </Button>

                            <Button
                                size="sm"
                                onClick={handlePublish}
                                disabled={publishLoading || isStructureDraft || !hasDraft || (initialContent === publishedContent)}
                                className={cn(
                                    "h-9 rounded-lg px-3",
                                    !hasDraft || (initialContent === publishedContent)
                                        ? "cursor-not-allowed bg-muted text-muted-foreground"
                                        : "bg-green-600 text-white hover:bg-green-700"
                                )}
                                title={!hasDraft
                                    ? "Save to draft first before publishing"
                                    : (initialContent === publishedContent)
                                        ? "Draft is same as published content"
                                        : "Publish content (visible to users)"}
                            >
                                {publishLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                Publish
                            </Button>
                        </>
                    ) : (
                        <Button
                            size="sm"
                            onClick={handleSaveQuiz}
                            disabled={saveQuizLoading || quizContent === originalQuizContent}
                            className="h-9 rounded-lg bg-purple-600 px-3 text-white hover:bg-purple-700"
                        >
                            {saveQuizLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save Quiz
                        </Button>
                    )}
                </div>
            </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 border-b bg-muted/50">
            {mode === 'all' ? (
                <TabsList className="bg-transparent p-0 h-10 w-full justify-start space-x-2">
                    <TabsTrigger
                        value="note"
                        className="data-[state=active]:bg-card data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-none rounded-none px-4 h-10 border-b-2 border-transparent transition-all"
                    >
                        <StickyNote className="w-4 h-4 mr-2" />
                        Note Content
                    </TabsTrigger>
                    {/* Always show Quiz tab */}
                    <TabsTrigger
                        value="quiz"
                        className="data-[state=active]:bg-card data-[state=active]:border-b-2 data-[state=active]:border-purple-500 data-[state=active]:shadow-none rounded-none px-4 h-10 border-b-2 border-transparent transition-all"
                    >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Quiz
                    </TabsTrigger>
                </TabsList>
            ) : (
                <div className="flex items-center gap-2 h-10 px-2 w-full">
                    {mode === 'notes-only' && (
                        <div className="flex items-center gap-2">
                            <StickyNote className="w-4 h-4 text-blue-500" />
                            <span className="font-medium text-sm">Note Editor</span>
                        </div>
                    )}
                    {mode === 'quiz-only' && (
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-purple-500" />
                            <span className="font-medium text-sm">Quiz Editor</span>
                        </div>
                    )}

                    {/* FULL SCREEN TOOLBAR INTEGRATION */}
                    {isExpanded && activeTab === 'note' && (
                        <div className="flex-1 flex justify-center animate-in slide-in-from-top-2 duration-300">
                            {renderEditorToolbar()}
                        </div>
                    )}
                    
                    {/* Placeholder to keep header height consistent or for balanced flex */}
                    {isExpanded && activeTab === 'note' && <div className="w-[200px]" />}
                </div>
            )}
            </div>

            <TabsContent value="note" className="flex-1 overflow-hidden flex flex-col relative m-0 p-0">
                {/* ── Judgment connect banner (shown above toolbar in judgment mode) ── */}
                {judgmentMode && jConnectMode && (
                    <div className={cn(
                        'px-4 py-2 border-b shrink-0 flex items-center justify-between gap-2 z-20',
                        jConnectStep === 'note'
                            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/30'
                            : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/30'
                    )}>
                        {jConnectStep === 'note' && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200">1</span>
                                <span className="text-xs text-amber-800 dark:text-amber-300">Select text in the note then release mouse — it will be highlighted amber</span>
                            </div>
                        )}
                        {jConnectStep === 'pdf' && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">✓</span>
                                <span className="text-xs text-green-800 dark:text-green-300">
                                    <span className="font-medium">"{jConnectNoteCapture?.text}"</span> captured — now select text in the PDF →
                                </span>
                            </div>
                        )}
                        <button onClick={() => exitJConnect()} className="text-muted-foreground hover:text-foreground transition-colors ml-auto shrink-0">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* ── Judgment split layout ── */}
                {judgmentMode ? (
                    <div
                        ref={jContainerRef}
                        className="flex-1 overflow-hidden flex flex-col lg:flex-row relative"
                    >
                        {/* Mobile Tabs Toggle */}
                        <div className="lg:hidden flex items-center bg-muted/40 border-b border-border p-1 shrink-0 z-20">
                            <div className="flex w-full bg-card rounded-md border shadow-sm p-0.5 relative">
                               <button 
                                   onClick={() => setMobileTagTab('notes')} 
                                   className={cn("flex-1 py-1.5 text-xs font-semibold rounded-sm z-10 transition-colors", mobileTagTab === 'notes' ? "text-foreground shadow-sm bg-background border border-border/50" : "text-muted-foreground hover:text-foreground")}
                               >
                                  Notes
                               </button>
                               <button 
                                   onClick={() => setMobileTagTab('pdf')} 
                                   className={cn("flex-1 py-1.5 text-xs font-semibold rounded-sm z-10 transition-colors", mobileTagTab === 'pdf' ? "text-foreground shadow-sm bg-background border border-border/50" : "text-muted-foreground hover:text-foreground")}
                               >
                                  PDF Viewer
                               </button>
                            </div>
                        </div>

                        {/* Dynamic per-link color styles for linked text spans */}
                        <style>{jLinks.map(link => {
                            const { color } = parseLinkMeta(link.label)
                            return `span[data-link-id="${link.link_id}"] { color: ${color} !important; border-bottom-color: ${color} !important; }`
                        }).join('\n')}</style>

                        {/* Left: Note Editor */}
                        <div
                            className={cn(
                                "flex-col min-w-0 overflow-hidden lg:border-r border-border shrink-0",
                                mobileTagTab === 'notes' ? "flex w-full lg:w-(--split-pct)" : "hidden lg:flex lg:w-(--split-pct)"
                            )}
                            style={{ '--split-pct': `${jSplitPct}%` } as any}
                        >
                            {/* Row 1: Toolbar - shown in both edit and preview modes */}
                            <div className="sticky top-0 z-50 px-4 py-3 mb-4 border-b bg-card transition-all duration-300">
                                <div className="flex items-center justify-between w-full">
                                    {/* Left side */}
                                    <div className="flex items-center gap-2">
                                        {jNoteMode === 'preview' ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => switchJNoteMode('edit')}
                                                className="rounded-full h-8 px-3 text-xs transition-all duration-300"
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                                                <span className="hidden sm:inline">Edit</span>
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant={jConnectMode ? 'default' : 'outline'}
                                                onClick={jConnectMode ? () => exitJConnect() : startJConnect}
                                                className={cn(
                                                    'h-7 text-xs shrink-0',
                                                    jConnectMode
                                                        ? 'bg-amber-500 hover:bg-amber-600 border-0 text-white'
                                                        : 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                                                )}
                                            >
                                                <Link2 className="w-3.5 h-3.5 mr-1" />
                                                {jConnectMode ? 'Cancel' : 'Connect'}
                                            </Button>
                                        )}

                                        <div className="w-px h-5 bg-border" />

                                        <span className="text-sm font-medium max-w-[300px] truncate px-2">
                                            Notes
                                        </span>
                                    </div>

                                    {/* Right side */}
                                    <div className="flex items-center gap-2">
                                        {/* Zoom Controls */}
                                        <div className="flex items-center gap-px bg-muted/60 p-0.5 rounded-md border border-border">
                                            <button onClick={() => setJNoteZoom(p => Math.max(0.5, p - 0.1))} className="w-6 h-6 flex items-center justify-center text-xs hover:bg-background rounded-sm text-muted-foreground hover:text-foreground" title="Zoom Out">-</button>
                                            <button onClick={() => setJNoteZoom(1.0)} className="px-2 h-6 flex items-center justify-center text-[10px] hover:bg-background rounded-sm font-mono text-muted-foreground hover:text-foreground" title="Reset Zoom">{Math.round(jNoteZoom * 100)}%</button>
                                            <button onClick={() => setJNoteZoom(p => Math.min(3.0, p + 0.1))} className="w-6 h-6 flex items-center justify-center text-xs hover:bg-background rounded-sm text-muted-foreground hover:text-foreground" title="Zoom In">+</button>
                                        </div>

                                        {/* Edit/Preview Toggle */}
                                        <div className="flex gap-px p-0.5 rounded-md bg-muted shrink-0">
                                            <button
                                                onClick={() => switchJNoteMode('edit')}
                                                className={cn(
                                                    "px-2 py-0.5 rounded text-xs font-medium transition-all",
                                                    jNoteMode === 'edit' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                                )}
                                            >Edit</button>
                                            <button
                                                onClick={() => switchJNoteMode('preview')}
                                                className={cn(
                                                    "px-2 py-0.5 rounded text-xs font-medium transition-all",
                                                    jNoteMode === 'preview' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                                )}
                                            >Preview</button>
                                        </div>

                                        {/* Download Button */}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="rounded-full h-8 px-3 text-xs transition-all duration-300"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                        </Button>

                                        {/* Focus Button */}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setPreviewFullscreen(!previewFullscreen)}
                                            className="rounded-full h-8 px-3 text-xs transition-all duration-300"
                                        >
                                            {previewFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Row 2: Full formatting toolbar (same as normal notes) */}
                            {jNoteMode === 'edit' && editor && (
                                <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-card shadow-sm z-10 sticky top-0 flex-wrap">
                                    {renderEditorToolbar()}
                                </div>
                            )}

                            {/* Editor Area */}
                            <div className="flex-1 overflow-hidden flex flex-col relative" ref={jNoteContainerRef}>
                                {loading && (
                                    <div className="absolute inset-0 bg-card/50 backdrop-blur-sm z-50 flex items-center justify-center">
                                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                    </div>
                                )}

                                {/* Notes surface (editable in Edit, read-only in Preview) */}
                                <div
                                    className="judgment-note-editor notes-editor-scroll flex-1 overflow-y-auto"
                                    onMouseUp={jNoteMode === 'edit' ? handleJNoteMouseUp : undefined}
                                    onClick={handleJLinkedTextClick}
                                    onScroll={() => {
                                        if (jConnectionViz) setJRedrawTick(t => t + 1)
                                        recalcBadgePositions()
                                    }}
                                >
                                    <div
                                        className={cn(
                                            "relative",
                                            jNoteMode === 'preview' && "note-prose-render prose prose-lg max-w-none"
                                        )}
                                        style={{ zoom: jNoteZoom }}
                                    >
                                        <EditorContent editor={editor} />
                                    </div>
                                </div>

                                {/* Citation badge overlay — rendered as React elements, completely outside TipTap DOM */}
                                {judgmentMode && badgePositions.length > 0 && (
                                    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 25 }}>
                                        {badgePositions.map((b, idx) => (
                                            <button
                                                key={b.linkId}
                                                className="citation-badge pointer-events-auto absolute"
                                                style={{ top: b.top, right: 10, background: b.color }}
                                                title="Jump to judgment"
                                                onClick={() => {
                                                    setJNavigateToLinkId(b.linkId)
                                                    setJHighlightedLinkId(b.linkId)
                                                    setJRightTab('judgment')
                                                    flashNoteSpan(b.linkId)
                                                    setTimeout(() => setJHighlightedLinkId(null), 2000)
                                                }}
                                            >{idx + 1}</button>
                                        ))}
                                    </div>
                                )}

                                {/* TTS Reader Bar — at bottom of notes editor */}
                                {editor && (
                                    <NotesReaderBar
                                        ref={ttsReaderRef}
                                        snapshot={ttsSnapshot}
                                        onActiveTokenChange={handleActiveTokenChange}
                                        onSeekPmPosition={handleClickPosition}
                                    />
                                )}                            </div>
                        </div>

                        {/* Divider */}
                        <div
                            className="hidden lg:flex w-1 cursor-col-resize hover:bg-primary/30 transition-colors items-center justify-center group z-10 shrink-0"
                            style={{ background: 'hsl(var(--border))' }}
                            onMouseDown={() => { jDraggingRef.current = true }}
                        >
                            <div className="w-0.5 h-8 rounded-full bg-border group-hover:bg-primary/60 transition-colors" />
                        </div>

                        {/* Right panel: Judgment / Quiz / Flashcards */}
                        <div
                           className={cn(
                               "flex-col min-w-0 overflow-hidden flex-1",
                               mobileTagTab === 'pdf' ? "flex w-full" : "hidden lg:flex"
                           )}
                        >
                            {/* Right panel tab bar */}
                            <div className="flex items-center border-b border-border bg-card shrink-0 px-2 py-1 gap-1">
                                {([
                                    { id: 'judgment'   as const, icon: FileText,      label: 'Judgment' },
                                    { id: 'quiz'       as const, icon: MessageSquare, label: 'Quiz' },
                                    { id: 'flashcards' as const, icon: CreditCard,    label: 'Flashcards' },
                                    { id: 'script'     as const, icon: Edit2,         label: 'Script' },
                                ]).map(({ id, icon: Icon, label }) => (
                                    <button
                                        key={id}
                                        onClick={() => setJRightTab(id)}
                                        className={cn(
                                            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
                                            jRightTab === id
                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                        )}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        {label}
                                        {id === 'quiz' && quizContent && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                                        {id === 'flashcards' && flashcards.length > 0 && <span className="text-[10px] opacity-70">{flashcards.length}</span>}
                                        {id === 'script' && scriptContent !== originalScriptContent && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                                    </button>
                                ))}
                            </div>

                            {/* Judgment PDF — mounted always, hidden when not active (preserves scroll) */}
                            <div className={jRightTab === 'judgment' ? "flex flex-col flex-1 min-h-0 overflow-hidden" : "hidden"}>
                                <JudgmentPdfPanel
                                    itemId={itemId!}
                                    links={jLinks}
                                    onLinksChange={setJLinks}
                                    connectMode={jConnectMode}
                                    connectStep={jConnectStep}
                                    connectPdfCapture={jConnectPdfCapture}
                                    onConnectPdfCapture={setJConnectPdfCapture}
                                    highlightedLinkId={jHighlightedLinkId}
                                    onHighlightedLinkIdChange={setJHighlightedLinkId}
                                    connectionViz={jConnectionViz}
                                    onConnectionVizChange={setJConnectionViz}
                                    getNoteLinkSpan={getNoteLinkSpan}
                                    getNoteText={getJNoteText}
                                    onDeleteLink={handleJDeleteLink}
                                    onConnectSave={handleJConnectSave}
                                    savingLink={jSavingLink}
                                    navigateToLinkId={jNavigateToLinkId}
                                    onNavigateComplete={() => setJNavigateToLinkId(null)}
                                    onScrollNotes={scrollNotesToLink}
                                    redrawTick={jRedrawTick}
                                    isPreview={jNoteMode === 'preview'}
                                    onAiNotesGenerated={(formatted, provider) => {
                                        if (!editor) return
                                        const html = customToHtml(formatted)
                                        editor.commands.setContent(html)
                                        toast.success(`✨ Case notes ready! Auto-generating quiz + flashcards…${provider ? ` (via ${provider})` : ''}`)
                                        const notesText = editor.getText()
                                        setTimeout(() => {
                                            handleAiQuiz()
                                            handleAiFlashcards(notesText)
                                        }, 300)
                                    }}
                                />
                            </div>

                            {/* Quiz — shown when quiz tab active */}
                            {jRightTab === 'quiz' && (
                                <div className="flex-1 overflow-y-auto">
                                    {quizContent ? (
                                        <QuizPreview
                                            content={quizContent}
                                            onContentChange={setQuizContent}
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full gap-4">
                                            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                                                <MessageSquare className="w-6 h-6 text-primary/50" />
                                            </div>
                                            <div className="text-center">
                                                <p className="text-sm font-semibold text-foreground">No quiz yet</p>
                                                <p className="text-xs text-muted-foreground mt-1">Generate AI notes first — quiz is built from them.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Flashcards — shown when flashcards tab active */}
                            {jRightTab === 'flashcards' && (
                                <div className="flex-1 overflow-hidden flex flex-col">
                                    {flashcards.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full gap-4">
                                            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                                                <CreditCard className="w-7 h-7 text-primary/50" />
                                            </div>
                                            <div className="text-center">
                                                <p className="text-sm font-semibold text-foreground">No flashcards yet</p>
                                                <p className="text-xs text-muted-foreground mt-1">Generate AI notes first — flashcards are built from them.</p>
                                            </div>
                                            <button
                                                onClick={() => handleAiFlashcards()}
                                                disabled={aiFlashcarding}
                                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-all shadow-sm"
                                            >
                                                <CreditCard className="w-3.5 h-3.5" />
                                                {aiFlashcarding ? 'Generating…' : 'Generate Flashcards'}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col h-full">
                                            {/* Header */}
                                            <div className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-background shrink-0">
                                                <div className="flex items-center gap-2">
                                                    <CreditCard className="w-4 h-4 text-primary" />
                                                    <span className="text-sm font-bold text-foreground">Flashcards</span>
                                                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold tabular-nums">
                                                        {flashcards.length}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {flashcardEditing ? (
                                                        <>
                                                            <button
                                                                onClick={() => setFlashcardEditing(false)}
                                                                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold border border-border hover:bg-muted text-muted-foreground transition-all"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    if (!itemId) return
                                                                    const updated = flashcards.map((c, i) =>
                                                                        i === flashcardIdx
                                                                            ? { front: flashcardEditFront, back: flashcardEditBack }
                                                                            : c
                                                                    )
                                                                    setFlashcardSaving(true)
                                                                    try {
                                                                        await saveFlashcardsJson(itemId, updated)
                                                                        setFlashcards(updated)
                                                                        setFlashcardEditing(false)
                                                                        toast.success('Flashcard saved')
                                                                    } catch {
                                                                        toast.error('Save failed')
                                                                    } finally {
                                                                        setFlashcardSaving(false)
                                                                    }
                                                                }}
                                                                disabled={flashcardSaving}
                                                                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all"
                                                            >
                                                                {flashcardSaving ? 'Saving…' : 'Save'}
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => {
                                                                    setFlashcardEditFront(flashcards[flashcardIdx]?.front ?? '')
                                                                    setFlashcardEditBack(flashcards[flashcardIdx]?.back ?? '')
                                                                    setFlashcardEditing(true)
                                                                    setFlashcardFlipped(false)
                                                                }}
                                                                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                                                            >
                                                                <Edit2 className="w-3 h-3" /> Edit
                                                            </button>
                                                            <button
                                                                onClick={() => handleAiFlashcards()}
                                                                disabled={aiFlashcarding}
                                                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border border-border hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50 transition-all"
                                                            >
                                                                <span className={aiFlashcarding ? 'animate-spin inline-block' : ''}>↻</span>
                                                                {aiFlashcarding ? 'Regenerating…' : 'Regenerate'}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Progress bar */}
                                            <div className="h-1.5 bg-border shrink-0">
                                                <div
                                                    className="h-full bg-primary transition-all duration-300"
                                                    style={{ width: `${((flashcardIdx + 1) / flashcards.length) * 100}%` }}
                                                />
                                            </div>

                                            {/* Card area */}
                                            <div className="flex-1 flex flex-col items-center justify-center px-6 py-6 gap-5 overflow-auto">

                                                {/* Counter + dot nav */}
                                                <div className="flex flex-col items-center gap-2 w-full">
                                                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
                                                        Card {flashcardIdx + 1} of {flashcards.length}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 flex-wrap justify-center">
                                                        {flashcards.map((_, i) => (
                                                            <button
                                                                key={i}
                                                                onClick={() => { setFlashcardIdx(i); setFlashcardFlipped(false); setFlashcardEditing(false) }}
                                                                className={cn(
                                                                    "rounded-full transition-all duration-200",
                                                                    i === flashcardIdx
                                                                        ? "w-6 h-2 bg-primary"
                                                                        : "w-2 h-2 bg-muted-foreground/25 hover:bg-muted-foreground/50"
                                                                )}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>

                                                {flashcardEditing ? (
                                                    /* ── Edit mode ── */
                                                    <div className="w-full flex flex-col gap-4" style={{ maxWidth: '560px' }}>
                                                        <div className="rounded-2xl border border-primary/30 overflow-hidden shadow-xl">
                                                            <div className="h-2 bg-linear-to-r from-primary via-primary/70 to-primary/30 shrink-0" />
                                                            <div className="p-5 bg-background flex flex-col gap-3">
                                                                <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest self-start">
                                                                    Question (Front)
                                                                </span>
                                                                <textarea
                                                                    value={flashcardEditFront}
                                                                    onChange={e => setFlashcardEditFront(e.target.value)}
                                                                    className="w-full resize-none text-base font-semibold text-foreground bg-muted/40 rounded-xl px-4 py-3 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[100px]"
                                                                    placeholder="Front of card (question / cue)…"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="rounded-2xl border border-primary/40 overflow-hidden shadow-xl">
                                                            <div className="h-2 bg-linear-to-r from-primary to-primary/40 shrink-0" />
                                                            <div className="p-5 bg-primary/5 flex flex-col gap-3">
                                                                <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest self-start">
                                                                    Answer (Back)
                                                                </span>
                                                                <textarea
                                                                    value={flashcardEditBack}
                                                                    onChange={e => setFlashcardEditBack(e.target.value)}
                                                                    className="w-full resize-none text-base text-foreground bg-background/60 rounded-xl px-4 py-3 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[120px]"
                                                                    placeholder="Back of card (answer)…"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    /* ── Flip card ── */
                                                    <div
                                                        className="w-full cursor-pointer select-none"
                                                        style={{ perspective: '1200px', maxWidth: '560px' }}
                                                        onClick={() => setFlashcardFlipped(f => !f)}
                                                    >
                                                        <div
                                                            className="relative transition-transform duration-500"
                                                            style={{
                                                                transformStyle: 'preserve-3d',
                                                                transform: flashcardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                                                                minHeight: '340px',
                                                            }}
                                                        >
                                                            {/* Front */}
                                                            <div
                                                                className="absolute inset-0 flex flex-col rounded-2xl overflow-hidden shadow-xl border border-border"
                                                                style={{ backfaceVisibility: 'hidden' }}
                                                            >
                                                                <div className="h-2 bg-linear-to-r from-primary via-primary/70 to-primary/30 shrink-0" />
                                                                <div className="flex-1 flex flex-col items-center justify-center p-10 text-center bg-background gap-5">
                                                                    <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest">
                                                                        Question
                                                                    </span>
                                                                    <p className="text-xl font-bold text-foreground leading-snug">
                                                                        {flashcards[flashcardIdx]?.front}
                                                                    </p>
                                                                    <span className="text-xs text-muted-foreground/50 mt-1">tap to reveal answer ↓</span>
                                                                </div>
                                                            </div>

                                                            {/* Back */}
                                                            <div
                                                                className="absolute inset-0 flex flex-col rounded-2xl overflow-hidden shadow-xl border border-primary/40"
                                                                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                                                            >
                                                                <div className="h-2 bg-linear-to-r from-primary to-primary/40 shrink-0" />
                                                                <div className="flex-1 flex flex-col items-center justify-center p-10 text-center bg-primary/5 gap-5">
                                                                    <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest">
                                                                        Answer
                                                                    </span>
                                                                    <p className="text-lg text-foreground leading-relaxed">
                                                                        {flashcards[flashcardIdx]?.back}
                                                                    </p>
                                                                    <span className="text-xs text-muted-foreground/50 mt-1">tap to flip back ↑</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Nav */}
                                                <div className="flex items-center gap-4">
                                                    <button
                                                        onClick={() => { setFlashcardIdx(i => Math.max(0, i - 1)); setFlashcardFlipped(false); setFlashcardEditing(false) }}
                                                        disabled={flashcardIdx === 0}
                                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm font-semibold text-foreground shadow-sm"
                                                    >
                                                        <ChevronLeft className="w-4 h-4" /> Prev
                                                    </button>
                                                    <button
                                                        onClick={() => { setFlashcardIdx(i => Math.min(flashcards.length - 1, i + 1)); setFlashcardFlipped(false); setFlashcardEditing(false) }}
                                                        disabled={flashcardIdx === flashcards.length - 1}
                                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm font-semibold text-foreground shadow-sm"
                                                    >
                                                        Next <ChevronRight className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {jRightTab === 'script' && (
                                <div className="flex-1 overflow-hidden flex flex-col bg-background">
                                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">Video Script (Admin)</p>
                                            <p className="text-xs text-muted-foreground">Internal script notes only. Not shown on user site.</p>
                                        </div>
                                        <button
                                            onClick={handleSaveScript}
                                            disabled={saveScriptLoading || scriptContent === originalScriptContent}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {saveScriptLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                            {saveScriptLoading ? 'Saving...' : 'Save Script'}
                                        </button>
                                    </div>
                                    <div className="flex-1 p-4 overflow-auto">
                                        <Textarea
                                            value={scriptContent}
                                            onChange={(e) => setScriptContent(e.target.value)}
                                            placeholder="Write admin-only video script here..."
                                            className="h-full min-h-[320px] resize-none text-sm leading-6"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* SVG connection curve overlay */}
                        {jConnectionViz && (() => {
                            const { fromX, fromY, toX, toY, color: lineColor, label: lineLabel } = jConnectionViz
                            const dx = (toX - fromX) * 0.4
                            const path = `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`
                            // Midpoint of cubic bezier at t=0.5
                            const midX = (fromX + toX) / 2
                            const midY = (fromY + toY) / 2
                            const labelText = lineLabel?.toUpperCase() ?? ''
                            // Approximate pill width: ~6.5px per char + 14px padding
                            const pillW = labelText.length * 6.5 + 14
                            const pillH = 16
                            return (
                                <svg style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 40, opacity: jVizFading ? 0 : 1, transition: 'opacity 0.5s ease' }} aria-hidden>
                                    <defs>
                                        <marker id="j-conn-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                                            <path d="M0,0.5 L5,3 L0,5.5" fill="none" stroke={lineColor} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                        </marker>
                                    </defs>
                                    <path d={path} fill="none" stroke={lineColor} strokeWidth="1.5" strokeDasharray="6 4" strokeLinecap="round" markerEnd="url(#j-conn-arrow)" />
                                    {labelText && (
                                        <g>
                                            {/* Pill background */}
                                            <rect
                                                x={midX - pillW / 2}
                                                y={midY - pillH - 4}
                                                width={pillW}
                                                height={pillH}
                                                rx={4}
                                                fill={lineColor}
                                                opacity={0.92}
                                            />
                                            {/* White outline text (background) */}
                                            <text
                                                x={midX}
                                                y={midY - 4 - pillH / 2}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                fontSize="9"
                                                fontWeight="700"
                                                fill="white"
                                                fontFamily="system-ui, -apple-system, sans-serif"
                                                letterSpacing="0.6"
                                            >
                                                {labelText}
                                            </text>
                                        </g>
                                    )}
                                </svg>
                            )
                        })()}
                    </div>
                ) : (
                <div className="flex-1 overflow-hidden flex flex-col relative bg-muted/30">
                    {loading && (
                        <div className="absolute inset-0 bg-card/50 backdrop-blur-sm z-50 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    )}

                    {/* Notes Top Toolbar (visible in notes-only mode) */}
                    <div className="sticky top-0 z-50 px-4 py-3 border-b bg-card transition-all duration-300">
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium max-w-[300px] truncate px-2">
                                    Notes
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-px bg-muted/60 p-0.5 rounded-md border border-border">
                                    <button onClick={() => setJNoteZoom(p => Math.max(0.5, p - 0.1))} className="w-6 h-6 flex items-center justify-center text-xs hover:bg-background rounded-sm text-muted-foreground hover:text-foreground" title="Zoom Out">-</button>
                                    <button onClick={() => setJNoteZoom(1.0)} className="px-2 h-6 flex items-center justify-center text-[10px] hover:bg-background rounded-sm font-mono text-muted-foreground hover:text-foreground" title="Reset Zoom">{Math.round(jNoteZoom * 100)}%</button>
                                    <button onClick={() => setJNoteZoom(p => Math.min(3.0, p + 0.1))} className="w-6 h-6 flex items-center justify-center text-xs hover:bg-background rounded-sm text-muted-foreground hover:text-foreground" title="Zoom In">+</button>
                                </div>

                                <div className="flex gap-px p-0.5 rounded-md bg-muted shrink-0">
                                    <button
                                        onClick={() => switchJNoteMode('edit')}
                                        className={cn(
                                            "px-2 py-0.5 rounded text-xs font-medium transition-all",
                                            jNoteMode === 'edit' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >Edit</button>
                                    <button
                                        onClick={() => switchJNoteMode('preview')}
                                        className={cn(
                                            "px-2 py-0.5 rounded text-xs font-medium transition-all",
                                            jNoteMode === 'preview' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >Preview</button>
                                </div>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="rounded-full h-8 px-3 text-xs transition-all duration-300"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setPreviewFullscreen(!previewFullscreen)}
                                    className="rounded-full h-8 px-3 text-xs transition-all duration-300"
                                >
                                    {previewFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                                </Button>
                            </div>
                        </div>
                    </div>
                    
                    {/* Fixed Toolbar */}
                    {editor && (
                        <div 
                            className={cn(
                                "flex items-center gap-1 p-2 border-b border-border bg-card shadow-sm z-10 flex-wrap sticky top-0",
                                isExpanded ? "justify-center" : ""
                            )}
                        >
                            {/* Toolbar Inner Container */}
                             <div className="flex items-center gap-1 flex-wrap"> 
                                {/* Text Styling */}
                                <div className="flex items-center border-r border-border pr-2 mr-2 gap-1">
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => editor.chain().focus().toggleBold().run()}
                                        className={cn("h-8 w-8 p-0", editor.isActive('bold') && "bg-muted/80 text-blue-600")}
                                        title="Bold"
                                    >
                                        <Bold className="w-4 h-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => editor.chain().focus().toggleItalic().run()}
                                        className={cn("h-8 w-8 p-0", editor.isActive('italic') && "bg-muted/80 text-blue-600")}
                                        title="Italic"
                                    >
                                        <Italic className="w-4 h-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                                        className={cn("h-8 w-8 p-0", editor.isActive('underline') && "bg-muted/80 text-blue-600")}
                                        title="Underline"
                                    >
                                        <UnderlineIcon className="w-4 h-4" />
                                    </Button>
                                    {/* List Buttons */}
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                                        className={cn("h-8 w-8 p-0", editor.isActive('bulletList') && "bg-muted/80 text-blue-600")}
                                        title="Bullet List"
                                    >
                                        <List className="w-4 h-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                                        className={cn("h-8 w-8 p-0", editor.isActive('orderedList') && "bg-muted/80 text-blue-600")}
                                        title="Ordered List"
                                    >
                                        <ListOrdered className="w-4 h-4" />
                                    </Button>
                                </div>

                                {/* Font Size */}
                                <div className="flex items-center border-r border-border pr-2 mr-2 gap-1">
                                    <Select
                                        value={editor.getAttributes('textStyle')?.fontSize || ''}
                                        onValueChange={(value) => {
                                            if (value && editor.getAttributes('textStyle')?.fontSize !== value) {
                                                editor.chain().focus().setFontSize(value).run()
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="h-8 w-[100px] text-xs">
                                            <SelectValue placeholder="Default" />
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

                                {/* Line Height */}
                                <div className="flex items-center border-r border-border pr-2 mr-2 gap-1">
                                    <Select
                                        value={editor.getAttributes('paragraph')?.lineHeight || 'default'}
                                        onValueChange={(value) => {
                                            const current = editor.getAttributes('paragraph')?.lineHeight || 'default'
                                            if (value !== current) {
                                                setAllLineHeights(value === 'default' ? null : value)
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="h-8 w-[90px] text-xs">
                                            <SelectValue placeholder="Line Ht" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="default">Default</SelectItem>
                                            <SelectItem value="1.2">1.2× Tight</SelectItem>
                                            <SelectItem value="1.4">1.4× Snug</SelectItem>
                                            <SelectItem value="1.6">1.6× Normal</SelectItem>
                                            <SelectItem value="1.8">1.8× Relaxed</SelectItem>
                                            <SelectItem value="2">2.0× Airy</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Highlighting */}
                                <div className="flex items-center border-r border-border pr-2 mr-2 gap-1">
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
                                                {[
                                                    { color: '#D4A96A', title: 'Gold — Key Terms' },
                                                    { color: '#7EC8B8', title: 'Teal — Doctrines' },
                                                    { color: '#F0A0A0', title: 'Rose — Principles' },
                                                    { color: '#9EC4D8', title: 'Sky — Case Refs' },
                                                    { color: '#C4A8E0', title: 'Lavender — Notes' },
                                                ].map(({ color, title }) => (
                                                    <button
                                                        key={color}
                                                        onClick={() => editor.chain().focus().toggleHighlight({ color }).run()}
                                                        className="w-6 h-6 rounded-full border border-border shadow-sm hover:scale-110 transition-transform"
                                                        style={{ backgroundColor: color }}
                                                        title={title}
                                                    />
                                                ))}
                                                <button
                                                    onClick={() => editor.chain().focus().unsetHighlight().run()}
                                                    className="w-6 h-6 rounded-full border border-border flex items-center justify-center bg-card text-muted-foreground/70"
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
                                    {/* Import AI Dialog - Icon Only */}
                                    <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                                        <DialogTrigger asChild>
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-8 w-8 p-0 text-indigo-600 hover:bg-indigo-50"
                                                title="Import AI Markup"
                                            >
                                                <Braces className="w-4 h-4" />
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
                                            <DialogHeader>
                                                <DialogTitle>Import AI Generated Content</DialogTitle>
                                                <DialogDescription>
                                                    Paste the raw content (with [box], [h1] tags) from ChatGPT/Gemini here.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <Textarea 
                                                value={importText}
                                                onChange={(e) => setImportText(e.target.value)}
                                                className="flex-1 font-mono text-xs p-4"
                                                placeholder="[h1]Title[/h1] ..."
                                            />
                                            <DialogFooter>
                                                <Button onClick={handleImportContent}>Import & Convert</Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => editor.chain().focus().setHorizontalRule().run()}
                                        className="h-8 w-8 p-0"
                                        title="Insert Horizontal Line"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                        </div>
                    )}

                    {/* Editor Content Scroll Area */}
                    <div className={cn(
                            "flex-1 overflow-y-auto p-8 pb-20 relative flex flex-col items-center notes-editor-scroll",
                            isExpanded ? "bg-muted/80" : "bg-muted/50"
                        )}>
                                {/* ── Highlight tick bubble — appears on selection when a color is active ── */}
                                {editor && selectedHighlightColor && (
                                    <BubbleMenu
                                        editor={editor}
                                        options={{ placement: 'top' }}
                                        shouldShow={({ editor }) => !editor.state.selection.empty}
                                        className=""
                                    >
                                        <div className="flex items-center gap-1 rounded-full shadow-lg border border-white/20 px-2 py-1" style={{ backgroundColor: selectedHighlightColor }}>
                                            <button
                                                onClick={() => editor.chain().focus().toggleHighlight({ color: selectedHighlightColor }).run()}
                                                className="flex items-center justify-center w-5 h-5 rounded-full bg-white/30 hover:bg-white/50 transition-colors"
                                                title="Apply highlight"
                                            >
                                                <Check className="w-3 h-3 text-slate-800" strokeWidth={3} />
                                            </button>
                                            <button
                                                onClick={() => setSelectedHighlightColor(null)}
                                                className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-white/30 transition-colors"
                                                title="Cancel highlight mode"
                                            >
                                                <X className="w-2.5 h-2.5 text-slate-700" strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </BubbleMenu>
                                )}

                                {editor && (
                            <BubbleMenu editor={editor} className="flex flex-col gap-1 items-center" options={{ placement: 'bottom' }}>
                                {/* Hide BubbleMenu toolbar if already in header */}
                                {!isExpanded && renderEditorToolbar()}

                            </BubbleMenu>
                        )}
                        
                        <div 
                            className={cn(
                                // WRAPPER: Transparent, just layout positioning. No borders/backgrounds here.
                                "transition-all duration-300 h-fit shrink-0 w-full flex justify-center relative",
                                isExpanded ? "min-h-[900px] my-8" : "min-h-[600px]"
                            )}
                        >
                                <div className="relative mx-auto w-full max-w-3xl bg-card shadow-md rounded-sm border border-border/40 min-h-[600px]">
                                    <EditorContent editor={editor} />
                                </div>
                        </div>
                    </div>
                </div>
                )}
            </TabsContent>

            <TabsContent value="quiz" className="flex-1 overflow-hidden m-0 p-0 flex relative" id="quiz-split-container">
                {/* Quiz Editor (Left) */}
                <div 
                    className={cn(
                        "border-r bg-muted flex flex-col shrink-0"
                    )}
                    style={{ width: `${quizSplit}%` }}
                >
                    <div className="px-4 py-3 border-b bg-card flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Quiz Editor</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleAiQuiz}
                                disabled={aiQuizzing}
                                className="flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-semibold transition-all bg-linear-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 shadow-sm disabled:opacity-50"
                                title="AI Quiz — generate 10 MCQs from current notes"
                            >
                                {aiQuizzing
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <span>🧠</span>
                                }
                                {aiQuizzing ? 'Generating…' : 'AI Quiz'}
                            </button>
                            <span className="text-xs text-muted-foreground/50">Plain Text</span>
                        </div>
                    </div>
                    <textarea 
                        className="flex-1 w-full p-6 bg-muted font-mono text-sm resize-none focus:outline-none focus:bg-card transition-colors text-foreground"
                        value={quizContent}
                        onChange={(e) => setQuizContent(e.target.value)}
                        placeholder={`Title_display: My Quiz\nPassage: ...\n\nQ1. ...`}
                        spellCheck={false}
                    />
                </div>
                
                {/* Drag Handle */}
                <div 
                    className={cn(
                        "w-3 h-full cursor-col-resize z-50 flex items-center justify-center group absolute top-0",
                        isDragging ? "bg-blue-400" : "bg-transparent hover:bg-blue-100"
                    )}
                    style={{ left: `calc(${quizSplit}% - 6px)` }}
                    onMouseDown={() => setIsDragging(true)}
                >
                    <div className={cn(
                        "w-1 h-12 rounded-full transition-colors",
                        isDragging ? "bg-blue-600" : "bg-muted group-hover:bg-blue-400"
                    )} />
                </div>
                
                {/* Quiz Preview (Right) */}
                <div className={cn(
                    "flex flex-col bg-card flex-1 overflow-hidden"
                )}>
                     <div className="px-4 py-3 border-b bg-card text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center justify-between">
                        <span>Live Preview</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleToggleExpand}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                title={isExpanded ? "Collapse View" : "Expand View"}
                            >
                                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                            </Button>
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
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/70 p-8 text-center">
                                <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
                                <p>Start typing your quiz on the left to see the preview here.</p>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Fullscreen Preview Modal */}
                {previewFullscreen && (
                    <FullscreenQuizView 
                        content={quizContent}
                        title={title}
                        onClose={() => setPreviewFullscreen(false)}
                    />
                )}
            </TabsContent>
        </Tabs>

        {/* AI Format Instructions Modal */}
        {isAiFormatOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setIsAiFormatOpen(false)}>
                <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-[480px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">✨</span>
                        <h2 className="font-bold text-base">AI Format Notes</h2>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                        The AI will read your notes and apply highlights, note boxes, bold, and structure automatically.
                        Add custom instructions below to guide the formatting.
                    </p>
                    <div className="mb-4">
                        <label className="text-xs font-semibold block mb-1.5 text-foreground">
                            Custom Instructions <span className="font-normal text-muted-foreground">(optional)</span>
                        </label>
                        <Textarea
                            autoFocus
                            value={aiInstructions}
                            onChange={e => setAiInstructions(e.target.value)}
                            placeholder={`Examples:\n• Highlight all article numbers in blue\n• Put every case name in a violet box\n• Bold all definitions\n• Orange highlight all exceptions`}
                            className="min-h-[120px] text-sm resize-none"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { handleAiFormat(aiInstructions); setAiInstructions('') }}
                            disabled={aiFormatting}
                            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold text-white bg-linear-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 transition-all shadow disabled:opacity-50"
                        >
                            {aiFormatting ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>✨</span>}
                            Format My Notes
                        </button>
                        <button
                            onClick={() => setIsAiFormatOpen(false)}
                            className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )}

      {/* ── Mobile Bottom Sheet (Option A pattern) ── */}
      {mobileSheetLink && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-100 transition-opacity animate-in fade-in"
            onClick={() => setMobileSheetLink(null)} 
          />
          <div className="fixed bottom-0 left-0 right-0 bg-card rounded-t-2xl shadow-xl z-101 transform transition-transform animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col">
            <div className="w-10 h-1 bg-border rounded-full mx-auto mt-3 mb-2" />
            <div className="px-5 pb-3 border-b border-border flex justify-between items-center shrink-0">
               <span 
                 className="text-[0.6rem] tracking-wider rounded border px-2 py-1 font-mono uppercase"
                 style={{ 
                    color: parseLinkMeta(mobileSheetLink.label).color,
                    backgroundColor: `${parseLinkMeta(mobileSheetLink.label).color}15`,
                    borderColor: `${parseLinkMeta(mobileSheetLink.label).color}30`
                 }}
               >
                 JUDGMENT · {parseLinkMeta(mobileSheetLink.label).text || mobileSheetLink.link_id}
               </span>
               <button onClick={() => setMobileSheetLink(null)} className="p-1 rounded-full hover:bg-muted text-muted-foreground">
                 <X className="w-4 h-4" />
               </button>
            </div>
            {mobileSheetLoading ? (
              <div className="p-12 flex flex-col justify-center items-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-mono">Extracting text...</span>
              </div>
            ) : (
              <div className="px-5 py-4 overflow-y-auto notes-editor-scroll text-[0.82rem] leading-relaxed text-foreground">
                <div className="font-mono text-[0.62rem] text-amber-600 dark:text-amber-500 mb-2 tracking-wide uppercase">
                  Page {mobileSheetLink.pdf_page}
                </div>
                {mobileSheetText}
              </div>
            )}
            <div className="px-5 py-4 border-t border-border shrink-0">
               <Button variant="outline" className="w-full text-xs h-9 font-medium" onClick={() => setMobileSheetLink(null)}>Close</Button>
            </div>
          </div>
        </>
      )}

    </div>
  )
}
