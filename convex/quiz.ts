import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./authHelpers";
import { Id } from "./_generated/dataModel";

export const saveAttempt = mutation({
  args: {
    quizId: v.id("attached_quizzes"),
    score: v.number(),
    total_questions: v.number(),
    time_taken: v.number(),
    answers: v.array(
      v.object({
        questionId: v.string(),
        selected_answer: v.string(),
        confidence: v.union(
          v.literal("confident"),
          v.literal("guess"),
          v.literal("fluke")
        ),
        is_correct: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();

    const attemptId = await ctx.db.insert("quiz_attempts", {
      userId: user._id,
      quizId: args.quizId,
      score: args.score,
      total_questions: args.total_questions,
      time_taken: args.time_taken,
      completed_at: now,
    });

    for (const answer of args.answers) {
      await ctx.db.insert("quiz_answers", {
        attemptId,
        questionId: answer.questionId,
        selected_answer: answer.selected_answer,
        confidence: answer.confidence,
        is_correct: answer.is_correct,
      });
    }

    return attemptId;
  },
});

export const saveConfidence = mutation({
  args: {
    quizId: v.optional(v.id("attached_quizzes")),
    questionId: v.optional(v.string()),
    confidence_level: v.string(),
    answer_was_correct: v.boolean(),
    is_initial_attempt: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    return ctx.db.insert("quiz_answer_confidence", {
      userId: user._id,
      quizId: args.quizId,
      questionId: args.questionId,
      confidence_level: args.confidence_level,
      answer_was_correct: args.answer_was_correct,
      is_initial_attempt: args.is_initial_attempt,
    });
  },
});

export const getAttempts = query({
  args: { quizId: v.optional(v.id("attached_quizzes")) },
  handler: async (ctx, { quizId }) => {
    const user = await requireAuth(ctx);
    const q = quizId
      ? ctx.db
          .query("quiz_attempts")
          .withIndex("by_user_quiz", (qb) =>
            qb.eq("userId", user._id).eq("quizId", quizId)
          )
      : ctx.db
          .query("quiz_attempts")
          .withIndex("by_user", (qb) => qb.eq("userId", user._id));
    return q.order("desc").collect();
  },
});

export const getAttemptCount = query({
  args: { quizId: v.id("attached_quizzes") },
  handler: async (ctx, { quizId }) => {
    const user = await requireAuth(ctx);
    const attempts = await ctx.db
      .query("quiz_attempts")
      .withIndex("by_user_quiz", (q) =>
        q.eq("userId", user._id).eq("quizId", quizId)
      )
      .collect();
    return attempts.length;
  },
});

export const getDayHistory = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const user = await requireAuth(ctx);
    const attempts = await ctx.db
      .query("quiz_attempts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return attempts.filter((a) => a.completed_at.startsWith(date));
  },
});

export const getAttemptsEnriched = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const attempts = await ctx.db
      .query("quiz_attempts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    const uniqueQuizIds = [...new Set(attempts.map((a) => a.quizId))];
    const quizInfoMap = new Map<string, { title: string; subject: string }>();

    for (const qId of uniqueQuizIds) {
      const quiz = await ctx.db.get(qId);
      if (!quiz) {
        quizInfoMap.set(qId, { title: "Quiz", subject: "Course Quiz" });
        continue;
      }
      const title = quiz.title || "Untitled Quiz";
      let subject = "Course Quiz";
      if (quiz.noteItemId) {
        const noteItem = await ctx.db.get(quiz.noteItemId);
        if (noteItem?.parentId) {
          const parentItem = await ctx.db.get(noteItem.parentId);
          if (parentItem?.parentId) {
            const grandparent = await ctx.db.get(parentItem.parentId);
            subject = grandparent?.title || parentItem.title || subject;
          } else {
            subject = parentItem?.title || subject;
          }
        }
      }
      quizInfoMap.set(qId, { title, subject });
    }

    return attempts.map((a) => ({
      _id: a._id,
      _creationTime: a._creationTime,
      userId: a.userId,
      quizId: a.quizId,
      score: a.score,
      total_questions: a.total_questions,
      time_taken: a.time_taken,
      completed_at: a.completed_at,
      quizTitle: quizInfoMap.get(a.quizId)?.title ?? "Quiz",
      subject: quizInfoMap.get(a.quizId)?.subject ?? "Course Quiz",
    }));
  },
});

export const getItemAccuracy = query({
  args: { noteItemId: v.id("structure_items") },
  handler: async (ctx, { noteItemId }) => {
    const user = await requireAuth(ctx);

    // Primary path: look up quiz directly via by_note_item index
    const quiz = await ctx.db
      .query("attached_quizzes")
      .withIndex("by_note_item", (q) => q.eq("noteItemId", noteItemId))
      .first();

    let attempts;
    let resolvedQuizId: Id<"attached_quizzes"> | null = quiz?._id ?? null;
    let resolvedQuizTitle = quiz?.title ?? "Quiz";

    if (quiz) {
      // Fast path: quiz found via index, query attempts directly
      attempts = await ctx.db
        .query("quiz_attempts")
        .withIndex("by_user_quiz", (q) =>
          q.eq("userId", user._id).eq("quizId", quiz._id)
        )
        .collect();
    } else {
      // Fallback: quiz not found via by_note_item (noteItemId may be null in older records).
      // Scan all user attempts and filter to those whose attached_quizzes noteItemId matches.
      const allAttempts = await ctx.db
        .query("quiz_attempts")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();

      attempts = [];
      for (const attempt of allAttempts) {
        const aq = await ctx.db.get(attempt.quizId);
        if (aq?.noteItemId === noteItemId) {
          attempts.push(attempt);
        }
      }
    }

    // score is stored as a percentage (0–100), not a raw correct count
    const totalQuestions = attempts.reduce((s, a) => s + a.total_questions, 0);
    const totalCorrect = attempts.reduce(
      (s, a) => s + Math.round((a.score / 100) * a.total_questions),
      0
    );

    // If no quiz was found at all, return null so the UI shows "no quiz" not "0%"
    if (!resolvedQuizId) return null;

    return {
      quizId: resolvedQuizId,
      quizTitle: resolvedQuizTitle,
      correct: totalCorrect,
      total: totalQuestions,
      accuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
      attemptCount: attempts.length,
    };
  },
});

export const getConfidenceData = query({
  args: { quizId: v.optional(v.id("attached_quizzes")) },
  handler: async (ctx, { quizId }) => {
    const user = await requireAuth(ctx);
    if (quizId) {
      return ctx.db
        .query("quiz_answer_confidence")
        .withIndex("by_user_quiz", (q) =>
          q.eq("userId", user._id).eq("quizId", quizId)
        )
        .collect();
    }
    return ctx.db
      .query("quiz_answer_confidence")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});
