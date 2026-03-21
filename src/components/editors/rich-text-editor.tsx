'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { paginateA4 } from '@/lib/paginate-a4'
import { LineHeight } from '@/lib/line-height-extension'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'

import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Heading1,
  Heading2,
  Highlighter,
  AlignJustify,
  Undo,
  Redo,
  Table as TableIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// --- A4 Overlays Component ---
const A4Overlays = ({ editor, tick }: { editor: Editor | null, tick: number }) => {
    if (!editor || !editor.view.dom) return null;
    
    const pmEl = editor.view.dom as HTMLElement;
    const height = pmEl.offsetHeight;
    
    // The mask repeats every 1147px (1123 visible + 24 gap)
    const REPEAT_HEIGHT = 1147;
    const PAGE_HEIGHT = 1123;
    const HEADER_H = 60;
    const FOOTER_H = 60;
    
    // Calculate number of pages
    const pages = Math.max(1, Math.ceil(height / REPEAT_HEIGHT));

    return (
        <div
            className="absolute pointer-events-none z-20 overflow-hidden"
            style={{
                top: 0,
                left: 0,
                right: 0,
                height: height
            }}
        >
            {Array.from({ length: pages }).map((_, i) => (
                <div key={i} className="absolute w-full" style={{ top: i * REPEAT_HEIGHT, height: PAGE_HEIGHT }}>
                    {/* Header: blocks clicks so editor is not focusable here */}
                    <div
                        className="absolute top-0 left-0 w-full flex items-center justify-between px-[72px] bg-card"
                        style={{ height: HEADER_H, pointerEvents: 'auto', userSelect: 'none', cursor: 'default' }}
                        onMouseDown={e => e.preventDefault()}
                    >
                        <div className="flex items-center gap-2 opacity-40 grayscale">
                            <img src="/favicon.png" alt="Gavelogy Logo" className="w-5 h-5 object-contain" />
                            <span className="font-bold tracking-widest text-[#0F172A] text-xs">GAVELOGY</span>
                        </div>
                    </div>

                    {/* Footer: blocks clicks so editor is not focusable here */}
                    <div
                        className="absolute bottom-0 left-0 w-full flex items-center justify-between px-[72px] bg-card"
                        style={{ height: FOOTER_H, pointerEvents: 'auto', userSelect: 'none', cursor: 'default' }}
                        onMouseDown={e => e.preventDefault()}
                    >
                        <span className="font-bold tracking-widest text-[#0F172A] text-xs opacity-40">GAVELOGY</span>
                        <span className="text-[#0F172A] text-xs font-semibold opacity-50 text-right">Page {i + 1}</span>
                    </div>
                </div>
            ))}
        </div>
    );
};

const highlightColors = [
  { label: 'Gold (Key Terms)',     value: '#D4A96A', class: 'bg-[#D4A96A]' },
  { label: 'Teal (Doctrines)',     value: '#7EC8B8', class: 'bg-[#7EC8B8]' },
  { label: 'Rose (Principles)',    value: '#F0A0A0', class: 'bg-[#F0A0A0]' },
  { label: 'Sky (Case Refs)',      value: '#9EC4D8', class: 'bg-[#9EC4D8]' },
  { label: 'Lavender (Notes)',     value: '#C4A8E0', class: 'bg-[#C4A8E0]' },
]

