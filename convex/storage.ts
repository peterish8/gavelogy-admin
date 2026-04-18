import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./authHelpers";

// Generate a one-time upload URL for Convex Storage
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

// Get the serving URL for a stored file
export const getUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    return ctx.storage.getUrl(storageId);
  },
});
