---
description: How to keep the project file documentation updated when creating new files
---

# Update Project Documentation Workflow

When creating **new files** (pages, components, hooks, stores, utilities), you **MUST** update the project documentation to keep it current for future AI reference.

## Steps

1. After creating any new file, update the documentation:
   - Open `.agent/allfileslisted/allfileslisted.md`
   - Add the new file to the appropriate section table

2. For new **pages/routes**:
   - Add to the "Pages & Routes" section
   - Include: Route path, File path, Purpose

3. For new **components**:
   - Add to the "Core Components" section
   - Include: Component name, File, Purpose, Key Props

4. For new **hooks**:
   - Add to the "Hooks" section
   - Include: Hook name, File, Purpose, Returns

5. For new **stores**:
   - Add to the "State Stores" section
   - Include: Store name, File, Purpose

6. For new **utilities**:
   - Add to the "Utilities" section
   - Include: Utility name, File, Purpose

7. Update the "Quick Reference" section if the new file is commonly needed

8. Update the "Last Updated" date at the bottom

## Example Entry

When creating a new component `src/components/course/quiz-analytics.tsx`:

```markdown
| **QuizAnalytics** | `quiz-analytics.tsx` | Display quiz analytics charts | `quizId`, `timeRange` |
```

## File Location
Documentation: `.agent/allfileslisted/allfileslisted.md`
