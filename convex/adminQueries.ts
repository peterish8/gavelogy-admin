import { query } from "./_generated/server";
import { v } from "convex/values";

// Required by use-subjects.ts
export const getSubjectsByCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, { courseId }) => {
    return await ctx.db
      .query("subjects")
      .withIndex("by_course", (q) => q.eq("courseId", courseId))
      .collect();
  },
});

export const getSubjectWithContent = query({
  args: { subjectId: v.id("subjects") },
  handler: async (ctx, { subjectId }) => {
    const subject = await ctx.db.get(subjectId);
    if (!subject) return null;

    const content_items = await ctx.db
       .query("structure_items")
       .withIndex("by_parent", (q) => q.eq("parentId", subjectId as any))
       .collect();

    return { subject, content_items };
  },
});

export const getNewsGroupedByDate = query({
  args: {},
  handler: async (ctx) => {
    const data = await ctx.db
      .query("daily_news")
      .withIndex("by_date")
      .order("desc")
      .collect();

    const map = new Map<string, any>();
    for (const row of data) {
      const key = row.date;
      if (!map.has(key)) {
        map.set(key, { date: key, total: 0, published: 0, draft: 0, source_paper: row.source_paper });
      }
      const group = map.get(key);
      group.total++;
      if (row.status === "published") group.published++;
      else group.draft++;
    }
    return Array.from(map.values());
  },
});

export const getNewsByDate = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const data = await ctx.db
      .query("daily_news")
      .withIndex("by_date", (q) => q.eq("date", date))
      .collect();
    
    // Sort by display_order
    return data.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  },
});

export const getEntity = query({
  args: { entityType: v.string(), id: v.string() },
  handler: async (ctx, { entityType, id }) => {
    // Basic entity getter
    const table = getTableName(entityType) as any;
    const convexId = ctx.db.normalizeId(table, id);
    if (!convexId) return null;
    return await ctx.db.get(convexId);
  }
})

// Used by adminMutations and adminQueries
function getTableName(entityType: string): string {
  switch (entityType) {
    case 'course': return 'courses';
    case 'subject': return 'subjects';
    case 'structure_item': return 'structure_items';
    case 'daily_news': return 'daily_news';
    default: throw new Error(`Unknown entity type ${entityType}`);
  }
}

export const getEditorData = query({
  args: { itemId: v.id("structure_items") },
  handler: async (ctx, { itemId }) => {
    const draft = await ctx.db.query("draft_content_cache")
        .withIndex("by_content", q => q.eq("original_content_id", itemId)).first();
    const live = await ctx.db.query("note_contents")
        .withIndex("by_item", q => q.eq("itemId", itemId)).first();
    const item = await ctx.db.get(itemId);
    
    // Quiz logic:
    const quiz = await ctx.db.query("attached_quizzes")
        .withIndex("by_note_item", q => q.eq("noteItemId", itemId)).first();
    let quiz_questions: any[] = [];
    if (quiz) {
       quiz_questions = await ctx.db.query("quiz_questions")
           .withIndex("by_quiz", q => q.eq("quizId", quiz._id)).collect();
    }
    
    return {
       draftRes: { data: draft ? { id: draft._id, draft_data: draft.draft_data } : null },
       liveRes: { data: live ? { id: live._id, content_html: live.content_html, updated_at: live._creationTime, flashcards_json: live.flashcards_json, script_text: live.script_text } : null },
       itemRes: { data: item ? { id: item._id, pdf_url: item.pdf_url } : null },
       quizRes: { data: quiz ? { id: quiz._id, title: quiz.title, quiz_questions: quiz_questions.map((q: any) => ({ id: q._id, question_text: q.question_text, options: q.options, correct_answer: q.correct_answer, explanation: q.explanation })) } : null }
    }
  }
});

