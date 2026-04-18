import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, getAuthUser } from "./authHelpers";

// ─── Lobby ────────────────────────────────────────────────────────────────

export const createLobby = mutation({
  args: {
    mode: v.union(
      v.literal("duel"),
      v.literal("arena"),
      v.literal("tagteam"),
      v.literal("speed_court")
    ),
    question_ids: v.array(v.string()),
    max_rounds: v.optional(v.number()),
    display_name: v.string(),
    avatar_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const lobbyId = await ctx.db.insert("game_lobbies", {
      mode: args.mode,
      status: "waiting",
      question_ids: args.question_ids,
      current_round: 0,
      max_rounds: args.max_rounds,
    });

    const playerId = await ctx.db.insert("game_players", {
      lobbyId,
      userId: user._id,
      display_name: args.display_name,
      avatar_url: args.avatar_url,
      score: 0,
      is_bot: false,
    });

    return { lobbyId, playerId };
  },
});

export const joinLobby = mutation({
  args: {
    lobbyId: v.id("game_lobbies"),
    display_name: v.string(),
    avatar_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const lobby = await ctx.db.get(args.lobbyId);
    if (!lobby || lobby.status !== "waiting") throw new Error("Lobby not available");

    // Check if already in lobby
    const existing = await ctx.db
      .query("game_players")
      .withIndex("by_lobby", (q) => q.eq("lobbyId", args.lobbyId))
      .collect();
    const alreadyJoined = existing.find((p) => p.userId === user._id);
    if (alreadyJoined) return alreadyJoined._id;

    return ctx.db.insert("game_players", {
      lobbyId: args.lobbyId,
      userId: user._id,
      display_name: args.display_name,
      avatar_url: args.avatar_url,
      score: 0,
      is_bot: false,
    });
  },
});

export const addBotPlayer = mutation({
  args: {
    lobbyId: v.id("game_lobbies"),
    display_name: v.string(),
    avatar_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("game_players", {
      lobbyId: args.lobbyId,
      display_name: args.display_name,
      avatar_url: args.avatar_url,
      score: 0,
      is_bot: true,
    });
  },
});

export const startGame = mutation({
  args: { lobbyId: v.id("game_lobbies") },
  handler: async (ctx, { lobbyId }) => {
    await requireAuth(ctx);
    await ctx.db.patch(lobbyId, {
      status: "active",
      started_at: new Date().toISOString(),
      current_round: 1,
    });
    await ctx.db.insert("game_events", {
      lobbyId,
      event_type: "game_started",
      payload: { started_at: new Date().toISOString() },
    });
  },
});

export const finishGame = mutation({
  args: { lobbyId: v.id("game_lobbies") },
  handler: async (ctx, { lobbyId }) => {
    await ctx.db.patch(lobbyId, {
      status: "finished",
      finished_at: new Date().toISOString(),
    });
    await ctx.db.insert("game_events", {
      lobbyId,
      event_type: "game_finished",
      payload: {},
    });
  },
});

export const cancelLobby = mutation({
  args: { lobbyId: v.id("game_lobbies") },
  handler: async (ctx, { lobbyId }) => {
    await ctx.db.patch(lobbyId, { status: "cancelled" });
  },
});

// ─── Reactive queries (replace Supabase Realtime channels) ───────────────

export const getLobby = query({
  args: { lobbyId: v.id("game_lobbies") },
  handler: async (ctx, { lobbyId }) => {
    return ctx.db.get(lobbyId);
  },
});

export const getPlayers = query({
  args: { lobbyId: v.id("game_lobbies") },
  handler: async (ctx, { lobbyId }) => {
    return ctx.db
      .query("game_players")
      .withIndex("by_lobby", (q) => q.eq("lobbyId", lobbyId))
      .collect();
  },
});

export const getGameEvents = query({
  args: { lobbyId: v.id("game_lobbies") },
  handler: async (ctx, { lobbyId }) => {
    return ctx.db
      .query("game_events")
      .withIndex("by_lobby", (q) => q.eq("lobbyId", lobbyId))
      .order("desc")
      .collect();
  },
});

export const getAnswers = query({
  args: { lobbyId: v.id("game_lobbies") },
  handler: async (ctx, { lobbyId }) => {
    return ctx.db
      .query("game_answers")
      .withIndex("by_lobby", (q) => q.eq("lobbyId", lobbyId))
      .collect();
  },
});

