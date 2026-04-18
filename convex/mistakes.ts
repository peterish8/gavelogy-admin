import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./authHelpers";

export const getMistakes = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    return ctx.db
      .query("mistakes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const upsertMistake = mutation({
  args: {
    questionId: v.string(),
    subjectId: v.optional(v.string()),
    source_type: v.union(v.literal("quiz"), v.literal("mock")),
    source_id: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const existing = await ctx.db
      .query("mistakes")
      .withIndex("by_user_question", (q) =>
        q.eq("userId", user._id).eq("questionId", args.questionId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        review_count: existing.review_count + 1,
      });
      return existing._id;
    }

    return ctx.db.insert("mistakes", {
      userId: user._id,
      questionId: args.questionId,
      subjectId: args.subjectId,
      review_count: 1,
      source_type: args.source_type,
      source_id: args.source_id,
      is_mastered: false,
    });
  },
});

export const incrementRetakeCounts = mutation({
  args: { questionIds: v.array(v.string()) },
  handler: async (ctx, { questionIds }) => {
    const user = await requireAuth(ctx);
    for (const questionId of questionIds) {
      const mistake = await ctx.db
        .query("mistakes")
        .withIndex("by_user_question", (q) =>
          q.eq("userId", user._id).eq("questionId", questionId)
        )
        .unique();
      if (mistake) {
        const newCount = mistake.review_count + 1;
        await ctx.db.patch(mistake._id, {
          review_count: newCount,
          is_mastered: newCount >= 2,
        });
      }
    }
  },
});

export const markMastered = mutation({
  args: { mistakeId: v.id("mistakes") },
  handler: async (ctx, { mistakeId }) => {
    const user = await requireAuth(ctx);
    const mistake = await ctx.db.get(mistakeId);
    if (!mistake || mistake.userId !== user._id) throw new Error("Not found");
    await ctx.db.patch(mistakeId, { is_mastered: true });
  },
});

export const deleteMistake = mutation({
  args: { mistakeId: v.id("mistakes") },
  handler: async (ctx, { mistakeId }) => {
    const user = await requireAuth(ctx);
    const mistake = await ctx.db.get(mistakeId);
    if (!mistake || mistake.userId !== user._id) throw new Error("Not found");
    await ctx.db.delete(mistakeId);
  },
});
