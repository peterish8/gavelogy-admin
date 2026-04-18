import { query } from "./_generated/server";
import { v } from "convex/values";

// Required by use-subjects.ts
export const getSubjectsByCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    return await ctx.db
      .query("subjects")
      .withIndex("by_course", (q) => q.eq("courseId", courseId))
      .collect();
  },
});

export const getSubjectWithContent = query({
  args: { subjectId: v.id("subjects") },
  handler: async (ctx, { subjectId }) => {
    const subject = await ctx.db.get(subjectId);
    if (!subject) return null;

    const content_items = await ctx.db
       .query("structure_items")
       .withIndex("by_parent", (q) => q.eq("parentId", subjectId as any))
       .collect();

    return { subject, content_items };
  },
});

export const getNewsGroupedByDate = query({
  args: {},
  handler: async (ctx) => {
    const data = await ctx.db
      .query("daily_news")
      .withIndex("by_date")
      .order("desc")
      .collect();

    const map = new Map<string, any>();
    for (const row of data) {
      const key = row.date;
      if (!map.has(key)) {
        map.set(key, { date: key, total: 0, published: 0, draft: 0, source_paper: row.source_paper });
      }
      const group = map.get(key);
      group.total++;
      if (row.status === "published") group.published++;
      else group.draft++;
    }
    return Array.from(map.values());
  },
});

export const getNewsByDate = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const data = await ctx.db
      .query("daily_news")
      .withIndex("by_date", (q) => q.eq("date", date))
      .collect();
    
    // Sort by display_order
    return data.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  },
});

export const getEntity = query({
  args: { entityType: v.string(), id: v.string() },
  handler: async (ctx, { entityType, id }) => {
    // Basic entity getter
    const table = getTableName(entityType) as any;
    const convexId = ctx.db.normalizeId(table, id);
    if (!convexId) return null;
    return await ctx.db.get(convexId);
  }
})

// Used by adminMutations and adminQueries
function getTableName(entityType: string): string {
  switch (entityType) {
    case 'course': return 'courses';
    case 'subject': return 'subjects';
    case 'structure_item': return 'structure_items';
    case 'daily_news': return 'daily_news';
    default: throw new Error(`Unknown entity type ${entityType}`);
  }
}

export const getEditorData = query({
  args: { itemId: v.id("structure_items") },
  handler: async (ctx, { itemId }) => {
    const draft = await ctx.db.query("draft_content_cache")
        .filter(q => q.eq(q.field("original_content_id"), itemId)).first();
    const live = await ctx.db.query("note_contents")
        .withIndex("by_item", q => q.eq("itemId", itemId)).first();
    const item = await ctx.db.get(itemId);
    
    // Quiz logic:
    const quiz = await ctx.db.query("attached_quizzes")
        .withIndex("by_note_item", q => q.eq("noteItemId", itemId)).first();
    let quiz_questions: any[] = [];
    if (quiz) {
       quiz_questions = await ctx.db.query("quiz_questions")
           .withIndex("by_quiz", q => q.eq("quizId", quiz._id)).collect();
    }
    
    return {
       draftRes: { data: draft ? { id: draft._id, draft_data: draft.draft_data } : null },
       liveRes: { data: live ? { id: live._id, content_html: live.content_html, updated_at: live._creationTime, flashcards_json: live.flashcards_json } : null },
       itemRes: { data: item ? { id: item._id, pdf_url: item.pdf_url } : null },
       quizRes: { data: quiz ? { id: quiz._id, title: quiz.title, quiz_questions: quiz_questions.map((q: any) => ({ id: q._id, question_text: q.question_text, options: q.options, correct_answer: q.correct_answer, explanation: q.explanation })) } : null }
    }
  }
});

export const checkDbDiagnostic = query({
  args: {},
  handler: async (ctx) => {
    const courses = await ctx.db.query("courses").collect();
    const judgmentCourses = courses.filter(c => c.name.toLowerCase().includes("judgment"));
    
    const results = [];
    for (const course of judgmentCourses) {
      const subjects = await ctx.db.query("subjects")
        .withIndex("by_course", q => q.eq("courseId", course._id)).collect();
      
      const items = await ctx.db.query("structure_items")
        .withIndex("by_course", q => q.eq("courseId", course._id)).collect();
        
      results.push({
        course: course.name,
        courseId: course._id,
        subjectsCount: subjects.length,
        itemsCount: items.length,
        itemsWithPdf: items.filter(i => !!i.pdf_url).map(i => ({ title: i.title, pdf_url: i.pdf_url }))
      });
    }

    const allItems = await ctx.db.query("structure_items").collect();
    const allItemsWithPdf = allItems.filter(i => !!i.pdf_url).map(i => ({ title: i.title, pdf_url: i.pdf_url, courseId: i.courseId }));
    
    return { judgmentCoursesResults: results, totalItemsWithPdf: allItemsWithPdf.length, samplePdfItems: allItemsWithPdf.slice(0, 5) };
  }
});
