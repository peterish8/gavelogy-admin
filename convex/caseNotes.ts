import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getCaseNote = query({
  args: { case_number: v.string() },
  handler: async (ctx, { case_number }) => {
    return await ctx.db
      .query("case_notes")
      .withIndex("by_case_number", (q) => q.eq("case_number", case_number))
      .first();
  },
});

export const createCaseNote = mutation({
  args: { case_number: v.string(), overall_content: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db.insert("case_notes", args);
  },
});

export const updateCaseNote = mutation({
  args: { case_number: v.string(), overall_content: v.string() },
  handler: async (ctx, { case_number, overall_content }) => {
    const existing = await ctx.db
      .query("case_notes")
      .withIndex("by_case_number", (q) => q.eq("case_number", case_number))
      .first();
    if (existing) await ctx.db.patch(existing._id, { overall_content });
  },
});

export const deleteCaseNote = mutation({
  args: { case_number: v.string() },
  handler: async (ctx, { case_number }) => {
    const existing = await ctx.db
      .query("case_notes")
      .withIndex("by_case_number", (q) => q.eq("case_number", case_number))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});
