import { mutation, query, action } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./authHelpers";
import { api } from "./_generated/api";

export const hasMemoryStates = query({
  args: { quizId: v.id("attached_quizzes") },
  handler: async (ctx, { quizId }) => {
    const user = await requireAuth(ctx);
    const record = await ctx.db
      .query("question_memory_states")
      .withIndex("by_user_quiz", (q) =>
        q.eq("userId", user._id).eq("quizId", quizId)
      )
      .first();
    return !!record;
  },
});

export const getMemoryStates = query({
  args: { quizId: v.id("attached_quizzes") },
  handler: async (ctx, { quizId }) => {
    const user = await requireAuth(ctx);
    return ctx.db
      .query("question_memory_states")
      .withIndex("by_user_quiz", (q) =>
        q.eq("userId", user._id).eq("quizId", quizId)
      )
      .collect();
  },
});

export const classifyQuestionsAfterQuiz = mutation({
  args: {
    quizId: v.id("attached_quizzes"),
    results: v.array(
      v.object({
        questionId: v.string(),
        is_correct: v.boolean(),
        confidence: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();

    for (const result of args.results) {
      // Bucket assignment: correct+confident=A, correct+guess=B, correct+fluke=C,
      // wrong+confident=D, wrong+guess=E, wrong+fluke=F
      let bucket: "A" | "B" | "C" | "D" | "E" | "F" = "E";
      if (result.is_correct) {
        if (result.confidence === "confident") bucket = "A";
        else if (result.confidence === "guess") bucket = "B";
        else bucket = "C";
      } else {
        if (result.confidence === "confident") bucket = "D";
        else if (result.confidence === "guess") bucket = "E";
        else bucket = "F";
      }

      const existing = await ctx.db
        .query("question_memory_states")
        .withIndex("by_user_quiz_question", (q) =>
          q
            .eq("userId", user._id)
            .eq("quizId", args.quizId)
            .eq("questionId", result.questionId)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          bucket,
          times_shown: existing.times_shown + 1,
          times_correct: existing.times_correct + (result.is_correct ? 1 : 0),
          last_was_wrong: !result.is_correct,
          last_shown_at: now,
          last_confidence: result.confidence,
        });
      } else {
        await ctx.db.insert("question_memory_states", {
          userId: user._id,
          quizId: args.quizId,
          questionId: result.questionId,
          bucket,
          times_shown: 1,
          times_correct: result.is_correct ? 1 : 0,
          last_was_wrong: !result.is_correct,
          last_shown_at: now,
          last_confidence: result.confidence,
        });
      }
    }
  },
});

export const updateMemoryStateAfterReview = mutation({
  args: {
    quizId: v.id("attached_quizzes"),
    questionId: v.string(),
    is_correct: v.boolean(),
    confidence: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();

    const state = await ctx.db
      .query("question_memory_states")
      .withIndex("by_user_quiz_question", (q) =>
        q
          .eq("userId", user._id)
          .eq("quizId", args.quizId)
          .eq("questionId", args.questionId)
      )
      .unique();

    if (!state) return;

    // Move bucket up on correct, down on wrong
    const buckets = ["A", "B", "C", "D", "E", "F"] as const;
    const currentIdx = buckets.indexOf(state.bucket);
    let newIdx = currentIdx;
    if (args.is_correct) newIdx = Math.max(0, currentIdx - 1);
    else newIdx = Math.min(buckets.length - 1, currentIdx + 1);

    await ctx.db.patch(state._id, {
      bucket: buckets[newIdx],
      times_shown: state.times_shown + 1,
      times_correct: state.times_correct + (args.is_correct ? 1 : 0),
      last_was_wrong: !args.is_correct,
      last_shown_at: now,
      last_confidence: args.confidence,
    });
  },
});

export const getSchedule = query({
  args: { quizId: v.id("attached_quizzes") },
  handler: async (ctx, { quizId }) => {
    const user = await requireAuth(ctx);
    return ctx.db
      .query("spaced_repetition_schedules")
      .withIndex("by_user_quiz", (q) =>
        q.eq("userId", user._id).eq("quizId", quizId)
      )
      .unique();
  },
});

export const upsertSchedule = mutation({
  args: {
    quizId: v.id("attached_quizzes"),
    current_stage_index: v.number(),
    next_due_at: v.optional(v.string()),
    last_completed_at: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("archived")
    ),
    meta_stats: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const existing = await ctx.db
      .query("spaced_repetition_schedules")
      .withIndex("by_user_quiz", (q) =>
        q.eq("userId", user._id).eq("quizId", args.quizId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        current_stage_index: args.current_stage_index,
        next_due_at: args.next_due_at,
        last_completed_at: args.last_completed_at,
        status: args.status,
        meta_stats: args.meta_stats,
      });
      return existing._id;
    }

    return ctx.db.insert("spaced_repetition_schedules", {
      userId: user._id,
      quizId: args.quizId,
      current_stage_index: args.current_stage_index,
      next_due_at: args.next_due_at,
      last_completed_at: args.last_completed_at,
      status: args.status,
      meta_stats: args.meta_stats,
    });
  },
});

export const getDueSchedules = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();
    const schedules = await ctx.db
      .query("spaced_repetition_schedules")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return schedules.filter(
      (s) =>
        s.status === "active" && s.next_due_at && s.next_due_at <= now
    );
  },
});

// Returns active schedules enriched with quiz title + courseId for dashboard display
export const getActiveSchedules = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const schedules = await ctx.db
      .query("spaced_repetition_schedules")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const enriched = await Promise.all(
      schedules.map(async (s) => {
        const quiz = await ctx.db.get(s.quizId);
        const noteItem = quiz?.noteItemId ? await ctx.db.get(quiz.noteItemId) : null;
        return {
          ...s,
          quiz: {
            title: quiz?.title ?? "",
            id: quiz?._id ?? s.quizId,
            note_item_id: quiz?.noteItemId ?? "",
            course_id: noteItem?.courseId ?? "",
          },
        };
      })
    );
    return enriched;
  },
});
