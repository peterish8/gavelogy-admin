import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./authHelpers";

const ADMIN_EMAILS = [
  ...(process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase()),
  "gavelogyakshu@mail.com",
].filter(Boolean);

async function requireAdmin(ctx: Parameters<typeof requireAuth>[0]) {
  const user = await requireAuth(ctx);
  if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    throw new Error("Admin access required");
  }
  return user;
}

export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx).catch(() => null);
    if (!user) return false;
    return ADMIN_EMAILS.includes(user.email.toLowerCase());
  },
});

// Admin: create or update a course
export const upsertCourse = mutation({
  args: {
    courseId: v.optional(v.id("courses")),
    name: v.string(),
    description: v.string(),
    price: v.number(),
    is_active: v.boolean(),
    is_free: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.courseId) {
      await ctx.db.patch(args.courseId, {
        name: args.name,
        description: args.description,
        price: args.price,
        is_active: args.is_active,
        is_free: args.is_free,
      });
      return args.courseId;
    }
    return ctx.db.insert("courses", {
      name: args.name,
      description: args.description,
      price: args.price,
      is_active: args.is_active,
      is_free: args.is_free ?? false,
    });
  },
});

// Admin: create/update a structure item (for content management)
export const upsertStructureItem = mutation({
  args: {
    itemId: v.optional(v.id("structure_items")),
    courseId: v.optional(v.id("courses")),
    parentId: v.optional(v.id("structure_items")),
    title: v.string(),
    description: v.optional(v.string()),
    item_type: v.string(),
    order_index: v.optional(v.number()),
    icon: v.optional(v.string()),
    is_active: v.optional(v.boolean()),
    pdf_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { itemId, ...fields } = args;
    if (itemId) {
      await ctx.db.patch(itemId, fields);
      return itemId;
    }
    return ctx.db.insert("structure_items", fields);
  },
});

// Admin: create/update attached quiz
export const upsertAttachedQuiz = mutation({
  args: {
    quizId: v.optional(v.id("attached_quizzes")),
    title: v.optional(v.string()),
    passing_score: v.optional(v.number()),
    noteItemId: v.optional(v.id("structure_items")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { quizId, ...fields } = args;
    if (quizId) {
      await ctx.db.patch(quizId, fields);
      return quizId;
    }
    return ctx.db.insert("attached_quizzes", fields);
  },
});

// Admin: insert a quiz question
export const insertQuizQuestion = mutation({
  args: {
    quizId: v.id("attached_quizzes"),
    question_text: v.string(),
    options: v.array(v.string()),
    correct_answer: v.string(),
    explanation: v.optional(v.string()),
    order_index: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db.insert("quiz_questions", args);
  },
});

// Admin: insert streak bonus milestone
export const insertStreakBonus = mutation({
  args: {
    streak_days: v.number(),
    bonus_points: v.number(),
    badge_name: v.optional(v.string()),
    badge_emoji: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db.insert("streak_bonuses", args);
  },
});

// Admin: delete a course
export const deleteCourse = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(courseId);
  },
});

// Admin: delete a structure item
export const deleteStructureItem = mutation({
  args: { itemId: v.id("structure_items") },
  handler: async (ctx, { itemId }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(itemId);
  },
});

// Admin: update a note PDF link label
export const updateNotePdfLinkLabel = mutation({
  args: { linkId: v.id("note_pdf_links"), label: v.string() },
  handler: async (ctx, { linkId, label }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(linkId, { label });
  },
});

// Admin: delete a quiz question
export const deleteQuizQuestion = mutation({
  args: { questionId: v.id("quiz_questions") },
  handler: async (ctx, { questionId }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(questionId);
  },
});

// Admin: delete all quiz questions for a quiz, then delete the quiz
export const deleteAttachedQuiz = mutation({
  args: { quizId: v.id("attached_quizzes") },
  handler: async (ctx, { quizId }) => {
    await requireAdmin(ctx);
    const questions = await ctx.db
      .query("quiz_questions")
      .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
      .collect();
    for (const q of questions) await ctx.db.delete(q._id);
    await ctx.db.delete(quizId);
  },
});

// Admin: replace all questions for a quiz (delete old, insert new batch)
export const replaceQuizQuestions = mutation({
  args: {
    quizId: v.id("attached_quizzes"),
    questions: v.array(v.object({
      question_text: v.string(),
      options: v.array(v.string()),
      correct_answer: v.string(),
      explanation: v.optional(v.string()),
      order_index: v.optional(v.number()),
    })),
  },
  handler: async (ctx, { quizId, questions }) => {
    await requireAdmin(ctx);
    const old = await ctx.db
      .query("quiz_questions")
      .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
      .collect();
    for (const q of old) await ctx.db.delete(q._id);
    for (const q of questions) {
      await ctx.db.insert("quiz_questions", { quizId, ...q });
    }
  },
});

// Admin: delete all PDF links for an item (used by AI summarize)
export const deleteAllLinksForItem = mutation({
  args: { itemId: v.id("structure_items") },
  handler: async (ctx, { itemId }) => {
    await requireAdmin(ctx);
    const links = await ctx.db
      .query("note_pdf_links")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .collect();
    for (const l of links) await ctx.db.delete(l._id);
  },
});

