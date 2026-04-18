import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./authHelpers";

export const getUserCourses = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    return ctx.db
      .query("user_courses")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

export const hasCourseAccess = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    const user = await requireAuth(ctx);

    // Check if course is free
    const course = await ctx.db.get(courseId);
    if (course?.is_free) return true;

    const purchase = await ctx.db
      .query("user_courses")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", courseId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    return !!purchase;
  },
});

export const recordPurchase = mutation({
  args: {
    courseId: v.id("courses"),
    course_name: v.optional(v.string()),
    course_price: v.optional(v.number()),
    order_id: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Idempotency: don't insert duplicate purchases
    const existing = await ctx.db
      .query("user_courses")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId)
      )
      .unique();
    if (existing) return existing._id;

    return ctx.db.insert("user_courses", {
      userId: user._id,
      courseId: args.courseId,
      course_name: args.course_name,
      course_price: args.course_price,
      order_id: args.order_id,
      purchased_at: new Date().toISOString(),
      status: "active",
    });
  },
});

export const createPaymentOrder = mutation({
  args: {
    order_id: v.string(),
    courseId: v.id("courses"),
    amount: v.number(),
    payment_method: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    return ctx.db.insert("payment_orders", {
      order_id: args.order_id,
      userId: user._id,
      courseId: args.courseId,
      amount: args.amount,
      status: "pending",
      payment_method: args.payment_method,
    });
  },
});

export const updatePaymentStatus = mutation({
  args: {
    order_id: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("success"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, { order_id, status }) => {
    const record = await ctx.db
      .query("payment_orders")
      .withIndex("by_order_id", (q) => q.eq("order_id", order_id))
      .unique();
    if (!record) throw new Error("Payment order not found");
    await ctx.db.patch(record._id, { status });
  },
});
