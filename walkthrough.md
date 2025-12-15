# Gavelogy Admin Panel - Walkthrough

## Overview
The Gavelogy Admin Panel is a comprehensive management system built with Next.js 15, Supabase, and Tailwind CSS. It allows administrators to manage contemporary case notes, subject quizzes, and case-specific quizzes.

## Key Features

### 1. Authentication
- Secure login page using Supabase Auth.
- Protected routes ensuring only authenticated users can access admin pages.

### 2. Dashboard
- Overview of key metrics (Total Notes, Quizzes, Users).
- Quick actions for creating new content.

### 3. Notes Management (`/admin/notes`)
- **Rich Text Editor**: Powered by Tiptap, supporting:
  - Custom Highlighting (Yellow, Green, Blue, Pink, Orange).
  - Text formatting (Bold, Italic, Underline).
  - Headings and Lists.
- **List View**: Searchable list of all case notes.
- **Create/Edit**: Full CRUD operations for case notes.

### 4. Quiz Management (`/admin/quizzes`)
- **Subject Quizzes**: Create quizzes linked to specific law subjects.
- **Question Bank**:
  - Add multiple-choice questions.
  - Specify correct answers and explanations.
  - Reorder questions.
- **Search & Filter**: Filter quizzes by subject or search by title.

### 5. Contemporary Case Quizzes (`/admin/case-quizzes`)
- **Case-Specific**: Manage quizzes linked directly to case numbers.
- **Passage Support**: Add reading passages for questions.
- **Grouped View**: Questions are grouped by Case Number for easy management.

## Technical Stack
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **State Management**: React Hooks + Server Actions
- **Icons**: Lucide React

## Verification
- All pages have been implemented and linked.
- Database types are synchronized with the Supabase schema.
- UI components use the Gavelogy color palette.
- Responsive design is implemented for mobile and desktop.