export const checkDbDiagnostic = query({
  args: {},
  handler: async (ctx) => {
    const courses = await ctx.db.query("courses").collect();
    const judgmentCourses = courses.filter(c => c.name.toLowerCase().includes("judgment"));

    const results = [];
    for (const course of judgmentCourses) {
      const subjects = await ctx.db.query("subjects")
        .withIndex("by_course", q => q.eq("courseId", course._id)).collect();

      const items = await ctx.db.query("structure_items")
        .withIndex("by_course", q => q.eq("courseId", course._id)).collect();

      results.push({
        course: course.name,
        courseId: course._id,
        subjectsCount: subjects.length,
        itemsCount: items.length,
        itemsWithPdf: items.filter(i => !!i.pdf_url).map(i => ({ title: i.title, pdf_url: i.pdf_url }))
      });
    }

    const allItems = await ctx.db.query("structure_items").collect();
    const allItemsWithPdf = allItems.filter(i => !!i.pdf_url).map(i => ({ title: i.title, pdf_url: i.pdf_url, courseId: i.courseId }));

    return { judgmentCoursesResults: results, totalItemsWithPdf: allItemsWithPdf.length, samplePdfItems: allItemsWithPdf.slice(0, 5) };
  }
});

export const adminHealthCheck = query({
  args: {},
  handler: async (ctx) => {
    // Import requireAdmin at the top level would be better, but for this endpoint we check manually
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { status: 'error', message: 'Unauthenticated', authenticated: false, admin: false, dbConnected: false };
    }

    const userRecord = await ctx.db.query("users")
      .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!userRecord) {
      return { status: 'error', message: 'User not found', authenticated: true, admin: false, dbConnected: true };
    }

    if (!userRecord.is_admin) {
      return { status: 'error', message: 'Admin access required', authenticated: true, admin: false, dbConnected: true };
    }

    // DB connectivity check - perform a simple query
    try {
      const courseCount = await ctx.db.query("courses").collect().then(c => c.length);
      return {
        status: 'ok',
        message: 'System healthy',
        authenticated: true,
        admin: true,
        dbConnected: true,
        timestamp: new Date().toISOString(),
        stats: { courseCount }
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Database query failed',
        authenticated: true,
        admin: true,
        dbConnected: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Course Creators Queries
export const getCoursesWithCreators = query({
  args: {},
  handler: async (ctx) => {
    const courses = await ctx.db.query("courses").collect();

    const coursesWithCreators = await Promise.all(
      courses.map(async (course) => {
        let creator = null;
        if (course.created_by) {
          creator = await ctx.db.get(course.created_by);
        }
        return {
          ...course,
          creator: creator ? {
            id: creator._id,
            name: creator.full_name || creator.username,
            email: creator.email,
            avatar_url: creator.avatar_url,
          } : null,
        };
      })
    );

    return coursesWithCreators;
  },
});

export const getCoursesGroupedByCreator = query({
  args: {},
  handler: async (ctx) => {
    const courses = await ctx.db.query("courses").collect();

    // Group by creator
    const creatorMap = new Map();

    for (const course of courses) {
      const creatorId = course.created_by?.toString() || "unassigned";

      if (!creatorMap.has(creatorId)) {
        let creatorInfo = null;
        if (course.created_by) {
          const creator = await ctx.db.get(course.created_by);
          if (creator) {
            creatorInfo = {
              id: creator._id,
              name: creator.full_name || creator.username,
              email: creator.email,
              avatar_url: creator.avatar_url,
            };
          }
        }

        creatorMap.set(creatorId, {
          creator: creatorInfo,
          courses: [],
          totalCourses: 0,
          totalRevenue: 0,
        });
      }

      creatorMap.get(creatorId)!.courses.push(course);
      creatorMap.get(creatorId)!.totalCourses++;
    }

    // Calculate revenue for each creator
    for (const [creatorId, group] of creatorMap.entries()) {
      if (creatorId === "unassigned") continue;

      const courseIds = group.courses.map((c: any) => c._id);

      // Get all successful payment orders for these courses
      const paymentOrders = await Promise.all(
        courseIds.map(async (courseId: any) => {
          const orders = await ctx.db
            .query("payment_orders")
            .withIndex("by_course", q => q.eq("courseId", courseId))
            .collect();
          return orders.filter((o: any) => o.status === "success");
        })
      );

      const allOrders = paymentOrders.flat();
      group.totalRevenue = allOrders.reduce((sum: number, order: any) => sum + order.amount, 0);
    }

    return Array.from(creatorMap.values());
  },
});

export const getCoursesByCreator = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const courses = await ctx.db
      .query("courses")
      .withIndex("by_creator", q => q.eq("created_by", userId))
      .collect();

    const creator = await ctx.db.get(userId);

    return {
      creator: creator ? {
        id: creator._id,
        name: creator.full_name || creator.username,
        email: creator.email,
        avatar_url: creator.avatar_url,
      } : null,
      courses,
    };
  },
});

