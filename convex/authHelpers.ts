import { getAuthUserId } from "@convex-dev/auth/server";
import { MutationCtx, QueryCtx } from "./_generated/server";

function isDevAdminBypassEnabled() {
  return process.env.NODE_ENV === "development";
}

export async function getAuthUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return ctx.db.get(userId);
}

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const user = await getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  if (!user.is_admin && !isDevAdminBypassEnabled()) throw new Error("Admin access required");
  return user;
}
