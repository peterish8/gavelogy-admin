import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./authHelpers";

export const getUserStreak = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    return ctx.db
      .query("user_streaks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const initUserStreak = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const user = await requireAuth(ctx);
    const existing = await ctx.db
      .query("user_streaks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) return existing._id;

    return ctx.db.insert("user_streaks", {
      userId: user._id,
      username,
      current_streak: 0,
      longest_streak: 0,
      total_score: 0,
      total_quizzes_completed: 0,
      total_cases_studied: 0,
      total_pyq_attempted: 0,
      bonuses_claimed: [],
    });
  },
});

export const awardStreakPoint = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const user = await requireAuth(ctx);
    const today = new Date().toISOString().split("T")[0];

    let streak = await ctx.db
      .query("user_streaks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (!streak) {
      const id = await ctx.db.insert("user_streaks", {
        userId: user._id,
        username,
        current_streak: 1,
        longest_streak: 1,
        last_activity_date: today,
        total_score: 1,
        total_quizzes_completed: 0,
        total_cases_studied: 0,
        total_pyq_attempted: 0,
        bonuses_claimed: [],
      });
      streak = (await ctx.db.get(id))!;
    }

    // Avoid double-awarding on same day
    if (streak.last_activity_date === today) {
      return { points_awarded: 0, new_streak: streak.current_streak };
    }

    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split("T")[0];
    const isConsecutive = streak.last_activity_date === yesterday;
    const new_streak = isConsecutive ? streak.current_streak + 1 : 1;
    const new_longest = Math.max(new_streak, streak.longest_streak);
    const points_awarded = 1 + (isConsecutive ? Math.floor(new_streak / 5) : 0);

    // Check for streak bonus
    const bonus = await ctx.db
      .query("streak_bonuses")
      .withIndex("by_streak_days", (q) => q.eq("streak_days", new_streak))
      .unique();
    const bonus_awarded = bonus?.bonus_points ?? 0;

    await ctx.db.patch(streak._id, {
      current_streak: new_streak,
      longest_streak: new_longest,
      last_activity_date: today,
      total_score: streak.total_score + points_awarded + bonus_awarded,
      bonuses_claimed: bonus
        ? [...(streak.bonuses_claimed ?? []), new_streak]
        : streak.bonuses_claimed,
    });

    // Update monthly + all-time points
    const monthKey = today.substring(0, 7) + "-01";
    const pointsRecord = await ctx.db
      .query("user_points")
      .withIndex("by_user_month", (q) =>
        q.eq("userId", user._id).eq("month", monthKey)
      )
      .unique();

    const total = points_awarded + bonus_awarded;
    if (pointsRecord) {
      await ctx.db.patch(pointsRecord._id, {
        monthly_points: pointsRecord.monthly_points + total,
        all_time_points: pointsRecord.all_time_points + total,
      });
    } else {
      await ctx.db.insert("user_points", {
        userId: user._id,
        username,
        month: monthKey,
        monthly_points: total,
        all_time_points: total,
      });
    }

    return { points_awarded: total, new_streak, badge_earned: bonus?.badge_name };
  },
});

export const getMonthlyLeaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 10 }) => {
    const monthKey = new Date().toISOString().substring(0, 7) + "-01";
    const records = await ctx.db
      .query("user_points")
      .withIndex("by_monthly_points", (q) => q.eq("month", monthKey))
      .order("desc")
      .take(limit);

    return records.map((r, i) => ({ ...r, rank: i + 1 }));
  },
});

export const getStreakBonuses = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("streak_bonuses").collect();
  },
});