export const getCreatorRevenue = query({
  args: {
    userId: v.id("users"),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, { userId, startDate, endDate }) => {
    // Get all courses by this creator
    const courses = await ctx.db
      .query("courses")
      .withIndex("by_creator", q => q.eq("created_by", userId))
      .collect();

    const courseIds = courses.map(c => c._id);

    // Get all successful payment orders for these courses
    const paymentOrders = await Promise.all(
      courseIds.map(async (courseId) => {
        const orders = await ctx.db
          .query("payment_orders")
          .withIndex("by_course", q => q.eq("courseId", courseId))
          .collect();
        return orders.filter(o => o.status === "success");
      })
    );

    const allOrders = paymentOrders.flat();

    // Filter by date range if provided
    let filteredOrders = allOrders;
    if (startDate) {
      filteredOrders = filteredOrders.filter(o => {
        const orderDate = new Date(o._creationTime);
        return orderDate >= new Date(startDate);
      });
    }
    if (endDate) {
      filteredOrders = filteredOrders.filter(o => {
        const orderDate = new Date(o._creationTime);
        return orderDate <= new Date(endDate);
      });
    }

    // Calculate total revenue
    const totalRevenue = filteredOrders.reduce((sum, order) => sum + order.amount, 0);

    // Group by month for breakdown
    const revenueByMonth = new Map<string, number>();
    filteredOrders.forEach(order => {
      const date = new Date(order._creationTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      revenueByMonth.set(monthKey, (revenueByMonth.get(monthKey) || 0) + order.amount);
    });

    // Group by course for breakdown
    const revenueByCourse = new Map<string, number>();
    filteredOrders.forEach(order => {
      const courseId = order.courseId.toString();
      revenueByCourse.set(courseId, (revenueByCourse.get(courseId) || 0) + order.amount);
    });

    return {
      totalRevenue,
      totalOrders: filteredOrders.length,
      revenueByMonth: Array.from(revenueByMonth.entries())
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      revenueByCourse: Array.from(revenueByCourse.entries())
        .map(([courseId, amount]) => {
          const course = courses.find(c => c._id.toString() === courseId);
          return {
            courseId,
            courseName: course?.name || 'Unknown',
            amount,
          };
        }),
    };
  },
});

export const getUserRevenue = query({
  args: {
    userId: v.id("users"),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, { userId, startDate, endDate }) => {
    // Get all successful payment orders for this user
    const allOrders = await ctx.db
      .query("payment_orders")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    const successfulOrders = allOrders.filter(o => o.status === "success");

    // Filter by date range if provided
    let filteredOrders = successfulOrders;
    if (startDate) {
      filteredOrders = filteredOrders.filter(o => {
        const orderDate = new Date(o._creationTime);
        return orderDate >= new Date(startDate);
      });
    }
    if (endDate) {
      filteredOrders = filteredOrders.filter(o => {
        const orderDate = new Date(o._creationTime);
        return orderDate <= new Date(endDate);
      });
    }

    // Calculate total spent
    const totalSpent = filteredOrders.reduce((sum, order) => sum + order.amount, 0);

    // Group by month for breakdown
    const spentByMonth = new Map<string, number>();
    filteredOrders.forEach(order => {
      const date = new Date(order._creationTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      spentByMonth.set(monthKey, (spentByMonth.get(monthKey) || 0) + order.amount);
    });

    // Group by course for breakdown
    const spentByCourse = new Map<string, number>();
    filteredOrders.forEach(order => {
      const courseId = order.courseId.toString();
      spentByCourse.set(courseId, (spentByCourse.get(courseId) || 0) + order.amount);
    });

    // Fetch course names for the breakdown
    const courseIds = Array.from(spentByCourse.keys());
    const courses = await Promise.all(
      courseIds.map(async (courseId) => {
        const normalizedId = ctx.db.normalizeId("courses", courseId);
        return normalizedId ? await ctx.db.get(normalizedId) : null;
      })
    );

    return {
      totalSpent,
      totalOrders: filteredOrders.length,
      spentByMonth: Array.from(spentByMonth.entries())
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      spentByCourse: Array.from(spentByCourse.entries())
        .map(([courseId, amount]) => {
          const course = courses.find(c => c && c._id.toString() === courseId);
          return {
            courseId,
            courseName: course?.name || 'Unknown',
            amount,
          };
        }),
    };
  },
});

export const getAllUsersWithRevenue = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();

    const usersWithRevenue = await Promise.all(
      users.map(async (user) => {
        // Get all successful payment orders for this user
        const allOrders = await ctx.db
          .query("payment_orders")
          .withIndex("by_user", q => q.eq("userId", user._id))
          .collect();

        const successfulOrders = allOrders.filter(o => o.status === "success");
        const totalSpent = successfulOrders.reduce((sum, order) => sum + order.amount, 0);

        return {
          ...user,
          totalSpent,
        };
      })
    );

    return usersWithRevenue;
  },
});

