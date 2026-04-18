import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, getAuthUser } from "./authHelpers";

// Called automatically by Convex Auth when a new user signs up or logs in.
// Maps the auth identity to our custom users table.
export const createOrUpdateUser = mutation({
  args: {
    email: v.string(),
    username: v.optional(v.string()),
    full_name: v.optional(v.string()),
    avatar_url: v.optional(v.string()),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();

    if (existing) {
      // Update avatar/name on re-login (e.g. Google profile pic change)
      await ctx.db.patch(existing._id, {
        avatar_url: args.avatar_url ?? existing.avatar_url,
        full_name: args.full_name ?? existing.full_name,
      });
      return existing._id;
    }

    const username =
      args.username ??
      args.email.split("@")[0].replace(/[^a-z0-9_]/gi, "_").toLowerCase();

    return ctx.db.insert("users", {
      email: args.email,
      username,
      full_name: args.full_name,
      avatar_url: args.avatar_url,
      total_coins: 0,
      streak_count: 0,
      longest_streak: 0,
      dark_mode: false,
      tokenIdentifier: args.tokenIdentifier,
    });
  },
});

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    return getAuthUser(ctx);
  },
});

export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db.get(userId);
  },
});

export const updateCoins = mutation({
  args: { delta: v.number() },
  handler: async (ctx, { delta }) => {
    const user = await requireAuth(ctx);
    await ctx.db.patch(user._id, {
      total_coins: Math.max(0, user.total_coins + delta),
    });
  },
});

export const updateProfile = mutation({
  args: {
    username: v.optional(v.string()),
    full_name: v.optional(v.string()),
    avatar_url: v.optional(v.string()),
    dark_mode: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const patch: Record<string, unknown> = {};
    if (args.username !== undefined) patch.username = args.username;
    if (args.full_name !== undefined) patch.full_name = args.full_name;
    if (args.avatar_url !== undefined) patch.avatar_url = args.avatar_url;
    if (args.dark_mode !== undefined) patch.dark_mode = args.dark_mode;
    await ctx.db.patch(user._id, patch);
  },
});
