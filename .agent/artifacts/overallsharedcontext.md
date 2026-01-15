# PRD 3: SHARED CONTEXT FOR BOTH CODEBASES
## SYSTEM-LEVEL TRANSFORMATION GUIDE

This document is the bridge between admin and user codebases.
Read this before implementing either PRD 1 or PRD 2.
It explains what's changing at the system level and why both codebases must evolve together.

––––––––––––––––––––
WHAT IS CHANGING (EXECUTIVE SUMMARY)
––––––––––––––––––––

Gavelogy is transforming from a **flat content platform** to a **course-based learning universe**.

BEFORE:
- One giant "Content" page listing all subjects/years/cases
- Mistakes page showing all mistakes from everything
- No clear boundaries between different learning materials
- Admin manages content through separate CMS-like tools

AFTER:
- Course-first navigation (each course is its own world)
- Scoped learning (progress, mistakes, quizzes are per-course)
- Admin builds courses using the same interface students use
- Interactive engagement embedded directly in notes

ANALOGY:
- Old: Wikipedia (everything in one searchable library)
- New: University campus (separate buildings for each course)

––––––––––––––––––––
CORE PHILOSOPHICAL SHIFT
––––––––––––––––––––

This is not just UI redesign.
This is an architectural evolution.

**1. SINGLE CODEBASE, DUAL MODES**

PRINCIPLE:
Admin and student interfaces are the same application.
Admin mode is just a feature flag that activates authoring powers.

WHY:
- No code duplication
- No forked UI logic
- Changes in one automatically affect the other
- Easier maintenance

HOW:
- Components check: `if (isAdmin) { show edit controls }`
- Same routing, same layouts, same data structures
- Admin-only features are additive, not replacement

**2. COURSE AS FIRST-CLASS ENTITY**

PRINCIPLE:
Everything belongs to a course.
Progress, mistakes, quizzes, notes—all scoped to courses.

WHY:
- Reduces cognitive load
- Creates clear learning paths
- Enables per-course analytics
- Makes content modular

HOW:
- Database schema puts course_id on everything
- UI navigation is course-first
- Dashboard aggregates across courses

**3. DRAFT VS PUBLISHED STATE**

PRINCIPLE:
Admins work in draft mode.
Students only see published content.
Changes are atomic (all-or-nothing).

WHY:
- Prevents broken content from going live
- Allows safe experimentation
- Clear rollback if needed

HOW:
- Admins make changes in memory (draft state)
- Save button commits all changes in transaction
- Students always see last committed state

**4. INTERACTIVE ENGAGEMENT**

PRINCIPLE:
Learning is active, not passive.
Notes include quick comprehension checks.
Responses are aggregated and shown as percentages.

WHY:
- Increases retention
- Provides self-assessment
- Shows community consensus
- Makes reading less monotonous

HOW:
- Interactive questions stored as JSON in notes
- Rendered as special components
- Responses tracked in database
- Aggregates computed on-demand

––––––––––––––––––––
DATA MODEL TRANSFORMATION
––––––––––––––––––––

This section describes how the database must evolve.
Both codebases depend on these changes.

**NEW TABLES:**

```
courses:
  - id (primary key)
  - title (e.g., "Contemporary Cases 2024-25")
  - description
  - price
  - created_at
  - updated_at
  - order (for sorting)
  - deleted_at (soft delete)

course_modules:
  - id
  - course_id (foreign key)
  - title (e.g., "Constitutional Law")
  - description
  - order
  - parent_module_id (for nesting)
  - created_at
  - updated_at
  - deleted_at

course_content:
  - id
  - module_id (foreign key)
  - type (enum: 'note', 'quiz', 'interactive_question')
  - content (JSON)
  - order
  - created_at
  - updated_at
  - deleted_at

user_course_access:
  - id
  - user_id (foreign key)
  - course_id (foreign key)
  - purchase_date
  - expires_at (nullable)
  - access_type (enum: 'free', 'purchased', 'trial')

user_course_progress:
  - id
  - user_id
  - course_id
  - content_id
  - completed (boolean)
  - completed_at
  - quiz_score (nullable)

interactive_questions:
  - id
  - content_id (foreign key)
  - question_text
  - type (enum: 'true_false', 'yes_no', 'poll')
  - correct_answer (nullable)
  - position (order within content)
  - created_at

user_question_responses:
  - id
  - question_id (foreign key)
  - user_id (foreign key)
  - answer
  - timestamp
  - UNIQUE (question_id, user_id) ← prevent duplicate responses

admin_audit_log:
  - id
  - admin_id (foreign key)
  - action (enum: 'create', 'update', 'delete', 'publish')
  - entity_type (enum: 'course', 'module', 'content')
  - entity_id
  - changes (JSON)
  - timestamp
```

