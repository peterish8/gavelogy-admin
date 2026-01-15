# 🌍 STUDENT WEBSITE - COURSE WORLD UI PROMPT

Copy and paste this entire prompt to the Student Website AI to build the matching frontend that syncs with the Admin Course Builder.

---

## 📋 CONTEXT

The Admin website has a **Course Studio** that allows admins to:
- Create and manage Courses (which represent "Worlds")
- Add Subjects/Modules within courses (which represent "Regions" on the world)
- Add Content Items within modules (Notes, Quizzes, Interactive Questions)

**Your job is to build the Student-facing UI** that reads from the same database and displays content in an engaging, interactive "World" format.

---

## 🗄️ DATABASE SCHEMA (Already Created)

Both admin and student apps share the same Supabase database. The following tables exist:

### `courses` table
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL
description TEXT
icon TEXT (emoji like 📚, 🌍, ⚖️)
order_index INTEGER
is_active BOOLEAN
price INTEGER
version INTEGER
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### `subjects` table (Modules)
```sql
id UUID PRIMARY KEY
course_id UUID REFERENCES courses(id)
name TEXT NOT NULL
description TEXT
icon TEXT (emoji)
order_index INTEGER
is_active BOOLEAN
version INTEGER
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### `content_items` table
```sql
id UUID PRIMARY KEY
subject_id UUID REFERENCES subjects(id)
content_type TEXT ('note', 'quiz', 'interactive', 'case_note')
title TEXT NOT NULL
order_index INTEGER
is_active BOOLEAN
note_content JSONB (for notes: { html: "...", sections: [...] })
quiz_id UUID REFERENCES quizzes(id)
case_number TEXT (links to contemprory_case_notes)
interactive_data JSONB (for interactive questions)
version INTEGER
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### `interactive_questions` table
```sql
id UUID PRIMARY KEY
content_item_id UUID REFERENCES content_items(id)
question_text TEXT NOT NULL
question_type TEXT ('true_false', 'yes_no', 'poll')
options JSONB (for polls)
correct_answer TEXT
order_index INTEGER
created_at TIMESTAMPTZ
```

### `interactive_responses` table (student answers)
```sql
id UUID PRIMARY KEY
question_id UUID REFERENCES interactive_questions(id)
user_id UUID REFERENCES users(id)
answer TEXT
created_at TIMESTAMPTZ
UNIQUE(question_id, user_id)
```

### `interactive_question_aggregates` table (cached percentages)
```sql
id UUID PRIMARY KEY
question_id UUID REFERENCES interactive_questions(id)
total_responses INTEGER
answer_counts JSONB (e.g., {"true": 45, "false": 55})
last_calculated_at TIMESTAMPTZ
```

---

## 🎨 UI REQUIREMENTS

### 1. THEME: Light Theme (NOT Dark!)
- Use a clean, bright, friendly light theme
- Primary color: Your choice (suggest soft blue or green)
- Background: White or very light gray
- Text: Dark gray/black for readability
- NO dark/creepy themes

### 2. COURSE WORLD VIEW (Main Page)

**Visual Concept:** Think of each Course as a "World" or "Planet" that students can explore.

```
┌────────────────────────────────────────────────────────────┐
│                     🌍 MY COURSES                          │
│                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   ⚖️        │  │   📚        │  │   🏛️        │        │
│  │ Constitution│  │ Property    │  │ Criminal    │        │
│  │   World     │  │   World     │  │   World     │        │
│  │             │  │             │  │             │        │
│  │ 5 Modules   │  │ 3 Modules   │  │ 7 Modules   │        │
│  │ 45% Done    │  │ Not Started │  │ 80% Done    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└────────────────────────────────────────────────────────────┘
```

**Features:**
- Show all active courses as clickable "World" cards
- Display course icon, name, module count, progress
- Clicking a course opens the "World View"

### 3. WORLD VIEW (Single Course = Rotating World)

**Visual Concept:** The course is displayed as a globe/world that can be rotated. Each module is a "region" on the world.

```
┌────────────────────────────────────────────────────────────┐
│ ← Back                    ⚖️ Constitution World            │
│                                                            │
│              ┌───────────────────────┐                     │
│              │                       │                     │
│              │    🌍 [ROTATING]      │    📖 Module 1      │
│              │                       │    📖 Module 2  ✓   │
│              │    ← [DRAG TO ROTATE] │    📖 Module 3      │
│              │                       │    📖 Module 4      │
│              └───────────────────────┘    📖 Module 5      │
│                                                            │
│              Drag the world to explore different modules   │
└────────────────────────────────────────────────────────────┘
```

**Technical Approach (choose one):**
- Use CSS 3D transforms for rotation effect
- Or use a simple carousel/slider with perspective
- Or use a visual list with animations
- The "rotation" can be horizontal scroll with perspective transforms

