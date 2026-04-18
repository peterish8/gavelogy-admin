import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getAllPyqTests = query({
  args: {},
  handler: async (ctx) => {
    const tests = await ctx.db.query("pyq_tests").order("desc").collect();
    return await Promise.all(
      tests.map(async (test) => {
        const questions = await ctx.db
          .query("pyq_questions")
          .withIndex("by_test", (q) => q.eq("test_id", test._id))
          .collect();
        return { ...test, question_count: questions.length };
      })
    );
  },
});

export const getPyqTest = query({
  args: { testId: v.id("pyq_tests") },
  handler: async (ctx, { testId }) => {
    return await ctx.db.get(testId);
  },
});

export const getPyqPassages = query({
  args: { testId: v.id("pyq_tests") },
  handler: async (ctx, { testId }) => {
    return await ctx.db
      .query("pyq_passages")
      .withIndex("by_test", (q) => q.eq("test_id", testId))
      .collect();
  },
});

export const getPyqQuestions = query({
  args: { testId: v.id("pyq_tests") },
  handler: async (ctx, { testId }) => {
    return await ctx.db
      .query("pyq_questions")
      .withIndex("by_test", (q) => q.eq("test_id", testId))
      .collect();
  },
});

export const deletePyqTest = mutation({
  args: { testId: v.id("pyq_tests") },
  handler: async (ctx, { testId }) => {
    const passages = await ctx.db
      .query("pyq_passages")
      .withIndex("by_test", (q) => q.eq("test_id", testId))
      .collect();
    for (const p of passages) await ctx.db.delete(p._id);

    const questions = await ctx.db
      .query("pyq_questions")
      .withIndex("by_test", (q) => q.eq("test_id", testId))
      .collect();
    for (const q of questions) await ctx.db.delete(q._id);

    await ctx.db.delete(testId);
  },
});

const passageInputSchema = v.object({
  client_passage_id: v.string(),
  passage_text: v.string(),
  citation: v.optional(v.string()),
  section_number: v.optional(v.string()),
  subject: v.optional(v.string()),
  order_index: v.optional(v.number()),
});

const questionInputSchema = v.object({
  client_passage_id: v.optional(v.string()),
  question_text: v.string(),
  option_a: v.optional(v.string()),
  option_b: v.optional(v.string()),
  option_c: v.optional(v.string()),
  option_d: v.optional(v.string()),
  correct_answer: v.optional(v.string()),
  explanation: v.optional(v.string()),
  marks: v.optional(v.number()),
  question_type: v.optional(v.string()),
  subject: v.optional(v.string()),
  order_index: v.optional(v.number()),
});

async function insertBundle(
  ctx: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  testId: string,
  passages: Array<{ client_passage_id: string; passage_text: string; [key: string]: unknown }>,
  questions: Array<{ client_passage_id?: string; question_text: string; [key: string]: unknown }>
) {
  const passageIdMap = new Map<string, string>();
  for (let i = 0; i < passages.length; i++) {
    const { client_passage_id, ...rest } = passages[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = await ctx.db.insert("pyq_passages", { test_id: testId as any, ...rest, order_index: i });
    passageIdMap.set(client_passage_id, id);
  }
  for (let i = 0; i < questions.length; i++) {
    const { client_passage_id, ...rest } = questions[i];
    await ctx.db.insert("pyq_questions", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      test_id: testId as any,
      passage_id: client_passage_id ? passageIdMap.get(client_passage_id) : undefined,
      ...rest,
      order_index: i,
    });
  }
}

export const createPyqTestWithBundle = mutation({
  args: {
    title: v.string(),
    exam_name: v.optional(v.string()),
    year: v.optional(v.number()),
    duration_minutes: v.optional(v.number()),
    total_marks: v.optional(v.number()),
    negative_marking: v.optional(v.number()),
    instructions: v.optional(v.string()),
    is_published: v.optional(v.boolean()),
    passages: v.array(passageInputSchema),
    questions: v.array(questionInputSchema),
  },
  handler: async (ctx, { passages, questions, ...testData }) => {
    const testId = await ctx.db.insert("pyq_tests", testData);
    await insertBundle(ctx, testId, passages, questions);
    return testId;
  },
});

export const savePyqBundle = mutation({
  args: {
    testId: v.id("pyq_tests"),
    testMeta: v.optional(
      v.object({
        title: v.optional(v.string()),
        exam_name: v.optional(v.string()),
        year: v.optional(v.number()),
        duration_minutes: v.optional(v.number()),
        total_marks: v.optional(v.number()),
        negative_marking: v.optional(v.number()),
        instructions: v.optional(v.string()),
        is_published: v.optional(v.boolean()),
      })
    ),
    passages: v.array(passageInputSchema),
    questions: v.array(questionInputSchema),
  },
  handler: async (ctx, { testId, testMeta, passages, questions }) => {
    if (testMeta) {
      const patch: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(testMeta)) {
        if (val !== undefined) patch[k] = val;
      }
      await ctx.db.patch(testId, patch);
    }

    const oldPassages = await ctx.db
      .query("pyq_passages")
      .withIndex("by_test", (q) => q.eq("test_id", testId))
      .collect();
    for (const p of oldPassages) await ctx.db.delete(p._id);

    const oldQuestions = await ctx.db
      .query("pyq_questions")
      .withIndex("by_test", (q) => q.eq("test_id", testId))
      .collect();
    for (const q of oldQuestions) await ctx.db.delete(q._id);

    await insertBundle(ctx, testId, passages, questions);
  },
});