**MODIFIED TABLES:**

```
quizzes:
  + course_id (foreign key) ← associate quiz with course
  + module_id (foreign key) ← specific location
  
mistakes:
  + course_id (foreign key) ← enable course-scoped filtering
  
users:
  + role (enum: 'student', 'admin') ← authorization
```

**MIGRATION STRATEGY:**

For existing data:

1. Create "Default Course" for backward compatibility
2. Migrate all existing content into this course
3. Associate all existing progress/mistakes with Default Course
4. Update URLs to include course context
5. Gradually transition users to new structure

CRITICAL:
- Don't delete old tables immediately
- Keep migration reversible for 30 days
- Run migration in off-peak hours
- Have rollback plan ready

––––––––––––––––––––
API CHANGES (BOTH CODEBASES MUST COORDINATE)
––––––––––––––––––––

**NEW ENDPOINTS:**

```
GET    /api/courses
       → List all courses (filtered by user access)

GET    /api/courses/:id
       → Get specific course details

GET    /api/courses/:id/modules
       → Get course structure

GET    /api/courses/:id/progress
       → Get user's progress in this course

GET    /api/courses/:id/mistakes
       → Get mistakes scoped to this course

POST   /api/courses
       → (Admin only) Create new course

PUT    /api/courses/:id
       → (Admin only) Update course

DELETE /api/courses/:id
       → (Admin only) Soft delete course

POST   /api/courses/:id/publish
       → (Admin only) Commit draft changes

POST   /api/courses/:id/revert
       → (Admin only) Discard draft changes

GET    /api/content/:id
       → Get content (note/quiz) by ID

POST   /api/content
       → (Admin only) Create content

PUT    /api/content/:id
       → (Admin only) Update content

DELETE /api/content/:id
       → (Admin only) Delete content

POST   /api/content/:id/reorder
       → (Admin only) Change order

POST   /api/questions/:id/respond
       → Submit answer to interactive question

GET    /api/questions/:id/stats
       → Get aggregate percentages
```

**MODIFIED ENDPOINTS:**

```
GET    /api/mistakes
       → Now accepts ?course_id filter

GET    /api/progress
       → Now grouped by course_id

GET    /api/quizzes/:id
       → Returns course context
```

**AUTHORIZATION MIDDLEWARE:**

Every endpoint must check:
1. Is user authenticated? (session/JWT valid)
2. Does user have access to this course?
3. (For admin endpoints) Is user an admin?

Example:
```javascript
async function requireCourseAccess(req, res, next) {
  const courseId = req.params.courseId;
  const userId = req.user.id;
  
  const access = await db.query(
    "SELECT * FROM user_course_access WHERE user_id = ? AND course_id = ?",
    [userId, courseId]
  );
  
  if (!access || (access.expires_at && access.expires_at < Date.now())) {
    return res.status(403).json({ error: "Access denied" });
  }
  
  next();
}
```

CRITICAL:
- Never trust client-side access checks
- Always validate on server
- Log all admin actions for audit

––––––––––––––––––––
URL STRUCTURE EVOLUTION
––––––––––––––––––––

**OLD URLs (BEFORE):**
```
/content                           → All subjects
/content/contemporary-cases        → All years
/content/contemporary-cases/2024   → All cases in 2024
/mistakes                          → All mistakes
/quiz/:id                          → Standalone quiz
```

**NEW URLs (AFTER):**
```
/content                                      → Course selector
/content/:courseId                            → Course world
/content/:courseId/modules/:moduleId          → Module view
/content/:courseId/content/:contentId/notes   → Notes
/content/:courseId/content/:contentId/quiz    → Quiz
/content/:courseId/mistakes                   → Scoped mistakes
/mistakes                                     → Global mistakes (still exists)
```

**ADMIN URLs:**
```
Same as student URLs, but with admin controls visible
No separate /admin/... paths needed
```

**MIGRATION PLAN:**

1. Keep old URLs working for 60 days
2. Add redirects:
   - `/content/contemporary-cases/2024` → `/content/contemporary-cases-2024`
3. Show migration notice to users
4. Update all internal links
5. Eventually return 410 Gone on old URLs

––––––––––––––––––––
COMPONENT REUSABILITY (CRITICAL)
––––––––––––––––––––

