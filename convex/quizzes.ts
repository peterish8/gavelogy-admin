import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getAllSubjects = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("subjects").collect();
  },
});

export const getQuiz = query({
  args: { quizId: v.id("standalone_quizzes") },
  handler: async (ctx, { quizId }) => {
    return await ctx.db.get(quizId);
  },
});

export const getQuizWithQuestions = query({
  args: { quizId: v.id("standalone_quizzes") },
  handler: async (ctx, { quizId }) => {
    const quiz = await ctx.db.get(quizId);
    if (!quiz) return null;
    const questions = await ctx.db
      .query("standalone_questions")
      .withIndex("by_quiz", (q) => q.eq("quiz_id", quizId))
      .collect();
    questions.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    return { quiz, questions };
  },
});

export const getAllStandaloneQuizzes = query({
  args: {},
  handler: async (ctx) => {
    const quizzes = await ctx.db.query("standalone_quizzes").collect();
    return await Promise.all(
      quizzes.map(async (quiz) => {
        const subject = quiz.subject_id ? await ctx.db.get(quiz.subject_id) : null;
        return { ...quiz, subject };
      })
    );
  },
});

export const createQuiz = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    subject_id: v.optional(v.id("subjects")),
    order_index: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("standalone_quizzes", args);
  },
});

export const updateQuiz = mutation({
  args: {
    quizId: v.id("standalone_quizzes"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    subject_id: v.optional(v.id("subjects")),
    order_index: v.optional(v.number()),
  },
  handler: async (ctx, { quizId, ...patch }) => {
    const cleaned: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) cleaned[k] = val;
    }
    await ctx.db.patch(quizId, cleaned);
  },
});

export const createQuestion = mutation({
  args: {
    quiz_id: v.id("standalone_quizzes"),
    question_text: v.string(),
    option_a: v.optional(v.string()),
    option_b: v.optional(v.string()),
    option_c: v.optional(v.string()),
    option_d: v.optional(v.string()),
    correct_answer: v.string(),
    explanation: v.optional(v.string()),
    order_index: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("standalone_questions", args);
  },
});

export const updateQuestion = mutation({
  args: {
    questionId: v.id("standalone_questions"),
    question_text: v.optional(v.string()),
    option_a: v.optional(v.string()),
    option_b: v.optional(v.string()),
    option_c: v.optional(v.string()),
    option_d: v.optional(v.string()),
    correct_answer: v.optional(v.string()),
    explanation: v.optional(v.string()),
    order_index: v.optional(v.number()),
  },
  handler: async (ctx, { questionId, ...patch }) => {
    const cleaned: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) cleaned[k] = val;
    }
    await ctx.db.patch(questionId, cleaned);
  },
});

export const deleteQuestion = mutation({
  args: { questionId: v.id("standalone_questions") },
  handler: async (ctx, { questionId }) => {
    await ctx.db.delete(questionId);
  },
});