**Features:**
- Show all modules as regions/areas on or around the world
- Indicate completion status (checkmarks, progress bars)
- Click a module to enter it

### 4. MODULE VIEW (Single Subject = Content Cards)

**Visual Concept:** Inside a module, content items appear one-by-one as cards that can be scrolled through.

```
┌────────────────────────────────────────────────────────────┐
│ ← Back to World          📖 Introduction to Constitution   │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                     📝 NOTES                          │  │
│  │                                                       │  │
│  │  "The Constitution of India is the supreme law..."   │  │
│  │                                                       │  │
│  │  ┌───────────────────────────────────────────────┐   │  │
│  │  │ 🤔 QUICK CHECK                                │   │  │
│  │  │                                               │   │  │
│  │  │ Is India a secular state?                    │   │  │
│  │  │                                               │   │  │
│  │  │ [TRUE]           [FALSE]                      │   │  │
│  │  │                                               │   │  │
│  │  │ 78% answered TRUE                             │   │  │
│  │  └───────────────────────────────────────────────┘   │  │
│  │                                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ← Prev                                         Next →     │
└────────────────────────────────────────────────────────────┘
```

**Features:**
- Display content items one at a time (cards)
- Navigation: Previous/Next buttons or swipe gestures
- Content types:
  - **Note**: Rich text/HTML content
  - **Quiz**: Link to quiz or embedded quiz
  - **Interactive**: Quick Check questions embedded in cards
  - **Case Note**: Link to existing case notes

### 5. QUICK CHECK QUESTIONS (Interactive Questions)

**Visual Concept:** Quick polls/questions embedded within content

```
┌────────────────────────────────────────────────────────────┐
│  🤔 Quick Check                                            │
│                                                            │
│  "Article 14 guarantees equality before law."             │
│                                                            │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  │         TRUE            │  │         FALSE           │  │
│  └─────────────────────────┘  └─────────────────────────┘  │
│                                                            │
│  After answering:                                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ✅ Correct!                                          │  │
│  │                                                       │  │
│  │ TRUE ████████████████████████ 92%                    │  │
│  │ FALSE ██                     8%                      │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**Features:**
- Display question text
- Show answer buttons (TRUE/FALSE, YES/NO, or poll options)
- After answering:
  - Show correct/incorrect feedback
  - Show percentage breakdown of all answers
  - User can only answer once per question

---

## 📁 REQUIRED PAGES/ROUTES

```
/courses                    → Course World Grid (all courses)
/courses/[courseId]         → Single Course World View (rotating/exploring)
/courses/[courseId]/[subjectId] → Module Content View (cards one by one)
```

---

## 🔌 DATA FETCHING (Supabase)

Use the existing Supabase client to fetch data:

```typescript
// Fetch all courses
const { data: courses } = await supabase
  .from('courses')
  .select('*')
  .eq('is_active', true)
  .order('order_index')

// Fetch course with subjects
const { data: course } = await supabase
  .from('courses')
  .select(`
    *,
    subjects (
      id, name, description, icon, order_index, is_active
    )
  `)
  .eq('id', courseId)
  .single()

// Fetch subject with content items
const { data: subject } = await supabase
  .from('subjects')
  .select(`
    *,
    content_items (
      id, content_type, title, order_index, is_active,
      note_content, quiz_id, case_number, interactive_data
    )
  `)
  .eq('id', subjectId)
  .single()

// Fetch interactive questions for a content item
const { data: questions } = await supabase
  .from('interactive_questions')
  .select('*')
  .eq('content_item_id', contentItemId)
  .order('order_index')

// Submit answer
await supabase
  .from('interactive_responses')
  .insert({
    question_id: questionId,
    user_id: userId,
    answer: selectedAnswer
  })

// Get aggregated results
const { data: aggregate } = await supabase
  .from('interactive_question_aggregates')
  .select('*')
  .eq('question_id', questionId)
  .single()
```

---

## 🎯 PRIORITY ORDER

1. **First**: Course listing page (grid of course cards)
2. **Second**: Course detail page (list of modules)
3. **Third**: Module content page (content cards with navigation)
4. **Fourth**: Interactive questions (Quick Checks with answer submission)
5. **Fifth**: World rotation/animation effects (polish)

---

## ✅ SUMMARY

| Admin Does | Student Sees |
|------------|--------------|
| Creates Course | New "World" appears |
| Adds Subject/Module | New "Region" on world |
| Adds Note content | Card with rich text |
| Adds Quiz | Link/embed to quiz |
| Adds Interactive Question | Quick Check popup |
| Reorders content | Content order updates |

---

## 🚀 START BUILDING!

Begin with the Course listing page, then work your way down the priority list. Use a LIGHT theme and make it visually engaging!

Remember: The data is **already in the database** from the admin. Your job is just to **read and display** it beautifully for students.