These components MUST work for both admin and student:

**1. CourseNavigator**
- Props: `courses`, `isAdmin`, `onSelect`
- Student mode: Just list and select
- Admin mode: + drag handles, edit, delete

**2. ContentList**
- Props: `content`, `isAdmin`, `onEdit`, `onDelete`, `onReorder`
- Student mode: Just render content
- Admin mode: + edit controls, drag handles

**3. NotesViewer**
- Props: `note`, `isAdmin`, `onEdit`
- Student mode: Render notes + interactive questions
- Admin mode: + edit button, inline question editor

**4. InteractiveQuestion**
- Props: `question`, `onRespond`, `isAdmin`
- Student mode: Answer and see percentages
- Admin mode: + edit question, see full stats

**5. QuizPlayer**
- Props: `quiz`, `isAdmin`, `onEdit`
- Student mode: Take quiz
- Admin mode: + edit button, preview mode

**PATTERN:**

Every shared component follows this pattern:
```javascript
function MyComponent({ data, isAdmin, onAdminAction }) {
  return (
    <div>
      {/* Student content */}
      <MainContent data={data} />
      
      {/* Admin controls */}
      {isAdmin && (
        <AdminControls
          onEdit={() => onAdminAction('edit', data.id)}
          onDelete={() => onAdminAction('delete', data.id)}
        />
      )}
    </div>
  );
}
```

BENEFITS:
- No code duplication
- Consistent behavior
- Easier testing
- Single source of truth

––––––––––––––––––––
STATE MANAGEMENT COORDINATION
––––––––––––––––––––

**STUDENT STATE (SIMPLE):**
```javascript
{
  user: { id, name, role },
  currentCourse: { id, title, modules },
  progress: { completed, total },
  mistakes: [...],
  activeContent: { type, data }
}
```

**ADMIN STATE (COMPLEX):**
```javascript
{
  user: { id, name, role: 'admin' },
  currentCourse: { id, title, modules },
  
  // Draft state (unsaved changes)
  draft: {
    hasChanges: true,
    courses: [...],
    modules: [...],
    content: [...],
    deletions: [...]
  },
  
  // UI state
  ui: {
    showSaveBar: true,
    isDragging: false,
    editingContentId: 5
  }
}
```

**SYNCING LOGIC:**

Admin makes changes → update draft state → flag hasChanges
Student views content → fetch from database → ignore draft
Admin clicks save → commit draft to DB → clear draft state
Student views after save → sees updated content

CRITICAL:
- Draft state is client-side only (not in database)
- Save is atomic (all changes or none)
- Students never see draft state

––––––––––––––––––––
SECURITY COORDINATION (BOTH TEAMS MUST IMPLEMENT)
––––––––––––––––––––

**AUTHENTICATION:**

Both codebases must:
1. Validate session/JWT on every request
2. Check user role (student vs admin)
3. Expire invalid sessions
4. Rate limit login attempts

**AUTHORIZATION:**

For every action, check:
1. Is user authenticated?
2. Does user have access to this course?
3. (Admin only) Does user have permission for this action?

Example authorization check:
```javascript
// Student trying to view content
if (!userHasAccessToCourse(userId, courseId)) {
  return 403; // Forbidden
}

// Admin trying to edit content
if (user.role !== 'admin') {
  return 403; // Forbidden
}
```

**INPUT VALIDATION:**

Both codebases must:
1. Sanitize all text inputs (prevent XSS)
2. Validate structure (JSON schema)
3. Limit sizes (prevent DoS)
4. Validate relationships (course_id exists, etc.)

**COMMON ATTACKS TO PREVENT:**

1. **XSS (Cross-Site Scripting):**
   - Sanitize all user inputs before rendering
   - Use Content Security Policy (CSP)
   - Escape HTML in dynamic content

2. **SQL Injection:**
   - Use parameterized queries ALWAYS
   - Never concatenate user input into SQL

3. **CSRF (Cross-Site Request Forgery):**
   - Use CSRF tokens for state-changing requests
   - Validate tokens on server

4. **Privilege Escalation:**
   - Never trust client-side role flags
   - Always check role in database

5. **Data Leakage:**
   - Don't expose user_id in public URLs
   - Use UUIDs instead of sequential IDs
   - Never leak draft content to non-admins

6. **Rate Limiting:**
   - Max 100 requests/minute per user
   - Max 10 saves/minute for admins
   - Max 10 interactive question responses/minute

