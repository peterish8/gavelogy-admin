import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, Google],
  callbacks: {
    async createOrUpdateUser(ctx: MutationCtx, args: {
      existingUserId: Id<"users"> | null;
      profile: { email?: string | null; name?: string | null; image?: string | null };
      type: string;
    }) {
      if (args.existingUserId) {
        // Patch avatar/name on re-login (e.g. Google profile pic change)
        const patch: Record<string, unknown> = {};
        if (args.profile.image) patch.avatar_url = args.profile.image;
        if (args.profile.name) patch.full_name = args.profile.name;
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(args.existingUserId, patch);
        }
        return args.existingUserId;
      }

      const email = args.profile.email ?? "";
      const baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_") || "user";

      // Ensure unique username
      let username = baseUsername;
      let suffix = 1;
      while (
        await ctx.db
          .query("users")
          .withIndex("by_username", (q) => q.eq("username", username))
          .unique()
      ) {
        username = `${baseUsername}${suffix++}`;
      }

      const userId = await ctx.db.insert("users", {
        email,
        username,
        full_name: args.profile.name ?? undefined,
        avatar_url: args.profile.image ?? undefined,
        total_coins: 100,
        streak_count: 0,
        longest_streak: 0,
        dark_mode: false,
        tokenIdentifier: "pending",
      });

      // tokenIdentifier = the user's own _id (used by getAuthUser via by_token index)
      await ctx.db.patch(userId, { tokenIdentifier: userId });

      return userId;
    },
  },
});