// Admin: get all courses regardless of is_active
export const getAllCourses = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("courses").collect();
  },
});

// Admin: get all structure items for a course with note-content presence flag
export const getStructureItemsWithNoteFlag = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    const items = await ctx.db
      .query("structure_items")
      .withIndex("by_course", (q) => q.eq("courseId", courseId))
      .collect();
    return Promise.all(
      items.map(async (item) => {
        const nc = await ctx.db
          .query("note_contents")
          .withIndex("by_item", (q) => q.eq("itemId", item._id))
          .first();
        return { ...item, hasNoteContent: !!nc };
      })
    );
  },
});

// Admin: get all structure items (all courses) with course info, for notes/quizzes list pages
export const getAllStructureItems = query({
  args: { item_type: v.optional(v.string()) },
  handler: async (ctx, { item_type }) => {
    let q = ctx.db.query("structure_items");
    const all = await q.collect();
    const filtered = item_type ? all.filter((i) => i.item_type === item_type) : all;
    const courseIds = [...new Set(filtered.map((i) => i.courseId).filter(Boolean))];
    const courses = await Promise.all(courseIds.map((id) => ctx.db.get(id!)));
    const courseMap = Object.fromEntries(courses.filter(Boolean).map((c) => [c!._id, c]));
    return filtered.map((item) => ({
      ...item,
      course: item.courseId ? courseMap[item.courseId] ?? null : null,
    }));
  },
});

// Admin: get all attached quizzes with note item + course context (for quizzes list page)
export const getAllAttachedQuizzes = query({
  args: {},
  handler: async (ctx) => {
    const quizzes = await ctx.db.query("attached_quizzes").collect();
    return Promise.all(
      quizzes.map(async (quiz) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemId = (quiz as any).note_item_id ?? quiz.noteItemId;
        const item = itemId ? await ctx.db.get(itemId as any) : null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const course = (item as any)?.courseId ? await ctx.db.get((item as any).courseId) : null;
        const questions = await ctx.db
          .query("quiz_questions")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .withIndex("by_quiz", (q) => q.eq("quizId", quiz._id as any))
          .collect();
        return { ...quiz, item, course, questionCount: questions.length };
      })
    );
  },
});

// Admin: dashboard counts
export const getDashboardCounts = query({
  args: {},
  handler: async (ctx) => {
    const [courses, items, quizzes] = await Promise.all([
      ctx.db.query("courses").collect(),
      ctx.db.query("structure_items").collect(),
      ctx.db.query("attached_quizzes").collect(),
    ]);
    return {
      courses: courses.length,
      folders: items.filter((i) => i.item_type === "folder").length,
      files: items.filter((i) => i.item_type === "file").length,
      quizzes: quizzes.length,
    };
  },
});

// Admin: get recent courses (by _creationTime descending)
export const getRecentCourses = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 5 }) => {
    const all = await ctx.db.query("courses").collect();
    return all
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, limit);
  },
});

// Admin: get structure items suitable for PDF tagging (CS-/CQ-/CR- title prefix)
export const getCaseItemsForTagging = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("structure_items").collect();
    return all
      .filter((i) => /^(CS|CQ|CR)-/i.test(i.title))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
});

// Admin: get link counts map for a list of item IDs (for tagging list badges)
export const getNotePdfLinkCountsForItems = query({
  args: { itemIds: v.array(v.string()) },
  handler: async (ctx, { itemIds }) => {
    const idSet = new Set(itemIds);
    const links = await ctx.db.query("note_pdf_links").collect();
    const counts: Record<string, number> = {};
    links.forEach((l) => {
      const id = l.itemId as string;
      if (idSet.has(id)) counts[id] = (counts[id] ?? 0) + 1;
    });
    return counts;
  },
});

// Public queries for mock test data
export const getMockTests = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("mock_tests").collect();
  },
});

export const getMockTestQuestions = query({
  args: { mockTestId: v.id("mock_tests") },
  handler: async (ctx, { mockTestId }) => {
    return ctx.db
      .query("mock_test_questions")
      .withIndex("by_mock_test", (q: any) => q.eq("mockTestId", mockTestId))
      .collect();
  },
});

// One-shot migration: rename noteItemId → note_item_id in attached_quizzes
// and quizId → quiz_id in quiz_questions
export const migrateAttachedQuizzes = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("attached_quizzes").collect();
    let migratedQuizzes = 0;
    for (const row of rows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacy = (row as any).noteItemId;
      if (legacy && !(row as any).note_item_id) {
        await ctx.db.patch(row._id, {
          note_item_id: legacy,
          noteItemId: undefined,
        } as any);
        migratedQuizzes++;
      }
    }

    const questions = await ctx.db.query("quiz_questions").collect();
    let migratedQuestions = 0;
    for (const row of questions) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacy = (row as any).quizId;
      if (legacy && !(row as any).quiz_id) {
        await ctx.db.patch(row._id, {
          quiz_id: legacy,
          quizId: undefined,
        } as any);
        migratedQuestions++;
      }
    }

    return { migratedQuizzes, migratedQuestions };
  },
});