––––––––––––––––––––
PERFORMANCE COORDINATION
––––––––––––––––––––

**DATABASE INDEXING (MUST HAVE):**

```sql
CREATE INDEX idx_course_access ON user_course_access(user_id, course_id);
CREATE INDEX idx_progress ON user_course_progress(user_id, course_id);
CREATE INDEX idx_content_order ON course_content(module_id, order);
CREATE INDEX idx_question_responses ON user_question_responses(question_id, user_id);
CREATE INDEX idx_deleted ON courses(deleted_at);  -- for soft deletes
```

**CACHING STRATEGY:**

1. **Course structure:**
   - Cache for 5 minutes
   - Invalidate on admin save

2. **Progress data:**
   - Cache for 1 minute
   - Invalidate on completion event

3. **Interactive question stats:**
   - Cache for 5 minutes
   - Update asynchronously

4. **User access:**
   - Cache for 10 minutes
   - Invalidate on purchase

**QUERY OPTIMIZATION:**

Bad:
```sql
-- Don't do this (N+1 query problem)
SELECT * FROM courses WHERE user_id = ?;
for each course:
  SELECT * FROM modules WHERE course_id = ?;
  for each module:
    SELECT * FROM content WHERE module_id = ?;
```

Good:
```sql
-- Do this (single join)
SELECT 
  c.*, 
  m.*, 
  ct.*
FROM courses c
LEFT JOIN course_modules m ON m.course_id = c.id
LEFT JOIN course_content ct ON ct.module_id = m.id
WHERE c.id = ?
AND c.deleted_at IS NULL;
```

**PAGINATION:**

For large lists:
- Courses page: No pagination needed (< 20 courses)
- Module list: Paginate if > 50 items
- Content list: Paginate if > 100 items
- Mistakes: Paginate at 20 per page

––––––––––––––––––––
DEPLOYMENT COORDINATION (CRITICAL)
––––––––––––––––––––

**DEPLOYMENT ORDER:**

1. **Week 1: Database migration**
   - Run schema updates
   - Migrate existing data
   - Verify data integrity
   - Keep old tables for rollback

2. **Week 2: Backend API updates**
   - Deploy new endpoints
   - Keep old endpoints working
   - Add authorization middleware
   - Test thoroughly

3. **Week 3: Frontend - Student experience**
   - Deploy new course navigation
   - Update routing
   - Add interactive questions
   - Redirect old URLs

4. **Week 4: Frontend - Admin tools**
   - Deploy authoring interface
   - Enable admin controls
   - Test draft/publish flow

5. **Week 5: Cleanup**
   - Remove old endpoints (after deprecation period)
   - Drop old database tables
   - Update documentation

**ROLLBACK PLAN:**

If something breaks:
1. Revert to previous deployment
2. Re-enable old endpoints
3. Redirect to old URLs
4. Investigate and fix
5. Redeploy when ready

Have rollback scripts ready:
```sql
-- Rollback script
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS course_modules;
-- etc.

-- Restore from backup
RESTORE DATABASE gavelogy FROM BACKUP '...';
```

**ZERO-DOWNTIME DEPLOYMENT:**

Use blue-green deployment:
1. Deploy new version to separate environment
2. Test thoroughly
3. Switch traffic gradually
4. Monitor error rates
5. Full cutover when stable

––––––––––––––––––––
MONITORING & OBSERVABILITY (BOTH TEAMS)
––––––––––––––––––––

**METRICS TO TRACK:**

1. **Admin metrics:**
   - Number of courses created
   - Number of saves per day
   - Average time between edits and save
   - Number of draft discards
   - Most edited courses

2. **Student metrics:**
   - Course completion rates
   - Time spent per course
   - Interactive question response rates
   - Quiz scores per course
   - Most popular courses

3. **System metrics:**
   - API response times
   - Database query times
   - Cache hit rates
   - Error rates
   - Concurrent users

**ALERTS:**

Trigger alerts if:
- API response time > 2 seconds
- Error rate > 1%
- Admin save failure > 3 times in 1 hour
- Student course access denied (might indicate payment issue)
- Database connection pool exhausted

**LOGGING:**

Log these events:
- All admin actions (audit trail)
- Course access attempts
- Failed authentications
- API errors with stack traces
- Performance bottlenecks

Use structured logging:
```json
{
  "timestamp": "2025-01-10T10:30:00Z",
  "level": "info",
  "event": "course_published",
  "admin_id": 123,
  "course_id": 456,
  "changes": { "modules_added": 3, "content_updated": 5 }
}
```

