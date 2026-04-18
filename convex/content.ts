import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireAuth, getAuthUser } from "./authHelpers";

// ─── Courses ──────────────────────────────────────────────────────────────

export const getCourses = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, { activeOnly = true }) => {
    const all = await ctx.db.query("courses").collect();
    return activeOnly ? all.filter((c) => c.is_active) : all;
  },
});

export const getCourseByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const all = await ctx.db.query("courses").collect();
    return all.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? null;
  },
});

// ─── Structure Items ──────────────────────────────────────────────────────

export const getStructureItemsByCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    return ctx.db
      .query("structure_items")
      .withIndex("by_course", (q) => q.eq("courseId", courseId))
      .collect();
  },
});

export const getStructureItemsByParent = query({
  args: { parentId: v.id("structure_items") },
  handler: async (ctx, { parentId }) => {
    return ctx.db
      .query("structure_items")
      .withIndex("by_parent", (q) => q.eq("parentId", parentId))
      .collect();
  },
});

export const getStructureItem = query({
  args: { itemId: v.id("structure_items") },
  handler: async (ctx, { itemId }) => {
    return ctx.db.get(itemId);
  },
});

export const updateStructureItemPdf = mutation({
  args: { itemId: v.id("structure_items"), pdf_url: v.string() },
  handler: async (ctx, { itemId, pdf_url }) => {
    await requireAuth(ctx);
    await ctx.db.patch(itemId, { pdf_url });
  },
});

// ─── Note Contents ────────────────────────────────────────────────────────

export const getNoteContent = query({
  args: { itemId: v.id("structure_items") },
  handler: async (ctx, { itemId }) => {
    return ctx.db
      .query("note_contents")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .unique();
  },
});

export const getJudgmentReaderData = query({
  args: { itemId: v.id("structure_items") },
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get(itemId);
    if (!item) return null;

    const [note, links, quizzes] = await Promise.all([
      ctx.db
        .query("note_contents")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .unique(),
      ctx.db
        .query("note_pdf_links")
        .withIndex("by_item", (q) => q.eq("itemId", itemId))
        .collect(),
      ctx.db
        .query("attached_quizzes")
        .withIndex("by_note_item", (q) => q.eq("noteItemId", itemId))
        .collect(),
    ]);

    const quizzesWithQuestions = await Promise.all(
      [...quizzes]
        .sort((a, b) => a._creationTime - b._creationTime)
        .map(async (quiz) => {
          const questions = await ctx.db
            .query("quiz_questions")
            .withIndex("by_quiz", (q) => q.eq("quizId", quiz._id))
            .collect();

          return {
            _id: quiz._id,
            title: quiz.title,
            questions: questions.sort(
              (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
            ),
          };
        })
    );

    return {
      title: item.title,
      pdf_url: item.pdf_url ?? null,
      content_html: note?.content_html ?? "",
      flashcards_json: note?.flashcards_json ?? null,
      links,
      quizzes: quizzesWithQuestions,
    };
  },
});

export const updateNoteContent = mutation({
  args: { itemId: v.id("structure_items"), content_html: v.string() },
  handler: async (ctx, { itemId, content_html }) => {
    await requireAuth(ctx);
    const existing = await ctx.db
      .query("note_contents")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { content_html });
    } else {
      await ctx.db.insert("note_contents", { itemId, content_html });
    }
  },
});

export const searchContent = query({
  args: { query: v.string() },
  handler: async (ctx, { query: q }) => {
    return ctx.db
      .query("note_contents")
      .withSearchIndex("search_content", (sq) => sq.search("content_html", q))
      .collect();
  },
});

// ─── PDF Links ────────────────────────────────────────────────────────────

export const getNotePdfLinks = query({
  args: { itemId: v.id("structure_items") },
  handler: async (ctx, { itemId }) => {
    return ctx.db
      .query("note_pdf_links")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .collect();
  },
});

// Returns item_id -> count map for all note_pdf_links (admin use)
export const getNotePdfLinkCounts = query({
  args: {},
  handler: async (ctx) => {
    const links = await ctx.db.query("note_pdf_links").collect();
    const counts: Record<string, number> = {};
    links.forEach((l) => {
      counts[l.itemId as string] = (counts[l.itemId as string] ?? 0) + 1;
    });
    return counts;
  },
});

