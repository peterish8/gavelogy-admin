# Notes Styling Reference (Light + Dark Mode)

> **Purpose**: Canonical reference for note rendering CSS. If styles ever break, copy these values back.  
> **Last Updated**: 2026-02-20  
> **Applies to**: Admin site (`globals.css`) AND user-facing site

## Note Box Base

```css
.note-box {
  padding: 1rem;
  border-radius: 0.5rem;
  margin: 1rem 0;
  border: 2px solid;
  color: #1e293b;
}
```

## Light Theme Colors

| Class | Background | Border | Text |
|---|---|---|---|
| `.note-blue` | `rgba(59, 130, 246, 0.1)` | `#3B82F6` | `#1e293b` |
| `.note-green` | `rgba(34, 197, 94, 0.1)` | `#22C55E` | `#1e293b` |
| `.note-red` | `rgba(239, 68, 68, 0.1)` | `#EF4444` | `#1e293b` |
| `.note-amber` | `rgba(245, 158, 11, 0.1)` | `#F59E0B` | `#1e293b` |
| `.note-purple` | `rgba(168, 85, 247, 0.1)` | `#A855F7` | `#1e293b` |
| `.note-violet` | `rgba(124, 58, 237, 0.1)` | `#7C3AED` | `#1e293b` |
| `.note-cyan` | `rgba(6, 182, 212, 0.1)` | `#06B6D4` | `#1e293b` |
| `.note-pink` | `rgba(236, 72, 153, 0.1)` | `#EC4899` | `#1e293b` |
| `.note-yellow` | `rgba(245, 158, 11, 0.1)` | `#F59E0B` | `#1e293b` |
| `.note-slate` | `rgba(30, 41, 59, 0.95)` | `#334155` | `#f1f5f9` |
| `.note-dark` | `rgba(15, 23, 42, 0.95)` | `#1e293b` | `#f8fafc` |
| `.note-black` | `rgba(0, 0, 0, 0.9)` | `#374151` | `#ffffff` |

## Dark Theme Colors (`.dark` prefix)

| Class | Background | Border | Text |
|---|---|---|---|
| `.dark .note-blue` | `rgba(59, 130, 246, 0.15)` | `#3B82F6` | `#FFFFFF` |
| `.dark .note-green` | `rgba(34, 197, 94, 0.15)` | `#22C55E` | `#FFFFFF` |
| `.dark .note-red` | `rgba(239, 68, 68, 0.15)` | `#EF4444` | `#FFFFFF` |
| `.dark .note-amber` | `rgba(245, 158, 11, 0.15)` | `#F59E0B` | `#FFFFFF` |
| `.dark .note-purple` | `rgba(168, 85, 247, 0.15)` | `#A855F7` | `#FFFFFF` |
| `.dark .note-violet` | `rgba(124, 58, 237, 0.15)` | `#7C3AED` | `#FFFFFF` |
| `.dark .note-cyan` | `rgba(6, 182, 212, 0.15)` | `#06B6D4` | `#FFFFFF` |
| `.dark .note-pink` | `rgba(236, 72, 153, 0.15)` | `#EC4899` | `#FFFFFF` |
| `.dark .note-yellow` | `rgba(245, 158, 11, 0.15)` | `#F59E0B` | `#FFFFFF` |
| `.dark .note-slate` | `rgba(51, 65, 85, 0.4)` | `#475569` | `#FFFFFF` |
| `.dark .note-dark` | `rgba(40, 40, 40, 0.6)` | `#333333` | `#FFFFFF` |
| `.dark .note-black` | `rgba(24, 24, 24, 0.8)` | `#333333` | `#FFFFFF` |

## Bold Text Rules

| Context | `<strong>` / `<b>` Color |
|---|---|
| Light mode inside note boxes | `#1e293b` (dark slate) |
| Dark mode inside note boxes | `#FFFFFF` (white) |
| Dark mode outside note boxes | `#FFFFFF` (white) |
| Force-light toggle inside note boxes | `#1e293b` (dark slate) |

## Highlighted Text (`<mark>`) Rules

| Context | Text Color | Background |
|---|---|---|
| Light mode | `#000000` | Keeps inline color from editor (yellow/green/blue/pink/orange) |
| Dark mode | `#000000` | Keeps inline color from editor |

> **Key**: Never force a `background-color` on `mark` tags — Tiptap sets them via inline styles per highlight color.

## Horizontal Rules

```css
/* Light */
hr { background: linear-gradient(90deg, #e2e8f0, #94a3b8, #e2e8f0); height: 3px; }
/* Dark */
.dark hr { background: linear-gradient(90deg, #2A2A2A, #555555, #2A2A2A); }
```

## Admin Theme Variables (Spotify Dark)

```
Light: --background: #F8FAFC | --card: #FFFFFF | --foreground: #0F172A | --border: #E2E8F0
Dark:  --background: #121212 | --card: #181818 | --foreground: #FFFFFF | --border: #2A2A2A
```

## User-Site Ready CSS

The complete standalone CSS block for the user site is in the conversation history above this artifact. Search for "GAVELOGY NOTES RENDERING" to find it.