––––––––––––––––––––
TESTING COORDINATION
––––––––––––––––––––

**SHARED TEST SCENARIOS:**

Both teams must test:

1. **Happy path:**
   - Admin creates course → Student accesses course → Completes content

2. **Access control:**
   - Non-purchased course → Student denied access
   - Non-admin user → Cannot access admin endpoints

3. **Concurrent editing:**
   - Two admins edit same course → Conflict detection works

4. **Data integrity:**
   - Admin saves changes → Student sees updated content immediately
   - Admin discards changes → Student still sees old content

5. **Edge cases:**
   - Empty course (no content) → Graceful empty state
   - Expired access → Student redirected to purchase page
   - Deleted content → Removed from student view

**INTEGRATION TESTS:**

Test end-to-end flows:
```javascript
describe('Course World Flow', () => {
  it('should allow admin to create course and student to access', async () => {
    // Admin creates course
    const course = await adminAPI.createCourse({ title: "Test Course" });
    
    // Admin adds content
    await adminAPI.addContent(course.id, { type: "note", ... });
    
    // Admin publishes
    await adminAPI.publishCourse(course.id);
    
    // Grant student access
    await db.grantAccess(studentId, course.id);
    
    // Student loads course
    const studentView = await studentAPI.getCourse(course.id);
    
    // Verify content visible
    expect(studentView.modules).toHaveLength(1);
  });
});
```

**LOAD TESTING:**

Simulate realistic usage:
- 1000 concurrent students viewing courses
- 10 admins editing simultaneously
- 100 quiz submissions per second
- 500 interactive question responses per second

Monitor:
- Response times stay < 2 seconds
- No database deadlocks
- No memory leaks

––––––––––––––––––––
DOCUMENTATION COORDINATION
––––––––––––––––––––

**FOR ADMINS:**

Create admin guide:
1. How to create a course
2. How to add/edit content
3. How to reorder items
4. How to add interactive questions
5. How to publish changes
6. How to handle conflicts
7. FAQs and troubleshooting

**FOR DEVELOPERS:**

Create developer docs:
1. Architecture overview
2. Database schema
3. API documentation
4. Component library
5. State management guide
6. Security best practices
7. Deployment runbook

**FOR STUDENTS:**

Update help center:
1. How to navigate courses
2. How to track progress
3. How to answer interactive questions
4. How mistakes work
5. FAQs

––––––––––––––––––––
COMMUNICATION BETWEEN TEAMS
––––––––––––––––––––

**SHARED SLACK CHANNEL:**

Create #gavelogy-course-world channel for:
- Daily standups
- Blockers
- API contract discussions
- Bug reports
- Deployment coordination

**WEEKLY SYNC MEETING:**

Agenda:
1. Progress updates
2. Blockers and dependencies
3. API changes needed
4. Testing status
5. Deployment timeline

**SHARED PROJECT BOARD:**

Use Jira/Trello with columns:
- To Do
- In Progress
- Code Review
- Testing
- Deployed

Label tickets:
- [Frontend]
- [Backend]
- [Database]
- [Blocker]

––––––––––––––––––––
SUCCESS CRITERIA (BOTH TEAMS)
––––––––––––––––––––

Consider this transformation successful when:

✅ Admins can create entire courses without dev help
✅ Students navigate courses without confusion
✅ Progress tracking works per-course
✅ Mistakes are properly scoped
✅ Interactive questions engage students
✅ Response percentages are accurate
✅ Draft/publish flow prevents broken content
✅ No security vulnerabilities
✅ Performance is acceptable (< 2s page loads)
✅ Zero critical bugs in production
✅ Positive feedback from both admins and students

**METRICS TARGETS:**

- Course creation time: < 30 minutes (down from 2+ hours)
- Student engagement: +30% time on platform
- Quiz completion rate: +20%
- Interactive question response rate: > 70%
- Admin satisfaction: 8/10+
- Student satisfaction: 8/10+

––––––––––––––––––––
FINAL WORDS
––––––––––––––––––––

This is a significant transformation.
Both teams must work closely together.

Key principles to remember:
• One codebase, dual modes
• Security first, always
• Draft before publish
• Course-scoped everything
• Interactive engagement

Common pitfalls to avoid:
• Forking admin and student code
• Forgetting to validate access
• Leaking draft content
• Poor performance with large courses
• Confusing navigation

If both teams follow these guidelines, the result will be a powerful, scalable, and delightful learning platform.

Good luck! 🚀