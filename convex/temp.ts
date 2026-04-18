import { query } from "./_generated/server";

export const checkJudgmentCourse = query({
  args: {},
  handler: async (ctx) => {
    // Search for course named "judgment1" or similar
    const courses = await ctx.db.query("courses").collect();
    const judgmentCourses = courses.filter(c => c.name.toLowerCase().includes("judgment1") || c.name.toLowerCase().includes("judgment"));
    
    const results = [];
    
    for (const course of judgmentCourses) {
      // Find subjects
      const subjects = await ctx.db.query("subjects")
        .withIndex("by_course", q => q.eq("courseId", course._id))
        .collect();
      
      // Find structure items
      const items = await ctx.db.query("structure_items")
        .withIndex("by_course", q => q.eq("courseId", course._id))
        .collect();
        
      results.push({
        course: course,
        subjectsCount: subjects.length,
        itemsCount: items.length,
        itemsWithPdf: items.filter(i => !!i.pdf_url).map(i => ({ title: i.title, pdf_url: i.pdf_url }))
      });
    }
    
    // Also check if there are any case items that aren't attached to courses directly
    const allItems = await ctx.db.query("structure_items").collect();
    const allItemsWithPdf = allItems.filter(i => !!i.pdf_url).map(i => ({ title: i.title, pdf_url: i.pdf_url, courseId: i.courseId }));
    
    return { judgmentCoursesResults: results, totalItemsWithPdf: allItemsWithPdf.length, samplePdfItems: allItemsWithPdf.slice(0, 5) };
  }
});
