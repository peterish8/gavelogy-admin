import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { v } from "convex/values";

type AdminReadCtx = QueryCtx | MutationCtx;

const ALLOWED_ITEM_TYPES = ["folder", "file"] as const;
const COURSE_PATCH_FIELDS = [
  "name",
  "description",
  "price",
  "is_active",
  "is_free",
  "icon",
] as const;
const ITEM_PATCH_FIELDS = [
  "title",
  "description",
  "parentId",
  "order_index",
  "icon",
  "is_active",
  "pdf_url",
  "item_type",
] as const;
const DAILY_NEWS_FIELDS = [
  "date",
  "title",
  "content_custom",
  "content_html",
  "summary",
  "keywords",
  "category",
  "source_paper",
  "status",
  "display_order",
  "subject",
  "topic",
  "court",
  "priority",
  "exam_probability",
  "capsule",
  "facts",
  "provisions",
  "holdings",
  "doctrine",
  "mcqs",
  "source_url",
  "read_seconds",
  "exam_rank",
] as const;
const STANDALONE_QUIZ_PATCH_FIELDS = [
  "title",
  "description",
  "subject_id",
  "order_index",
] as const;
const STANDALONE_QUESTION_PATCH_FIELDS = [
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer",
  "explanation",
  "order_index",
] as const;
const PYQ_TEST_PATCH_FIELDS = [
  "title",
  "exam_name",
  "year",
  "duration_minutes",
  "total_marks",
  "negative_marking",
  "instructions",
  "is_published",
] as const;
const PYQ_PASSAGE_PATCH_FIELDS = [
  "passage_text",
  "citation",
  "section_number",
  "subject",
  "order_index",
] as const;
const PYQ_QUESTION_PATCH_FIELDS = [
  "passage_id",
  "order_index",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer",
  "explanation",
  "marks",
  "question_type",
  "subject",
] as const;