export const createNotePdfLink = mutation({
  args: {
    itemId: v.id("structure_items"),
    link_id: v.string(),
    pdf_page: v.number(),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return ctx.db.insert("note_pdf_links", args);
  },
});

export const deleteNotePdfLink = mutation({
  args: { linkId: v.id("note_pdf_links") },
  handler: async (ctx, { linkId }) => {
    await requireAuth(ctx);
    await ctx.db.delete(linkId);
  },
});

// ─── Attached Quizzes & Questions ─────────────────────────────────────────

export const getAttachedQuizzes = query({
  args: { noteItemId: v.optional(v.id("structure_items")) },
  handler: async (ctx, { noteItemId }) => {
    if (noteItemId) {
      return ctx.db
        .query("attached_quizzes")
        .withIndex("by_note_item", (q) => q.eq("noteItemId", noteItemId))
        .collect();
    }
    return ctx.db.query("attached_quizzes").collect();
  },
});

export const getAttachedQuizById = query({
  args: { quizId: v.id("attached_quizzes") },
  handler: async (ctx, { quizId }) => ctx.db.get(quizId),
});

export const getQuizQuestions = query({
  args: { quizId: v.id("attached_quizzes") },
  handler: async (ctx, { quizId }) => {
    return ctx.db
      .query("quiz_questions")
      .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
      .collect();
  },
});

export const getQuizQuestionsByIds = query({
  args: { questionIds: v.array(v.string()) },
  handler: async (ctx, { questionIds }) => {
    const all = await ctx.db.query("quiz_questions").collect();
    return all.filter((q) => questionIds.includes(q._id));
  },
});

// Returns a shuffled sample of questions enriched with case title/passage for game modes
export const getRandomGameQuestions = query({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    const allQuestions = await ctx.db.query("quiz_questions").collect();
    if (!allQuestions.length) return [];

    // Shuffle and pick
    const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);

    // Enrich with quiz/note context
    const enriched = await Promise.all(
      selected.map(async (q) => {
        const quiz = q.quizId ? await ctx.db.get(q.quizId) : null;
        const noteItem = quiz?.noteItemId ? await ctx.db.get(quiz.noteItemId) : null;
        const noteContent = noteItem
          ? await ctx.db
              .query("note_contents")
              .withIndex("by_item", (qb) => qb.eq("itemId", noteItem._id))
              .first()
          : null;
        const passage = noteContent?.content_html
          ? noteContent.content_html.replace(/<[^>]*>?/gm, "").substring(0, 1000)
          : "";
        return {
          ...q,
          title: noteItem?.title ?? "Unknown Case",
          passage,
          correctAnswer: q.correct_answer,
        };
      })
    );
    return enriched;
  },
});

// ─── User Completed Items ─────────────────────────────────────────────────

