import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./authHelpers";

const MAX_DEVICES = 3;
const SESSION_TIMEOUT_MS = 90 * 60 * 1000; // 90 minutes

export const startSession = mutation({
  args: {
    device_id: v.string(),
    device_info: v.any(),
    ip_address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS).toISOString();

    // Count active sessions for this user (not logged out, recently active)
    const activeSessions = await ctx.db
      .query("user_sessions")
      .withIndex("by_user_active", (q) => q.eq("userId", user._id).eq("logged_out_at", undefined))
      .collect();

    const recentActive = activeSessions.filter(
      (s) => s.last_active_at > cutoff && s.device_id !== args.device_id
    );

    if (recentActive.length >= MAX_DEVICES) {
      throw new Error("DEVICE_LIMIT_REACHED: Maximum 3 devices allowed");
    }

    // Check if this device already has a session; reuse it
    const existingSession = activeSessions.find(
      (s) => s.device_id === args.device_id
    );
    if (existingSession) {
      await ctx.db.patch(existingSession._id, { last_active_at: now });
      return existingSession._id;
    }

    return ctx.db.insert("user_sessions", {
      userId: user._id,
      device_id: args.device_id,
      device_info: args.device_info,
      session_started_at: now,
      last_active_at: now,
      ip_address: args.ip_address,
    });
  },
});

export const heartbeatSession = mutation({
  args: { sessionId: v.id("user_sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.logged_out_at) {
      return { status: "terminated", reason: "Session not found or logged out" };
    }

    const user = await requireAuth(ctx);
    if (session.userId !== user._id) {
      return { status: "terminated", reason: "Session does not belong to user" };
    }

    await ctx.db.patch(sessionId, { last_active_at: new Date().toISOString() });
    return { status: "active" };
  },
});

export const logoutSession = mutation({
  args: { sessionId: v.id("user_sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return;
    await ctx.db.patch(sessionId, { logged_out_at: new Date().toISOString() });
  },
});

export const getUserSessions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    return ctx.db
      .query("user_sessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});