// ─── Gameplay ─────────────────────────────────────────────────────────────

export const saveAnswer = mutation({
  args: {
    lobbyId: v.id("game_lobbies"),
    playerId: v.id("game_players"),
    questionId: v.string(),
    round: v.number(),
    question_order: v.number(),
    answer: v.optional(v.string()),
    is_correct: v.boolean(),
    time_taken_ms: v.number(),
    points_earned: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const answerId = await ctx.db.insert("game_answers", {
      lobbyId: args.lobbyId,
      playerId: args.playerId,
      questionId: args.questionId,
      round: args.round,
      question_order: args.question_order,
      answer: args.answer,
      is_correct: args.is_correct,
      time_taken_ms: args.time_taken_ms,
      points_earned: args.points_earned,
    });

    await ctx.db.insert("game_events", {
      lobbyId: args.lobbyId,
      event_type: "answer_submitted",
      payload: {
        playerId: args.playerId,
        questionId: args.questionId,
        is_correct: args.is_correct,
      },
    });

    return answerId;
  },
});

// Batch save all answers for the current auth user in a lobby, then update score
export const batchSaveAnswers = mutation({
  args: {
    lobbyId: v.id("game_lobbies"),
    answers: v.array(
      v.object({
        questionId: v.string(),
        answer: v.optional(v.string()),
        is_correct: v.boolean(),
        time_taken_ms: v.number(),
        points_earned: v.optional(v.number()),
      })
    ),
    totalScore: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const playerRecord = await ctx.db
      .query("game_players")
      .withIndex("by_lobby", (q) => q.eq("lobbyId", args.lobbyId))
      .filter((q) => q.eq(q.field("userId"), user._id))
      .first();

    if (!playerRecord) throw new Error("Player not found in lobby");

    for (let i = 0; i < args.answers.length; i++) {
      const a = args.answers[i];
      await ctx.db.insert("game_answers", {
        lobbyId: args.lobbyId,
        playerId: playerRecord._id,
        questionId: a.questionId,
        round: 1,
        question_order: i,
        answer: a.answer,
        is_correct: a.is_correct,
        time_taken_ms: a.time_taken_ms,
        points_earned: a.points_earned,
      });
    }

    await ctx.db.patch(playerRecord._id, {
      score: args.totalScore,
      current_question: args.answers.length,
    });

    await ctx.db.insert("game_events", {
      lobbyId: args.lobbyId,
      event_type: "answer_submitted",
      payload: {
        playerId: playerRecord._id,
        score: args.totalScore,
        isFinal: true,
      },
    });
  },
});

export const updatePlayerScore = mutation({
  args: {
    playerId: v.id("game_players"),
    score: v.number(),
    final_rank: v.optional(v.number()),
    eliminated_round: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { score: args.score };
    if (args.final_rank !== undefined) patch.final_rank = args.final_rank;
    if (args.eliminated_round !== undefined)
      patch.eliminated_round = args.eliminated_round;
    await ctx.db.patch(args.playerId, patch);
  },
});

// Atomically awards game results — idempotent via coin_transactions uniqueness check
export const awardGameResults = mutation({
  args: {
    lobbyId: v.id("game_lobbies"),
    xp_earned: v.number(),
    coins_change: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Idempotency: skip if already awarded for this lobby
    const existingTx = await ctx.db
      .query("coin_transactions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("lobbyId"), args.lobbyId))
      .unique();
    if (existingTx) return { alreadyAwarded: true };

    if (args.coins_change !== 0) {
      await ctx.db.insert("coin_transactions", {
        userId: user._id,
        lobbyId: args.lobbyId,
        amount: args.coins_change,
        source: "game",
        description: "Game result award",
      });
      await ctx.db.patch(user._id, {
        total_coins: Math.max(0, user.total_coins + args.coins_change),
      });
    }

    return { alreadyAwarded: false };
  },
});

export const deductEntryFee = mutation({
  args: { lobbyId: v.id("game_lobbies"), fee: v.number() },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.total_coins < args.fee) throw new Error("Insufficient coins");
    await ctx.db.patch(user._id, {
      total_coins: user.total_coins - args.fee,
    });
    await ctx.db.insert("coin_transactions", {
      userId: user._id,
      lobbyId: args.lobbyId,
      amount: -args.fee,
      source: "entry_fee",
      description: "Game entry fee",
    });
  },
});