type AuditMeta = {
  courseId?: Id<"courses">;
  itemId?: Id<"structure_items">;
  entityType: string;
  entityId?: string;
  action: string;
  source?: string;
  provider?: string;
  idempotency_key?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function getExpectedSecret() {
  return process.env.MCP_ADMIN_SECRET ?? process.env.ADMIN_API_SECRET ?? "";
}

function requireServiceSecret(secret: string) {
  const expected = getExpectedSecret();
  if (!expected) {
    throw new Error("MCP_ADMIN_SECRET or ADMIN_API_SECRET is not configured");
  }
  if (secret !== expected) {
    throw new Error("Invalid service secret");
  }
}

function normalizeIdOrThrow<T extends TableNames>(
  ctx: AdminReadCtx,
  table: T,
  id: string,
  field = "id",
) {
  const normalized = ctx.db.normalizeId(table, id);
  if (!normalized) {
    throw new Error(`Invalid ${field}: ${id}`);
  }
  return normalized as Id<T>;
}

async function getByIdOrThrow<T extends TableNames>(
  ctx: AdminReadCtx,
  table: T,
  id: string,
  field = "id",
) {
  const normalized = normalizeIdOrThrow(ctx, table, id, field);
  const doc = await ctx.db.get(normalized);
  if (!doc) {
    throw new Error(`${field} not found: ${id}`);
  }
  return { id: normalized, doc: doc as Doc<T> };
}

function pickAllowedPatch<T extends readonly string[]>(
  patch: Record<string, unknown>,
  allowlist: T,
) {
  const picked: Record<string, unknown> = {};
  for (const key of allowlist) {
    if (patch[key] !== undefined) {
      picked[key] = patch[key];
    }
  }
  return picked;
}

function ensureItemType(itemType: string) {
  if (!ALLOWED_ITEM_TYPES.includes(itemType as (typeof ALLOWED_ITEM_TYPES)[number])) {
    throw new Error(`Unsupported item_type: ${itemType}`);
  }
}

function getQuizItemId(quiz: Doc<"attached_quizzes">) {
  return (quiz.noteItemId ?? quiz.note_item_id) as Id<"structure_items"> | undefined;
}

async function insertAuditLog(
  ctx: MutationCtx,
  meta: AuditMeta,
  status: "success" | "failed",
  error?: string,
) {
  await ctx.db.insert("mcp_generation_logs", {
    courseId: meta.courseId,
    itemId: meta.itemId,
    entityType: meta.entityType,
    entityId: meta.entityId,
    action: meta.action,
    status,
    source: meta.source ?? "chatgpt-mcp",
    provider: meta.provider,
    error,
    created_at: nowIso(),
    idempotency_key: meta.idempotency_key,
  });
}

async function withAudit<T>(
  ctx: MutationCtx,
  meta: AuditMeta,
  handler: () => Promise<T>,
) {
  try {
    const result = await handler();
    await insertAuditLog(ctx, meta, "success");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await insertAuditLog(ctx, meta, "failed", message);
    throw error;
  }
}

function normalizeFlashcardsInput(flashcards: Array<Record<string, unknown>>) {
  return flashcards.map((flashcard, index) => {
    const front = typeof flashcard.front === "string" ? flashcard.front.trim() : "";
    const back = typeof flashcard.back === "string" ? flashcard.back.trim() : "";
    if (!front || !back) {
      throw new Error(`flashcards[${index}] must include non-empty front and back`);
    }
    return { front, back };
  });
}

function normalizeQuizCorrectAnswer(
  options: string[],
  correctAnswer: string,
) {
  const value = correctAnswer.trim();
  const letters = ["A", "B", "C", "D"];
  if (letters.includes(value.toUpperCase())) {
    return value.toUpperCase();
  }
  const optionIndex = options.findIndex((option) => option === value);
  if (optionIndex >= 0) {
    return letters[optionIndex];
  }
  throw new Error("correctAnswer must be one of A/B/C/D or one of the option values");
}

async function getCourseContentFlags(
  ctx: AdminReadCtx,
  courseId: Id<"courses">,
) {
  const items = await ctx.db
    .query("structure_items")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();

  const noteRows = await ctx.db.query("note_contents").collect();
  const quizzes = await ctx.db.query("attached_quizzes").collect();

  const itemIds = new Set(items.map((item) => item._id));

  const noteMap = new Map<
    Id<"structure_items">,
    { hasNote: boolean; hasFlashcards: boolean; flashcardsCount: number }
  >();
  for (const note of noteRows) {
    if (!note.itemId || !itemIds.has(note.itemId)) continue;
    const content = typeof note.content_html === "string" ? note.content_html.trim() : "";
    let flashcardsCount = 0;
    if (typeof note.flashcards_json === "string" && note.flashcards_json.trim()) {
      try {
        const parsed = JSON.parse(note.flashcards_json);
        if (Array.isArray(parsed)) flashcardsCount = parsed.length;
      } catch {
        flashcardsCount = 0;
      }
    }
    noteMap.set(note.itemId, {
      hasNote: content.length > 0,
      hasFlashcards: flashcardsCount > 0,
      flashcardsCount,
    });
  }

  const quizByItem = new Map<Id<"structure_items">, Doc<"attached_quizzes">>();
  for (const quiz of quizzes) {
    const noteItemId = getQuizItemId(quiz);
    if (!noteItemId || !itemIds.has(noteItemId)) continue;
    if (!quizByItem.has(noteItemId)) {
      quizByItem.set(noteItemId, quiz);
    }
  }

  return { items, noteMap, quizByItem };
}

function validateStructureImport(items: Array<{
  tempId: string;
  parentTempId?: string | null;
  item_type: string;
  title: string;
  order_index: number;
}>) {
  const ids = new Set(items.map((item) => item.tempId));
  for (const item of items) {
    ensureItemType(item.item_type);
    if (item.parentTempId && !ids.has(item.parentTempId)) {
      throw new Error(`Invalid parentTempId "${item.parentTempId}" for "${item.tempId}"`);
    }
  }

  const parentMap = new Map<string, string | null>();
  for (const item of items) {
    parentMap.set(item.tempId, item.parentTempId ?? null);
  }

  for (const item of items) {
    let current = item.parentTempId ?? null;
    const visited = new Set<string>();
    while (current) {
      if (current === item.tempId) {
        throw new Error(`Cycle detected for tempId "${item.tempId}"`);
      }
      if (visited.has(current)) {
        throw new Error(`Cycle detected in hierarchy near "${item.tempId}"`);
      }
      visited.add(current);
      current = parentMap.get(current) ?? null;
    }
  }
}

export const listCourses = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    requireServiceSecret(secret);
    const courses = await ctx.db.query("courses").collect();
    return courses.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const createCourse = mutation({
  args: {
    secret: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    is_active: v.optional(v.boolean()),
    is_free: v.optional(v.boolean()),
    icon: v.optional(v.string()),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "course",
        action: "create",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const createdAt = nowIso();
        const courseId = await ctx.db.insert("courses", {
          name: args.name,
          description: args.description,
          price: args.price ?? 0,
          is_active: args.is_active ?? false,
          is_free: args.is_free ?? false,
          icon: args.icon,
          created_at: createdAt,
          updated_at: createdAt,
        });
        return { courseId };
      },
    );
  },
});

export const updateCourse = mutation({
  args: {
    secret: v.string(),
    courseId: v.string(),
    patch: v.any(),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "course",
        entityId: args.courseId,
        action: "update",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const { id: courseId } = await getByIdOrThrow(ctx, "courses", args.courseId, "courseId");
        const patch = pickAllowedPatch(
          typeof args.patch === "object" && args.patch ? (args.patch as Record<string, unknown>) : {},
          COURSE_PATCH_FIELDS,
        );
        patch.updated_at = nowIso();
        await ctx.db.patch(courseId, patch);
        return { courseId };
      },
    );
  },
});

export const getCourseTree = query({
  args: { secret: v.string(), courseId: v.string() },
  handler: async (ctx, { secret, courseId }) => {
    requireServiceSecret(secret);
    const { id: normalizedCourseId, doc: course } = await getByIdOrThrow(ctx, "courses", courseId, "courseId");
    const { items, noteMap, quizByItem } = await getCourseContentFlags(ctx, normalizedCourseId);

    const childrenMap = new Map<string | null, Array<Doc<"structure_items">>>();
    for (const item of items) {
      const key = item.parentId ?? null;
      const current = childrenMap.get(key) ?? [];
      current.push(item);
      childrenMap.set(key, current);
    }
    for (const children of childrenMap.values()) {
      children.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    }

    const buildNode = (item: Doc<"structure_items">): Record<string, unknown> => {
      const note = noteMap.get(item._id);
      const hasQuiz = quizByItem.has(item._id);
      const status =
        !note?.hasNote && !note?.hasFlashcards && !hasQuiz
          ? "missing_all"
          : !note?.hasNote
            ? "missing_note"
            : !note?.hasFlashcards
              ? "missing_flashcards"
              : !hasQuiz
                ? "missing_quiz"
                : "complete";
      return {
        ...item,
        hasNote: !!note?.hasNote,
        hasFlashcards: !!note?.hasFlashcards,
        hasQuiz,
        hasPdf: !!item.pdf_url,
        status,
        children: (childrenMap.get(item._id) ?? []).map(buildNode),
      };
    };

    const roots = (childrenMap.get(null) ?? []).map(buildNode);
    return {
      course,
      tree: roots,
      itemsCount: items.length,
    };
  },
});

