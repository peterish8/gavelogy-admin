import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./authHelpers";

// ─── Daily Activity ───────────────────────────────────────────────────────

export const getDailyActivity = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, { date }) => {
    const user = await requireAuth(ctx);
    if (date) {
      return ctx.db
        .query("daily_activity")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", user._id).eq("activity_date", date)
        )
        .unique();
    }
    return ctx.db
      .query("daily_activity")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const upsertDailyActivity = mutation({
  args: {
    activity_date: v.string(),
    quizzes_completed: v.optional(v.number()),
    mocks_completed: v.optional(v.number()),
    mistakes_cleared: v.optional(v.number()),
    time_spent: v.optional(v.number()),
    coins_earned: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const existing = await ctx.db
      .query("daily_activity")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("activity_date", args.activity_date)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        quizzes_completed:
          existing.quizzes_completed + (args.quizzes_completed ?? 0),
        mocks_completed:
          existing.mocks_completed + (args.mocks_completed ?? 0),
        mistakes_cleared:
          existing.mistakes_cleared + (args.mistakes_cleared ?? 0),
        time_spent: existing.time_spent + (args.time_spent ?? 0),
        coins_earned: existing.coins_earned + (args.coins_earned ?? 0),
      });
    } else {
      await ctx.db.insert("daily_activity", {
        userId: user._id,
        activity_date: args.activity_date,
        quizzes_completed: args.quizzes_completed ?? 0,
        mocks_completed: args.mocks_completed ?? 0,
        mistakes_cleared: args.mistakes_cleared ?? 0,
        time_spent: args.time_spent ?? 0,
        coins_earned: args.coins_earned ?? 0,
      });
    }
  },
});

// ─── Subject Performance ──────────────────────────────────────────────────

export const getSubjectPerformance = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    return ctx.db
      .query("subject_performance")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const upsertSubjectPerformance = mutation({
  args: {
    subjectId: v.string(),
    total_attempts: v.number(),
    total_correct: v.number(),
    total_questions: v.number(),
    average_accuracy: v.number(),
    average_time_per_question: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const existing = await ctx.db
      .query("subject_performance")
      .withIndex("by_user_subject", (q) =>
        q.eq("userId", user._id).eq("subjectId", args.subjectId)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("subject_performance", { userId: user._id, ...args });
    }
  },
});

// ─── Weekly Performance ───────────────────────────────────────────────────

export const getWeeklyPerformance = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    return ctx.db
      .query("weekly_performance")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

// ─── Activity Log ─────────────────────────────────────────────────────────

export const logActivity = mutation({
  args: {
    activity_type: v.union(
      v.literal("quiz"),
      v.literal("mock"),
      v.literal("mistake_quiz"),
      v.literal("explanation_viewed")
    ),
    activity_id: v.optional(v.string()),
    subject: v.optional(v.string()),
    duration: v.optional(v.number()),
    coins_earned: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    return ctx.db.insert("activity_log", {
      userId: user._id,
      ...args,
    });
  },
});
