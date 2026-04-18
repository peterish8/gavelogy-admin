import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./authHelpers";

// Helper to map entityType string to actual table name literal
function getTableName(entityType: string) {
  switch (entityType) {
    case 'course': return 'courses';
    case 'subject': return 'subjects';
    case 'content_item': return 'content_items'; // wait, we might have mapped content_items to structure_items earlier
    case 'structure_item': return 'structure_items';
    default: throw new Error(`Unknown entity type: ${entityType}`);
  }
}

export const createEntity = mutation({
  args: {
    entityType: v.string(),
    data: v.any(),
  },
  handler: async (ctx, { entityType, data }) => {
    await requireAuth(ctx);
    const table = getTableName(entityType) as any;
    
    // In Convex, _id is auto-generated. Usually we omit id on create unless needed. 
    // If the frontend passed an 'id' property, we should remove it before inserting, 
    // unless there's a reason to keep it (which we can't for _id).
    const { id, ...insertData } = data;
    
    return await ctx.db.insert(table, insertData);
  },
});

export const updateEntity = mutation({
  args: {
    entityType: v.string(),
    id: v.string(), // Wait, draft store passes string. Convex _id is explicitly generic Id<TableName>
    data: v.any(),
  },
  handler: async (ctx, { entityType, id, data }) => {
    await requireAuth(ctx);
    const table = getTableName(entityType) as any;
    
    // Remove id from patch data if it exists
    const { id: _, ...patchData } = data;
    
    // Normalize id as Id type
    const convexId = ctx.db.normalizeId(table, id);
    if (!convexId) throw new Error(`Invalid ID ${id} for table ${table}`);
    
    await ctx.db.patch(convexId, patchData);
  },
});

export const deleteEntity = mutation({
  args: {
    entityType: v.string(),
    id: v.string(),
  },
  handler: async (ctx, { entityType, id }) => {
    await requireAuth(ctx);
    const table = getTableName(entityType) as any;
    
    const convexId = ctx.db.normalizeId(table, id);
    if (!convexId) throw new Error(`Invalid ID ${id} for table ${table}`);
    
    await ctx.db.delete(convexId);
  },
});

export const createDailyNews = mutation({
  args: { rows: v.array(v.any()) },
  handler: async (ctx, { rows }) => {
    await requireAuth(ctx);
    const ids = [];
    for (const row of rows) {
      const id = await ctx.db.insert("daily_news", row);
      ids.push(id);
    }
    return ids;
  },
});

export const updateDailyNews = mutation({
  args: { id: v.id("daily_news"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, patch);
  },
});

export const bulkPublishNews = mutation({
  args: { ids: v.array(v.id("daily_news")), status: v.string() },
  handler: async (ctx, { ids, status }) => {
    await requireAuth(ctx);
    for (const id of ids) {
      await ctx.db.patch(id, { status } as any);
    }
  },
});

export const deleteDailyNews = mutation({
  args: { id: v.id("daily_news") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    await ctx.db.delete(id);
  },
});

export const saveDraft = mutation({
  args: { itemId: v.id("structure_items"), contentHtml: v.string() },
  handler: async (ctx, { itemId, contentHtml }) => {
    await requireAuth(ctx);
    const existingDraft = await ctx.db.query("draft_content_cache")
        .filter(q => q.eq(q.field("original_content_id"), itemId)).first();
    if (existingDraft) {
      await ctx.db.patch(existingDraft._id, { draft_data: { content_html: contentHtml } });
    } else {
      await ctx.db.insert("draft_content_cache", {
        original_content_id: itemId as any,
        draft_data: { content_html: contentHtml }
      });
    }
  }
});

export const publishNoteContent = mutation({
  args: { itemId: v.id("structure_items"), contentHtml: v.string() },
  handler: async (ctx, { itemId, contentHtml }) => {
    await requireAuth(ctx);
    const existing = await ctx.db.query("note_contents")
        .withIndex("by_item", q => q.eq("itemId", itemId)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { content_html: contentHtml });
    } else {
      await ctx.db.insert("note_contents", {
        itemId: itemId,
        content_html: contentHtml
      });
    }
    const draft = await ctx.db.query("draft_content_cache")
        .filter(q => q.eq(q.field("original_content_id"), itemId)).first();
    if (draft) {
      await ctx.db.delete(draft._id);
    }
  }
});