export const createCourseItem = mutation({
  args: {
    secret: v.string(),
    courseId: v.string(),
    parentId: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    item_type: v.string(),
    order_index: v.optional(v.number()),
    icon: v.optional(v.string()),
    is_active: v.optional(v.boolean()),
    pdf_url: v.optional(v.string()),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "structure_item",
        action: "create",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        ensureItemType(args.item_type);
        const { id: courseId } = await getByIdOrThrow(ctx, "courses", args.courseId, "courseId");
        let parentId: Id<"structure_items"> | undefined;
        if (args.parentId) {
          const parent = await getByIdOrThrow(ctx, "structure_items", args.parentId, "parentId");
          if (!parent.doc.courseId || parent.doc.courseId !== courseId) {
            throw new Error("parentId does not belong to the provided courseId");
          }
          parentId = parent.id;
        }

        const itemId = await ctx.db.insert("structure_items", {
          courseId,
          parentId,
          title: args.title,
          description: args.description,
          item_type: args.item_type,
          order_index: args.order_index,
          icon: args.icon,
          is_active: args.is_active ?? true,
          pdf_url: args.pdf_url,
        });
        return { itemId };
      },
    );
  },
});

export const updateCourseItem = mutation({
  args: {
    secret: v.string(),
    itemId: v.string(),
    patch: v.any(),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "structure_item",
        entityId: args.itemId,
        action: "update",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const { id: itemId, doc: item } = await getByIdOrThrow(ctx, "structure_items", args.itemId, "itemId");
        if (!item.courseId) {
          throw new Error("Cannot update structure item without courseId");
        }
        const inputPatch =
          typeof args.patch === "object" && args.patch ? (args.patch as Record<string, unknown>) : {};
        const patch = pickAllowedPatch(inputPatch, ITEM_PATCH_FIELDS);

        if (patch.item_type !== undefined) {
          if (typeof patch.item_type !== "string") throw new Error("item_type must be a string");
          ensureItemType(patch.item_type);
        }

        if (patch.parentId !== undefined) {
          if (patch.parentId === null) {
            patch.parentId = undefined;
          } else if (typeof patch.parentId === "string") {
            const parent = await getByIdOrThrow(ctx, "structure_items", patch.parentId, "parentId");
            if (!parent.doc.courseId || parent.doc.courseId !== item.courseId) {
              throw new Error("parentId must belong to the same course");
            }
            if (parent.id === itemId) {
              throw new Error("Item cannot be parent of itself");
            }
            patch.parentId = parent.id;
          } else {
            throw new Error("parentId must be a string or null");
          }
        }

        await ctx.db.patch(itemId, patch);
        return { itemId };
      },
    );
  },
});

export const getBulkStatus = query({
  args: { secret: v.string(), courseId: v.string() },
  handler: async (ctx, { secret, courseId }) => {
    requireServiceSecret(secret);
    const { id: normalizedCourseId } = await getByIdOrThrow(ctx, "courses", courseId, "courseId");
    const { items, noteMap, quizByItem } = await getCourseContentFlags(ctx, normalizedCourseId);

    const fileItems = items.filter((item) => item.item_type === "file");
    const rows = fileItems
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((item) => {
        const note = noteMap.get(item._id);
        const hasQuiz = quizByItem.has(item._id);
        const hasNote = !!note?.hasNote;
        const hasFlashcards = !!note?.hasFlashcards;
        const status =
          !hasNote && !hasFlashcards && !hasQuiz
            ? "missing_all"
            : !hasNote
              ? "missing_note"
              : !hasFlashcards
                ? "missing_flashcards"
                : !hasQuiz
                  ? "missing_quiz"
                  : "complete";

        return {
          itemId: item._id,
          title: item.title,
          item_type: item.item_type,
          pdf_url: item.pdf_url ?? null,
          hasNote,
          hasFlashcards,
          hasQuiz,
          status,
        };
      });

    return {
      courseId: normalizedCourseId,
      totalItems: rows.length,
      items: rows,
    };
  },
});