export const getCompletedItems = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) return [];
    return ctx.db
      .query("user_completed_items")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const markItemCompleted = mutation({
  args: {
    itemId: v.id("structure_items"),
    courseId: v.optional(v.id("courses")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const existing = await ctx.db
      .query("user_completed_items")
      .withIndex("by_user_item", (q) =>
        q.eq("userId", user._id).eq("itemId", args.itemId)
      )
      .unique();
    if (existing) return existing._id;
    return ctx.db.insert("user_completed_items", {
      userId: user._id,
      itemId: args.itemId,
      courseId: args.courseId,
      completed_at: new Date().toISOString(),
    });
  },
});

export const unmarkItemCompleted = mutation({
  args: { itemId: v.id("structure_items") },
  handler: async (ctx, { itemId }) => {
    const user = await requireAuth(ctx);
    const existing = await ctx.db
      .query("user_completed_items")
      .withIndex("by_user_item", (q) =>
        q.eq("userId", user._id).eq("itemId", itemId)
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

// ─── Contemporary Cases ───────────────────────────────────────────────────

export const getContemporaryCases = query({
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
    return ctx.db
      .query("contemporary_cases")
      .withIndex("by_year_month", (q) => q.eq("year", year))
      .collect();
  },
});

export const getCaseQuestions = query({
  args: { caseId: v.id("contemporary_cases") },
  handler: async (ctx, { caseId }) => {
    return ctx.db
      .query("contemporary_case_questions")
      .withIndex("by_case", (q) => q.eq("caseId", caseId))
      .collect();
  },
});

// Returns accessible courses with folder structure and question counts for Speed Court
export const getUserCoursesWithFolders = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const userCourses = await ctx.db
      .query("user_courses")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const courseIds = new Set(userCourses.map((uc) => uc.courseId));
    const allCourses = await ctx.db.query("courses").collect();
    const courses = allCourses.filter((c) => c.is_active && (c.is_free || courseIds.has(c._id)));

    const result = await Promise.all(
      courses.map(async (course) => {
        const items = await ctx.db
          .query("structure_items")
          .withIndex("by_course", (q) => q.eq("courseId", course._id))
          .filter((q) => q.neq(q.field("is_active"), false))
          .collect();

        const itemIds = new Set(items.map((i) => i._id));
        const allQuizzes = await ctx.db.query("attached_quizzes").collect();
        const quizzes = allQuizzes.filter((q) => itemIds.has(q.noteItemId as never));

        const quizIds = new Set(quizzes.map((q) => q._id));
        const allQuestions = await ctx.db.query("quiz_questions").collect();

        const quizToItem: Record<string, string> = {};
        quizzes.forEach((q) => { quizToItem[q._id] = q.noteItemId as string; });

        const questionCounts: Record<string, number> = {};
        allQuestions
          .filter((q) => quizIds.has(q.quizId as never))
          .forEach((q) => {
            const itemId = quizToItem[q.quizId as string];
            if (itemId) questionCounts[itemId] = (questionCounts[itemId] ?? 0) + 1;
          });

        return {
          courseId: course._id,
          courseName: course.name,
          folders: items.map((i) => ({
            id: i._id,
            title: i.title,
            parentId: i.parentId ?? null,
            questionCount: questionCounts[i._id] ?? 0,
          })),
        };
      })
    );

    return result;
  },
});

// Returns questions for specific folder IDs (Speed Court)
export const getSpeedCourtQuestions = query({
  args: { folderIds: v.array(v.string()) },
  handler: async (ctx, { folderIds }) => {
    if (!folderIds.length) return [];

    const folderIdSet = new Set(folderIds);
    const allQuizzes = await ctx.db.query("attached_quizzes").collect();
    const quizzes = allQuizzes.filter((q) => folderIdSet.has(q.noteItemId as string));
    if (!quizzes.length) return [];

    const quizIdSet = new Set(quizzes.map((q) => q._id));
    const quizToItem: Record<string, string> = {};
    quizzes.forEach((q) => { quizToItem[q._id] = q.noteItemId as string; });

    const allQuestions = await ctx.db.query("quiz_questions").collect();
    const questions = allQuestions.filter((q) => quizIdSet.has(q.quizId as never));

    const itemIds = [...new Set(Object.values(quizToItem))];
    const items = await Promise.all(itemIds.map((id) => ctx.db.get(id as never)));
    const titleMap: Record<string, string> = {};
    items.forEach((item) => {
      if (item) titleMap[item._id] = (item as Doc<"structure_items">).title;
    });

    return questions.map((q) => ({
      id: q._id,
      text: q.question_text,
      options: q.options,
      correctAnswer: q.correct_answer,
      explanation: q.explanation,
      title: titleMap[quizToItem[q.quizId as string]] ?? undefined,
    }));
  },
});

// Returns all searchable content (courses, items, quizzes) scoped to user's accessible courses
export const getSearchableContent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) return { courses: [], items: [], quizzes: [] };

    const allCourses = await ctx.db.query("courses").collect();
    const activeCourses = allCourses.filter((c) => c.is_active);
    const activeCourseIds = new Set(activeCourses.map((c) => c._id));

    const allItems = await ctx.db.query("structure_items").collect();
    const items = allItems.filter((i) => i.courseId != null && activeCourseIds.has(i.courseId));

    const noteItemIds = new Set(
      items
        .filter((i) => ["note", "lesson", "file"].includes(i.item_type ?? ""))
        .map((i) => i._id)
    );

    const allQuizzes = await ctx.db.query("attached_quizzes").collect();
    const quizzes = allQuizzes.filter((q) => noteItemIds.has(q.noteItemId as never));

    return { courses: activeCourses, items, quizzes };
  },
});