export const discardDraft = mutation({
  args: { itemId: v.id("structure_items") },
  handler: async (ctx, { itemId }) => {
    await requireAuth(ctx);
    const draft = await ctx.db.query("draft_content_cache")
        .filter(q => q.eq(q.field("original_content_id"), itemId)).first();
    if (draft) {
      await ctx.db.delete(draft._id);
    }
  }
});

export const saveQuiz = mutation({
  args: {
    itemId: v.id("structure_items"),
    title: v.string(),
    questions: v.array(v.object({
      questionText: v.string(),
      options: v.array(v.string()),
      correctAnswer: v.string(),
      explanation: v.optional(v.string())
    }))
  },
  handler: async (ctx, { itemId, title, questions }) => {
    await requireAuth(ctx);
    let quizId;
    const existingQuiz = await ctx.db.query("attached_quizzes")
        .withIndex("by_note_item", q => q.eq("noteItemId", itemId)).first();
    if (existingQuiz) {
      quizId = existingQuiz._id;
      await ctx.db.patch(quizId, { title });
    } else {
      quizId = await ctx.db.insert("attached_quizzes", {
        noteItemId: itemId,
        title
      });
    }

    const oldQuestions = await ctx.db.query("quiz_questions")
        .withIndex("by_quiz", q => q.eq("quizId", quizId)).collect();
    for (const q of oldQuestions) {
      await ctx.db.delete(q._id);
    }

    let i = 0;
    for (const q of questions) {
      await ctx.db.insert("quiz_questions", {
        quizId,
        question_text: q.questionText,
        options: q.options,
        correct_answer: q.correctAnswer,
        explanation: q.explanation,
        order_index: i++
      });
    }
  }
});

export const createCrashCourse = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    sourceCourseIds: v.array(v.id("courses")),
    orderIndex: v.number()
  },
  handler: async (ctx, { name, description, sourceCourseIds, orderIndex }) => {
    await requireAuth(ctx);
    const newCourseId = await ctx.db.insert("courses", {
      name,
      description,
      is_active: false,
      price: 0
    });

    // We fetch structures for all selected courses
    let rootFolderIndex = 0;
    for (const sourceCourseId of sourceCourseIds) {
      const sourceCourse = await ctx.db.get(sourceCourseId);
      if (!sourceCourse) continue;

      const items = await ctx.db.query("structure_items")
          .filter(q => q.eq(q.field("courseId"), sourceCourseId))
          .collect();

      if (items.length === 0) continue;

      // Group by parentId
      const itemsByParent: Record<string, any[]> = {};
      for (const item of items) {
        const key = item.parentId || 'null';
        if (!itemsByParent[key]) itemsByParent[key] = [];
        itemsByParent[key].push(item);
      }

      // Root folder
      const rootFolderId = await ctx.db.insert("structure_items", {
        courseId: newCourseId,
        item_type: 'folder',
        title: sourceCourse.name,
        order_index: rootFolderIndex++,
        is_active: true
      });

      const queue: { oldParentId: string | null; newParentId: string | null }[] = [
        { oldParentId: null, newParentId: rootFolderId }
      ];

      while (queue.length > 0) {
        const { oldParentId, newParentId } = queue.shift()!;
        const parentKey = oldParentId ?? 'null';
        const children = itemsByParent[parentKey] || [];

        for (const item of children) {
          const newItemId = await ctx.db.insert("structure_items", {
            courseId: newCourseId,
            parentId: newParentId! as any,
            item_type: item.item_type,
            title: item.title,
            order_index: item.order_index,
            is_active: true
          });

          if (item.item_type === 'folder') {
            queue.push({ oldParentId: item._id, newParentId: newItemId });
          }
        }
      }
    }
    return newCourseId;
  }
});