export const getItemNoteData = query({
  args: { secret: v.string(), itemId: v.string(), includeDraft: v.optional(v.boolean()) },
  handler: async (ctx, { secret, itemId, includeDraft }) => {
    requireServiceSecret(secret);
    const { id: normalizedItemId, doc: item } = await getByIdOrThrow(ctx, "structure_items", itemId, "itemId");
    if (item.item_type !== "file") {
      throw new Error("Notes are only supported for item_type=file");
    }

    const note = await ctx.db
      .query("note_contents")
      .withIndex("by_item", (q) => q.eq("itemId", normalizedItemId))
      .first();
    const quiz = await ctx.db
      .query("attached_quizzes")
      .withIndex("by_note_item", (q) => q.eq("noteItemId", normalizedItemId))
      .first();
    const questions = quiz
      ? await ctx.db
          .query("quiz_questions")
          .withIndex("by_quiz", (q) => q.eq("quizId", quiz._id))
          .collect()
      : [];
    const draft =
      includeDraft === true
        ? await ctx.db
            .query("draft_content_cache")
            .withIndex("by_content", (q) => q.eq("original_content_id", normalizedItemId))
            .first()
        : null;

    return {
      structure_item: item,
      live_note: note
        ? {
            id: note._id,
            content_html: note.content_html ?? "",
            flashcards_json: note.flashcards_json ?? null,
            script_text: note.script_text ?? "",
          }
        : null,
      flashcards_json: note?.flashcards_json ?? null,
      script_text: note?.script_text ?? "",
      pdf_url: item.pdf_url ?? null,
      attached_quiz_summary: quiz
        ? { id: quiz._id, title: quiz.title ?? "", passing_score: quiz.passing_score ?? null, questionCount: questions.length }
        : null,
      draft: draft
        ? {
            id: draft._id,
            draft_data: draft.draft_data ?? null,
          }
        : null,
    };
  },
});

export const upsertItemNoteContent = mutation({
  args: {
    secret: v.string(),
    itemId: v.string(),
    content_html: v.string(),
    clear_draft: v.optional(v.boolean()),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
    action: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        itemId: normalizeIdOrThrow(ctx, "structure_items", args.itemId, "itemId"),
        entityType: "note",
        entityId: args.itemId,
        action: args.action ?? "publish",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const { id: itemId, doc: item } = await getByIdOrThrow(ctx, "structure_items", args.itemId, "itemId");
        if (item.item_type !== "file") {
          throw new Error("Notes are only supported for item_type=file");
        }

        const existing = await ctx.db
          .query("note_contents")
          .withIndex("by_item", (q) => q.eq("itemId", itemId))
          .first();

        let noteId: Id<"note_contents">;
        if (existing) {
          await ctx.db.patch(existing._id, { content_html: args.content_html });
          noteId = existing._id;
        } else {
          noteId = await ctx.db.insert("note_contents", {
            itemId,
            content_html: args.content_html,
          });
        }

        if (args.clear_draft) {
          const draft = await ctx.db
            .query("draft_content_cache")
            .withIndex("by_content", (q) => q.eq("original_content_id", itemId))
            .first();
          if (draft) {
            await ctx.db.delete(draft._id);
          }
        }

        return { noteId, itemId };
      },
    );
  },
});

export const upsertItemScript = mutation({
  args: {
    secret: v.string(),
    itemId: v.string(),
    script_text: v.string(),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        itemId: normalizeIdOrThrow(ctx, "structure_items", args.itemId, "itemId"),
        entityType: "note",
        entityId: args.itemId,
        action: "update_script",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const { id: itemId, doc: item } = await getByIdOrThrow(ctx, "structure_items", args.itemId, "itemId");
        if (item.item_type !== "file") {
          throw new Error("Scripts are only supported for item_type=file");
        }
        const existing = await ctx.db
          .query("note_contents")
          .withIndex("by_item", (q) => q.eq("itemId", itemId))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, { script_text: args.script_text });
          return { noteId: existing._id };
        }
        const noteId = await ctx.db.insert("note_contents", { itemId, script_text: args.script_text });
        return { noteId };
      },
    );
  },
});

export const getItemFlashcards = query({
  args: { secret: v.string(), itemId: v.string() },
  handler: async (ctx, { secret, itemId }) => {
    requireServiceSecret(secret);
    const { id: normalizedItemId, doc: item } = await getByIdOrThrow(ctx, "structure_items", itemId, "itemId");
    if (item.item_type !== "file") {
      throw new Error("Flashcards are only supported for item_type=file");
    }

    const note = await ctx.db
      .query("note_contents")
      .withIndex("by_item", (q) => q.eq("itemId", normalizedItemId))
      .first();
    let flashcards: Array<{ front: string; back: string }> = [];
    if (note?.flashcards_json) {
      try {
        const parsed = JSON.parse(note.flashcards_json);
        if (Array.isArray(parsed)) {
          flashcards = parsed.filter(
            (card): card is { front: string; back: string } =>
              typeof card?.front === "string" && typeof card?.back === "string",
          );
        }
      } catch {
        flashcards = [];
      }
    }

    return {
      item,
      flashcards,
    };
  },
});

export const upsertItemFlashcards = mutation({
  args: {
    secret: v.string(),
    itemId: v.string(),
    flashcards: v.array(v.any()),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
    action: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        itemId: normalizeIdOrThrow(ctx, "structure_items", args.itemId, "itemId"),
        entityType: "flashcards",
        entityId: args.itemId,
        action: args.action ?? "publish",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const { id: itemId, doc: item } = await getByIdOrThrow(ctx, "structure_items", args.itemId, "itemId");
        if (item.item_type !== "file") {
          throw new Error("Flashcards are only supported for item_type=file");
        }
        const normalized = normalizeFlashcardsInput(args.flashcards as Array<Record<string, unknown>>);
        const payload = JSON.stringify(normalized);
        const existing = await ctx.db
          .query("note_contents")
          .withIndex("by_item", (q) => q.eq("itemId", itemId))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, { flashcards_json: payload });
          return { noteId: existing._id, flashcardsCount: normalized.length };
        }
        const noteId = await ctx.db.insert("note_contents", { itemId, flashcards_json: payload });
        return { noteId, flashcardsCount: normalized.length };
      },
    );
  },
});

