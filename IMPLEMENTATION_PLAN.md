# Gavelogy Admin Implementation Plan

## Phase 2: Notes Management System

### 2.1 Rich Text Editor (Tiptap)
**Goal**: Create a reusable `RichTextEditor` component that supports the specific formatting needs of Gavelogy (highlights, colors, headings).

**Technical Details**:
- **Library**: `@tiptap/react`, `@tiptap/starter-kit`
- **Extensions**:
  - `Highlight` (for custom background colors: yellow, green, blue, pink, orange)
  - `TextStyle` & `Color` (for text colors)
  - `Underline`
  - `TextAlign`
- **Component Structure**:
  - `src/components/editors/rich-text-editor.tsx`: Main wrapper.
  - `src/components/editors/toolbar.tsx`: Toolbar with buttons for formatting.
- **Custom Styling**: Map Tiptap classes to Tailwind CSS classes in `globals.css` or component styles to match the frontend rendering.

### 2.2 Notes Pages
- **List Page (`/admin/notes/page.tsx`)**:
  - Use `DataTable` component (shadcn/ui compatible) for listing notes.
  - Columns: Case Number, Preview (truncated content), Actions (Edit/Delete).
  - Server Component for fetching initial data.
- **Editor Page (`/admin/notes/[id]/edit/page.tsx` & `/new`)**:
  - Client Component for form handling.
  - Form State: `case_number` (string), `content` (HTML string from editor).
  - Validation: Ensure Case Number format (CS-YY-XX).

## Phase 3: Quiz Management System

### 3.1 Quiz Metadata
- **Database**: `quizzes` table.
- **Pages**:
  - List: Group by Subject.
  - Create/Edit: Simple form for Title, Description, Subject ID.

### 3.2 Question Management
- **Database**: `questions` table (linked to `quizzes`).
- **UI Workflow**:
  - On the **Quiz Edit Page**, display a list of existing questions.
  - "Add Question" button opens a **Dialog/Modal** or redirects to a sub-page.
  - **Question Form**:
    - Textarea for Question Text.
    - 4 Inputs for Options (A, B, C, D).
    - Select for Correct Answer.
    - Textarea for Explanation.
  - **Reordering**: Simple "Move Up/Down" buttons or Drag-and-Drop (using `dnd-kit` if requested, otherwise simple index swapping).

## Phase 4: Contemporary Case Quizzes
- **Database**: `contemporary_case_quizzes` table.
- **Difference**: These are standalone quizzes linked to a Case Number, not a Subject Quiz.
- **UI**: Similar to Question Management but includes fields for `case_number` and `passage`.

## Shared Components
- **UI Library**: We will use `shadcn/ui` components for consistency.
  - `Button`, `Input`, `Select`, `Textarea`, `Dialog`, `Toast`, `Card`.
- **Supabase Hooks**: Custom hooks for fetching data to keep components clean.

## Next Steps Execution Order
1. **Setup Tiptap Editor**: This is the core of the Notes system.
2. **Implement Notes Pages**: List -> Create -> Edit.
3. **Implement Quiz Pages**: List -> Create -> Edit (Metadata).
4. **Implement Question Management**: The complex part of Quizzes.