const Toolbar = ({ editor }: { editor: Editor | null }) => {
  if (!editor) return null

  return (
    <div className="border-b border-border p-2 flex flex-wrap gap-1 items-center bg-muted/30">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={cn(editor.isActive('bold') && 'bg-muted')}
        title="Bold"
      >
        <Bold className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={cn(editor.isActive('italic') && 'bg-muted')}
        title="Italic"
      >
        <Italic className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={cn(editor.isActive('underline') && 'bg-muted')}
        title="Underline"
      >
        <UnderlineIcon className="w-4 h-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={cn(editor.isActive('heading', { level: 1 }) && 'bg-muted')}
        title="Heading 1"
      >
        <Heading1 className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={cn(editor.isActive('heading', { level: 2 }) && 'bg-muted')}
        title="Heading 2"
      >
        <Heading2 className="w-4 h-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={cn(editor.isActive('bulletList') && 'bg-muted')}
        title="Bullet List"
      >
        <List className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={cn(editor.isActive('orderedList') && 'bg-muted')}
        title="Ordered List"
      >
        <ListOrdered className="w-4 h-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={cn(editor.isActive({ textAlign: 'left' }) && 'bg-muted')}
        title="Align Left"
      >
        <AlignLeft className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={cn(editor.isActive({ textAlign: 'center' }) && 'bg-muted')}
        title="Align Center"
      >
        <AlignCenter className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        className={cn(editor.isActive({ textAlign: 'right' }) && 'bg-muted')}
        title="Align Right"
      >
        <AlignRight className="w-4 h-4" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" title="Line Height">
            <AlignJustify className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {[
            { label: '1.0×', value: '1' },
            { label: '1.2×', value: '1.2' },
            { label: '1.5×', value: '1.5' },
            { label: '1.75×', value: '1.75' },
            { label: '2.0×', value: '2' },
            { label: '2.5×', value: '2.5' },
          ].map(({ label, value }) => (
            <DropdownMenuItem
              key={value}
              onClick={() => editor.chain().focus().updateAttributes('paragraph', { lineHeight: value }).run()}
              className="cursor-pointer"
            >
              {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onClick={() => editor.chain().focus().updateAttributes('paragraph', { lineHeight: null }).run()}
            className="text-muted-foreground cursor-pointer"
          >
            Reset
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="w-px h-6 bg-border mx-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(editor.isActive('highlight') && 'bg-muted')}
            title="Highlight"
          >
            <Highlighter className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {highlightColors.map((color) => (
            <DropdownMenuItem
              key={color.value}
              onClick={() => editor.chain().focus().toggleHighlight({ color: color.value }).run()}
              className="flex items-center gap-2 cursor-pointer"
            >
              <div className={`w-4 h-4 rounded-full border border-border ${color.class}`} style={{ backgroundColor: color.value }} />
              <span>{color.label}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onClick={() => editor.chain().focus().unsetHighlight().run()}
            className="text-error cursor-pointer"
          >
            Remove Highlight
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="w-px h-6 bg-border mx-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="Insert Table"
      >
        <TableIcon className="w-4 h-4" />
      </Button>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      >
        <Undo className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      >
        <Redo className="w-4 h-4" />
      </Button>
    </div>
  )
}

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  editable?: boolean
}

export default function RichTextEditor({ content, onChange, editable = true }: RichTextEditorProps) {
  const paginateTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [tick, setTick] = useState(0)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      LineHeight,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    editable,
    onTransaction: () => {
      setTick(prev => prev + 1)
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none pt-[64px] pb-[64px] px-4 max-w-none dark:prose-invert a4-page a4-page-lines a4-page-margins',
      },
    },
  })

  // A4 Pagination: Only triggers on content updates
  useEffect(() => {
    if (!editor) return

    const runPaginate = () => {
      if (paginateTimerRef.current) clearTimeout(paginateTimerRef.current)
      paginateTimerRef.current = setTimeout(() => {
        paginateA4(editor.view.dom as HTMLElement)
      }, 300)
    }

    runPaginate()
    editor.on('update', runPaginate)

    return () => {
      editor.off('update', runPaginate)
      if (paginateTimerRef.current) clearTimeout(paginateTimerRef.current)
    }
  }, [editor])

  return (
    <div className="border border-border rounded-md overflow-hidden bg-background">
      {editable && <Toolbar editor={editor} />}
      <div className="overflow-y-auto a4-scroll-container flex justify-center py-6 relative">
        <div className="relative mx-auto" style={{ width: '794px' }}>
            <EditorContent editor={editor} />
            <A4Overlays editor={editor} tick={tick} />
        </div>
      </div>
    </div>
  )
}