export const getItemAttachedQuiz = query({
  args: { secret: v.string(), itemId: v.string() },
  handler: async (ctx, { secret, itemId }) => {
    requireServiceSecret(secret);
    const { id: normalizedItemId } = await getByIdOrThrow(ctx, "structure_items", itemId, "itemId");
    const quiz = await ctx.db
      .query("attached_quizzes")
      .withIndex("by_note_item", (q) => q.eq("noteItemId", normalizedItemId))
      .first();
    if (!quiz) {
      return { quiz: null, questions: [] };
    }
    const questions = await ctx.db
      .query("quiz_questions")
      .withIndex("by_quiz", (q) => q.eq("quizId", quiz._id))
      .collect();
    questions.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    return { quiz, questions };
  },
});

export const saveItemAttachedQuiz = mutation({
  args: {
    secret: v.string(),
    itemId: v.string(),
    title: v.string(),
    passing_score: v.optional(v.number()),
    questions: v.array(
      v.object({
        questionText: v.string(),
        options: v.array(v.string()),
        correctAnswer: v.string(),
        explanation: v.optional(v.string()),
      }),
    ),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
    action: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        itemId: normalizeIdOrThrow(ctx, "structure_items", args.itemId, "itemId"),
        entityType: "quiz",
        entityId: args.itemId,
        action: args.action ?? "publish",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const { id: itemId, doc: item } = await getByIdOrThrow(ctx, "structure_items", args.itemId, "itemId");
        if (item.item_type !== "file") {
          throw new Error("Attached quizzes are only supported for item_type=file");
        }

        let quiz = await ctx.db
          .query("attached_quizzes")
          .withIndex("by_note_item", (q) => q.eq("noteItemId", itemId))
          .first();

        let quizId: Id<"attached_quizzes">;
        if (!quiz) {
          quizId = await ctx.db.insert("attached_quizzes", {
            noteItemId: itemId,
            note_item_id: itemId,
            title: args.title,
            passing_score: args.passing_score ?? 60,
          });
        } else {
          quizId = quiz._id;
          await ctx.db.patch(quizId, {
            title: args.title,
            passing_score: args.passing_score ?? quiz.passing_score ?? 60,
            noteItemId: itemId,
            note_item_id: itemId,
          });
        }

        const newQuestionIds: Id<"quiz_questions">[] = [];
        let index = 0;
        for (const question of args.questions) {
          if (!Array.isArray(question.options) || question.options.length !== 4) {
            throw new Error("Each question must include exactly 4 options");
          }
          const normalizedOptions = question.options.map((option) => option.trim());
          if (normalizedOptions.some((option) => !option)) {
            throw new Error("Quiz options cannot be empty");
          }
          const normalizedCorrectAnswer = normalizeQuizCorrectAnswer(
            normalizedOptions,
            question.correctAnswer,
          );

          const questionId = await ctx.db.insert("quiz_questions", {
            quizId,
            quiz_id: quizId,
            question_text: question.questionText,
            options: normalizedOptions,
            correct_answer: normalizedCorrectAnswer,
            explanation: question.explanation,
            order_index: index++,
          });
          newQuestionIds.push(questionId);
        }

        const existingQuestions = await ctx.db
          .query("quiz_questions")
          .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
          .collect();
        for (const oldQuestion of existingQuestions) {
          if (!newQuestionIds.includes(oldQuestion._id)) {
            await ctx.db.delete(oldQuestion._id);
          }
        }

        quiz = await ctx.db.get(quizId);
        return {
          quizId,
          questionCount: newQuestionIds.length,
          quiz,
        };
      },
    );
  },
});

export const importCourseStructure = mutation({
  args: {
    secret: v.string(),
    courseName: v.string(),
    courseDescription: v.optional(v.string()),
    items: v.array(
      v.object({
        tempId: v.string(),
        parentTempId: v.optional(v.union(v.string(), v.null())),
        item_type: v.string(),
        title: v.string(),
        order_index: v.number(),
      }),
    ),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "course",
        action: "import_structure",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        validateStructureImport(args.items);

        const createdAt = nowIso();
        const courseId = await ctx.db.insert("courses", {
          name: args.courseName,
          description: args.courseDescription ?? "",
          is_active: false,
          is_free: false,
          price: 0,
          created_at: createdAt,
          updated_at: createdAt,
        });

        const idMap = new Map<string, Id<"structure_items">>();
        const childrenByParent = new Map<string | null, typeof args.items>();
        for (const item of args.items) {
          const parentKey = item.parentTempId ?? null;
          const group = childrenByParent.get(parentKey) ?? [];
          group.push(item);
          childrenByParent.set(parentKey, group);
        }

        const queue = [...(childrenByParent.get(null) ?? [])];
        let processedCount = 0;
        while (queue.length > 0) {
          const current = queue.shift();
          if (!current) break;
          const parentId = current.parentTempId ? idMap.get(current.parentTempId) : undefined;
          if (current.parentTempId && !parentId) {
            throw new Error(`Parent tempId not resolved: ${current.parentTempId}`);
          }
          const itemId = await ctx.db.insert("structure_items", {
            courseId,
            parentId,
            item_type: current.item_type,
            title: current.title,
            order_index: current.order_index,
            is_active: true,
          });
          idMap.set(current.tempId, itemId);
          processedCount++;
          const children = childrenByParent.get(current.tempId);
          if (children) queue.push(...children);
        }

        if (processedCount !== args.items.length) {
          throw new Error("Failed to process all items. Check for cyclic hierarchy.");
        }

        return {
          courseId,
          createdItems: processedCount,
        };
      },
    );
  },
});