export const getRevenueDashboard = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, { startDate, endDate }) => {
    const allOrders = await ctx.db.query("payment_orders").collect();
    const successfulOrders = allOrders.filter((order) => order.status === "success");

    let filteredOrders = successfulOrders;
    if (startDate) {
      const start = new Date(startDate);
      filteredOrders = filteredOrders.filter((order) => new Date(order._creationTime) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filteredOrders = filteredOrders.filter((order) => new Date(order._creationTime) <= end);
    }

    const uniqueCourseIds = [...new Set(filteredOrders.map((order) => order.courseId.toString()))];
    const courses = await Promise.all(
      uniqueCourseIds.map(async (courseId) => {
        const normalizedId = ctx.db.normalizeId("courses", courseId);
        return normalizedId ? await ctx.db.get(normalizedId) : null;
      })
    );
    const courseMap = new Map(
      courses
        .filter(Boolean)
        .map((course) => [course!._id.toString(), course!])
    );

    const revenueByMonth = new Map<string, { revenue: number; orders: number }>();
    const revenueByCourse = new Map<string, { revenue: number; orders: number }>();

    filteredOrders.forEach((order) => {
      const date = new Date(order._creationTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthBucket = revenueByMonth.get(monthKey) || { revenue: 0, orders: 0 };
      monthBucket.revenue += order.amount;
      monthBucket.orders += 1;
      revenueByMonth.set(monthKey, monthBucket);

      const courseKey = order.courseId.toString();
      const courseBucket = revenueByCourse.get(courseKey) || { revenue: 0, orders: 0 };
      courseBucket.revenue += order.amount;
      courseBucket.orders += 1;
      revenueByCourse.set(courseKey, courseBucket);
    });

    const totalRevenue = filteredOrders.reduce((sum, order) => sum + order.amount, 0);
    const totalOrders = filteredOrders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentMonthRevenue = revenueByMonth.get(currentMonthKey)?.revenue ?? 0;

    return {
      totalRevenue,
      totalOrders,
      averageOrderValue,
      currentMonthRevenue,
      revenueByMonth: Array.from(revenueByMonth.entries())
        .map(([month, stats]) => ({
          month,
          revenue: stats.revenue,
          orders: stats.orders,
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      revenueByCourse: Array.from(revenueByCourse.entries())
        .map(([courseId, stats]) => ({
          courseId,
          courseName: courseMap.get(courseId)?.name || "Unknown Course",
          revenue: stats.revenue,
          orders: stats.orders,
          isActive: courseMap.get(courseId)?.is_active ?? false,
          isFree: courseMap.get(courseId)?.is_free ?? false,
        }))
        .sort((a, b) => b.revenue - a.revenue),
    };
  },
});