export const createCrashCourse = mutation({
  args: {
    secret: v.string(),
    name: v.string(),
    description: v.string(),
    sourceCourseIds: v.array(v.string()),
    orderIndex: v.optional(v.number()),
    activate: v.optional(v.boolean()),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "course",
        action: "create_crash_course",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const sourceCourses = [];
        for (const sourceId of args.sourceCourseIds) {
          const sourceCourse = await getByIdOrThrow(ctx, "courses", sourceId, "sourceCourseId");
          sourceCourses.push(sourceCourse.doc);
        }
        if (sourceCourses.length === 0) {
          throw new Error("At least one source course is required");
        }

        const createdAt = nowIso();
        const newCourseId = await ctx.db.insert("courses", {
          name: args.name,
          description: args.description,
          is_active: args.activate ?? false,
          is_free: false,
          price: 0,
          created_at: createdAt,
          updated_at: createdAt,
        });

        let folderOrder = args.orderIndex ?? 0;
        for (const sourceCourse of sourceCourses) {
          const items = await ctx.db
            .query("structure_items")
            .withIndex("by_course", (q) => q.eq("courseId", sourceCourse._id))
            .collect();
          if (items.length === 0) continue;

          const childrenByParent = new Map<string | null, Array<Doc<"structure_items">>>();
          for (const item of items) {
            const key = item.parentId ?? null;
            const list = childrenByParent.get(key) ?? [];
            list.push(item);
            childrenByParent.set(key, list);
          }
          for (const list of childrenByParent.values()) {
            list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
          }

          const rootFolderId = await ctx.db.insert("structure_items", {
            courseId: newCourseId,
            item_type: "folder",
            title: sourceCourse.name,
            order_index: folderOrder++,
            is_active: true,
          });

          const queue: Array<{ oldParentId: Id<"structure_items"> | null; newParentId: Id<"structure_items"> }> = [
            { oldParentId: null, newParentId: rootFolderId },
          ];

          while (queue.length > 0) {
            const entry = queue.shift();
            if (!entry) break;
            const children = childrenByParent.get(entry.oldParentId ?? null) ?? [];
            for (const child of children) {
              const clonedId = await ctx.db.insert("structure_items", {
                courseId: newCourseId,
                parentId: entry.newParentId,
                item_type: child.item_type,
                title: child.title,
                description: child.description,
                order_index: child.order_index,
                icon: child.icon,
                is_active: child.is_active ?? true,
                pdf_url: child.pdf_url,
              });
              if (child.item_type === "folder") {
                queue.push({ oldParentId: child._id, newParentId: clonedId });
              }
            }
          }
        }

        return { courseId: newCourseId };
      },
    );
  },
});

export const listDailyNews = query({
  args: {
    secret: v.string(),
    date: v.optional(v.string()),
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    subject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    let rows: Doc<"daily_news">[] = [];
    if (args.date) {
      rows = await ctx.db
        .query("daily_news")
        .withIndex("by_date", (q) => q.eq("date", args.date as string))
        .collect();
    } else if (args.status) {
      rows = await ctx.db
        .query("daily_news")
        .withIndex("by_status", (q) => q.eq("status", args.status as string))
        .collect();
    } else {
      rows = await ctx.db.query("daily_news").collect();
    }

    if (args.status) rows = rows.filter((row) => row.status === args.status);
    if (args.category) rows = rows.filter((row) => row.category === args.category);
    if (args.subject) rows = rows.filter((row) => row.subject === args.subject);

    rows.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (a.display_order ?? 0) - (b.display_order ?? 0);
    });
    return rows;
  },
});

export const createDailyNewsRows = mutation({
  args: {
    secret: v.string(),
    rows: v.array(v.any()),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "daily_news",
        action: "create",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const ids: Id<"daily_news">[] = [];
        for (const rawRow of args.rows as Array<Record<string, unknown>>) {
          const row = pickAllowedPatch(rawRow, DAILY_NEWS_FIELDS);
          if (typeof row.date !== "string" || row.date.trim() === "") {
            throw new Error("Each daily news row must include date");
          }
          const id = await ctx.db.insert("daily_news", row as Doc<"daily_news">);
          ids.push(id);
        }
        return { ids };
      },
    );
  },
});

export const updateDailyNewsRow = mutation({
  args: {
    secret: v.string(),
    newsId: v.string(),
    patch: v.any(),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "daily_news",
        entityId: args.newsId,
        action: "update",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const { id: newsId } = await getByIdOrThrow(ctx, "daily_news", args.newsId, "newsId");
        const patch = pickAllowedPatch(
          typeof args.patch === "object" && args.patch ? (args.patch as Record<string, unknown>) : {},
          DAILY_NEWS_FIELDS,
        );
        await ctx.db.patch(newsId, patch);
        return { newsId };
      },
    );
  },
});

export const listStandaloneQuizzes = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    requireServiceSecret(secret);
    const quizzes = await ctx.db.query("standalone_quizzes").collect();
    const questions = await ctx.db.query("standalone_questions").collect();
    const questionCounts = new Map<string, number>();
    for (const question of questions) {
      const key = question.quiz_id as string;
      questionCounts.set(key, (questionCounts.get(key) ?? 0) + 1);
    }
    return quizzes.map((quiz) => ({
      ...quiz,
      question_count: questionCounts.get(quiz._id as string) ?? 0,
    }));
  },
});

export const createStandaloneQuiz = mutation({
  args: {
    secret: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    subject_id: v.optional(v.string()),
    order_index: v.optional(v.number()),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "standalone_quiz",
        action: "create",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        let subjectId: Id<"subjects"> | undefined;
        if (args.subject_id) {
          subjectId = normalizeIdOrThrow(ctx, "subjects", args.subject_id, "subject_id");
        }
        const quizId = await ctx.db.insert("standalone_quizzes", {
          title: args.title,
          description: args.description,
          subject_id: subjectId,
          order_index: args.order_index,
        });
        return { quizId };
      },
    );
  },
});

export const updateStandaloneQuiz = mutation({
  args: {
    secret: v.string(),
    quizId: v.string(),
    patch: v.any(),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "standalone_quiz",
        entityId: args.quizId,
        action: "update",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const { id: quizId } = await getByIdOrThrow(ctx, "standalone_quizzes", args.quizId, "quizId");
        const rawPatch =
          typeof args.patch === "object" && args.patch ? (args.patch as Record<string, unknown>) : {};
        const patch = pickAllowedPatch(rawPatch, STANDALONE_QUIZ_PATCH_FIELDS);
        if (patch.subject_id !== undefined && typeof patch.subject_id === "string") {
          patch.subject_id = normalizeIdOrThrow(ctx, "subjects", patch.subject_id, "subject_id");
        }
        await ctx.db.patch(quizId, patch);
        return { quizId };
      },
    );
  },
});

export const listStandaloneQuizQuestions = query({
  args: { secret: v.string(), quizId: v.string() },
  handler: async (ctx, { secret, quizId }) => {
    requireServiceSecret(secret);
    const { id: normalizedQuizId } = await getByIdOrThrow(ctx, "standalone_quizzes", quizId, "quizId");
    const questions = await ctx.db
      .query("standalone_questions")
      .withIndex("by_quiz", (q) => q.eq("quiz_id", normalizedQuizId))
      .collect();
    questions.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    return questions;
  },
});

export const createStandaloneQuestion = mutation({
  args: {
    secret: v.string(),
    quizId: v.string(),
    question_text: v.string(),
    option_a: v.optional(v.string()),
    option_b: v.optional(v.string()),
    option_c: v.optional(v.string()),
    option_d: v.optional(v.string()),
    correct_answer: v.string(),
    explanation: v.optional(v.string()),
    order_index: v.optional(v.number()),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "standalone_question",
        action: "create",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const quizId = normalizeIdOrThrow(ctx, "standalone_quizzes", args.quizId, "quizId");
        const questionId = await ctx.db.insert("standalone_questions", {
          quiz_id: quizId,
          question_text: args.question_text,
          option_a: args.option_a,
          option_b: args.option_b,
          option_c: args.option_c,
          option_d: args.option_d,
          correct_answer: args.correct_answer,
          explanation: args.explanation,
          order_index: args.order_index,
        });
        return { questionId };
      },
    );
  },
});

export const updateStandaloneQuestion = mutation({
  args: {
    secret: v.string(),
    questionId: v.string(),
    patch: v.any(),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "standalone_question",
        entityId: args.questionId,
        action: "update",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const { id: questionId } = await getByIdOrThrow(
          ctx,
          "standalone_questions",
          args.questionId,
          "questionId",
        );
        const patch = pickAllowedPatch(
          typeof args.patch === "object" && args.patch ? (args.patch as Record<string, unknown>) : {},
          STANDALONE_QUESTION_PATCH_FIELDS,
        );
        await ctx.db.patch(questionId, patch);
        return { questionId };
      },
    );
  },
});

export const listPyqTests = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    requireServiceSecret(secret);
    const tests = await ctx.db.query("pyq_tests").collect();
    const questions = await ctx.db.query("pyq_questions").collect();
    const questionCounts = new Map<string, number>();
    for (const question of questions) {
      const key = question.test_id as string;
      questionCounts.set(key, (questionCounts.get(key) ?? 0) + 1);
    }
    return tests
      .map((test) => ({
        ...test,
        question_count: questionCounts.get(test._id as string) ?? 0,
      }))
      .sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const createPyqTest = mutation({
  args: {
    secret: v.string(),
    title: v.string(),
    exam_name: v.optional(v.string()),
    year: v.optional(v.number()),
    duration_minutes: v.optional(v.number()),
    total_marks: v.optional(v.number()),
    negative_marking: v.optional(v.number()),
    instructions: v.optional(v.string()),
    is_published: v.optional(v.boolean()),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "pyq_test",
        action: "create",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const testId = await ctx.db.insert("pyq_tests", {
          title: args.title,
          exam_name: args.exam_name,
          year: args.year,
          duration_minutes: args.duration_minutes,
          total_marks: args.total_marks,
          negative_marking: args.negative_marking,
          instructions: args.instructions,
          is_published: args.is_published ?? false,
        });
        return { testId };
      },
    );
  },
});

export const updatePyqTest = mutation({
  args: {
    secret: v.string(),
    testId: v.string(),
    patch: v.any(),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "pyq_test",
        entityId: args.testId,
        action: "update",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const { id: testId } = await getByIdOrThrow(ctx, "pyq_tests", args.testId, "testId");
        const patch = pickAllowedPatch(
          typeof args.patch === "object" && args.patch ? (args.patch as Record<string, unknown>) : {},
          PYQ_TEST_PATCH_FIELDS,
        );
        await ctx.db.patch(testId, patch);
        return { testId };
      },
    );
  },
});

export const listPyqPassages = query({
  args: { secret: v.string(), testId: v.string() },
  handler: async (ctx, { secret, testId }) => {
    requireServiceSecret(secret);
    const normalizedTestId = normalizeIdOrThrow(ctx, "pyq_tests", testId, "testId");
    const passages = await ctx.db
      .query("pyq_passages")
      .withIndex("by_test", (q) => q.eq("test_id", normalizedTestId))
      .collect();
    passages.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    return passages;
  },
});

export const createPyqPassage = mutation({
  args: {
    secret: v.string(),
    testId: v.string(),
    passage_text: v.string(),
    citation: v.optional(v.string()),
    section_number: v.optional(v.string()),
    subject: v.optional(v.string()),
    order_index: v.optional(v.number()),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "pyq_passage",
        entityId: args.testId,
        action: "create",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const testId = normalizeIdOrThrow(ctx, "pyq_tests", args.testId, "testId");
        const passageId = await ctx.db.insert("pyq_passages", {
          test_id: testId,
          passage_text: args.passage_text,
          citation: args.citation,
          section_number: args.section_number,
          subject: args.subject,
          order_index: args.order_index,
        });
        return { passageId };
      },
    );
  },
});

export const updatePyqPassage = mutation({
  args: {
    secret: v.string(),
    passageId: v.string(),
    patch: v.any(),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "pyq_passage",
        entityId: args.passageId,
        action: "update",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const { id: passageId } = await getByIdOrThrow(ctx, "pyq_passages", args.passageId, "passageId");
        const patch = pickAllowedPatch(
          typeof args.patch === "object" && args.patch ? (args.patch as Record<string, unknown>) : {},
          PYQ_PASSAGE_PATCH_FIELDS,
        );
        await ctx.db.patch(passageId, patch);
        return { passageId };
      },
    );
  },
});

export const listPyqQuestions = query({
  args: { secret: v.string(), testId: v.string() },
  handler: async (ctx, { secret, testId }) => {
    requireServiceSecret(secret);
    const normalizedTestId = normalizeIdOrThrow(ctx, "pyq_tests", testId, "testId");
    const questions = await ctx.db
      .query("pyq_questions")
      .withIndex("by_test", (q) => q.eq("test_id", normalizedTestId))
      .collect();
    questions.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    return questions;
  },
});

export const createPyqQuestion = mutation({
  args: {
    secret: v.string(),
    testId: v.string(),
    passage_id: v.optional(v.string()),
    order_index: v.optional(v.number()),
    question_text: v.string(),
    option_a: v.optional(v.string()),
    option_b: v.optional(v.string()),
    option_c: v.optional(v.string()),
    option_d: v.optional(v.string()),
    correct_answer: v.optional(v.string()),
    explanation: v.optional(v.string()),
    marks: v.optional(v.number()),
    question_type: v.optional(v.string()),
    subject: v.optional(v.string()),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "pyq_question",
        entityId: args.testId,
        action: "create",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const testId = normalizeIdOrThrow(ctx, "pyq_tests", args.testId, "testId");
        let passageId: Id<"pyq_passages"> | undefined;
        if (args.passage_id) {
          const passage = await getByIdOrThrow(ctx, "pyq_passages", args.passage_id, "passage_id");
          if (passage.doc.test_id !== testId) {
            throw new Error("passage_id does not belong to the specified testId");
          }
          passageId = passage.id;
        }
        const questionId = await ctx.db.insert("pyq_questions", {
          test_id: testId,
          passage_id: passageId,
          order_index: args.order_index,
          question_text: args.question_text,
          option_a: args.option_a,
          option_b: args.option_b,
          option_c: args.option_c,
          option_d: args.option_d,
          correct_answer: args.correct_answer,
          explanation: args.explanation,
          marks: args.marks,
          question_type: args.question_type,
          subject: args.subject,
        });
        return { questionId };
      },
    );
  },
});

export const updatePyqQuestion = mutation({
  args: {
    secret: v.string(),
    questionId: v.string(),
    patch: v.any(),
    source: v.optional(v.string()),
    provider: v.optional(v.string()),
    idempotency_key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceSecret(args.secret);
    return withAudit(
      ctx,
      {
        entityType: "pyq_question",
        entityId: args.questionId,
        action: "update",
        source: args.source,
        provider: args.provider,
        idempotency_key: args.idempotency_key,
      },
      async () => {
        const { id: questionId, doc: question } = await getByIdOrThrow(
          ctx,
          "pyq_questions",
          args.questionId,
          "questionId",
        );
        const rawPatch =
          typeof args.patch === "object" && args.patch ? (args.patch as Record<string, unknown>) : {};
        const patch = pickAllowedPatch(rawPatch, PYQ_QUESTION_PATCH_FIELDS);
        if (patch.passage_id !== undefined) {
          if (patch.passage_id === null) {
            patch.passage_id = undefined;
          } else if (typeof patch.passage_id === "string") {
            const passage = await getByIdOrThrow(ctx, "pyq_passages", patch.passage_id, "passage_id");
            if (passage.doc.test_id !== question.test_id) {
              throw new Error("passage_id must belong to the same test as the question");
            }
            patch.passage_id = passage.id;
          } else {
            throw new Error("passage_id must be a string or null");
          }
        }
        await ctx.db.patch(questionId, patch);
        return { questionId };
      },
    );
  },
});
