import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  // Convex Auth tables (authAccounts, authSessions, authRefreshTokens, etc.)
  ...authTables,

  // ─── Users & Profiles ────────────────────────────────────────────────────
  users: defineTable({
    email: v.string(),
    username: v.string(),
    full_name: v.optional(v.string()),
    avatar_url: v.optional(v.string()),
    total_coins: v.number(),
    streak_count: v.number(),
    longest_streak: v.number(),
    last_activity_date: v.optional(v.string()),
    dark_mode: v.boolean(),
    // tokenIdentifier links to Convex Auth identity
    tokenIdentifier: v.string(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"])
    .index("by_username", ["username"]),

  profiles: defineTable({
    userId: v.id("users"),
    email: v.string(),
    full_name: v.optional(v.string()),
    avatar_url: v.optional(v.string()),
    phone_verified: v.optional(v.boolean()),
    email_verified: v.optional(v.boolean()),
    email_marketing_consent: v.optional(v.boolean()),
    consent_timestamp: v.optional(v.string()),
    consent_source: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  otps: defineTable({
    identifier: v.string(),
    channel: v.union(v.literal("whatsapp"), v.literal("email")),
    otp_hash: v.string(),
    expires_at: v.string(),
    attempts: v.number(),
  }).index("by_identifier", ["identifier"]),

  user_sessions: defineTable({
    userId: v.id("users"),
    device_id: v.string(),
    device_info: v.any(),
    session_started_at: v.string(),
    last_active_at: v.string(),
    logged_out_at: v.optional(v.string()),
    ip_address: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_device", ["device_id"])
    .index("by_user_active", ["userId", "logged_out_at"]),

  user_concurrency_state: defineTable({
    userId: v.id("users"),
    concurrency_level: v.number(),
    overlap_started_at: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // ─── Courses & Content Structure ─────────────────────────────────────────
  courses: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    is_active: v.optional(v.boolean()),
    is_free: v.optional(v.boolean()),
    icon: v.optional(v.string()),
  }),

  subjects: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    courseId: v.optional(v.id("courses")),
    order_index: v.optional(v.number()),
  }).index("by_course", ["courseId"]),

  quizzes: defineTable({
    subjectId: v.id("subjects"),
    title: v.string(),
    description: v.string(),
    order_index: v.number(),
  }).index("by_subject", ["subjectId"]),

  questions: defineTable({
    quizId: v.id("quizzes"),
    question_text: v.string(),
    option_a: v.string(),
    option_b: v.string(),
    option_c: v.string(),
    option_d: v.string(),
    correct_answer: v.union(
      v.literal("A"),
      v.literal("B"),
      v.literal("C"),
      v.literal("D")
    ),
    explanation: v.string(),
    order_index: v.number(),
  }).index("by_quiz", ["quizId"]),

  structure_items: defineTable({
    courseId: v.optional(v.id("courses")),
    parentId: v.optional(v.id("structure_items")),
    title: v.string(),
    description: v.optional(v.string()),
    item_type: v.string(),
    order_index: v.optional(v.number()),
    icon: v.optional(v.string()),
    is_active: v.optional(v.boolean()),
    pdf_url: v.optional(v.string()),
  })
    .index("by_course", ["courseId"])
    .index("by_parent", ["parentId"]),

  note_contents: defineTable({
    itemId: v.optional(v.id("structure_items")),
    content_html: v.optional(v.string()),
    flashcards_json: v.optional(v.string()),
  })
    .index("by_item", ["itemId"])
    .searchIndex("search_content", { searchField: "content_html" }),

  note_pdf_links: defineTable({
    itemId: v.id("structure_items"),
    link_id: v.string(),
    pdf_page: v.number(),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
    label: v.optional(v.string()),
  }).index("by_item", ["itemId"]),

  attached_quizzes: defineTable({
    note_item_id: v.optional(v.id("structure_items")),
    noteItemId: v.optional(v.id("structure_items")),
    title: v.optional(v.string()),
    passing_score: v.optional(v.number()),
  }).index("by_note_item", ["noteItemId"])
    .index("by_item", ["note_item_id"]),

  quiz_questions: defineTable({
    quiz_id: v.optional(v.id("attached_quizzes")),
    quizId: v.optional(v.id("attached_quizzes")),
    question_text: v.string(),
    options: v.array(v.string()),
    correct_answer: v.string(),
    explanation: v.optional(v.string()),
    order_index: v.optional(v.number()),
  }).index("by_quiz", ["quizId"])
    .index("by_quiz_new", ["quiz_id"]),

  // ─── Quiz & Mock Attempts ─────────────────────────────────────────────────
  quiz_attempts: defineTable({
    userId: v.id("users"),
    quizId: v.id("attached_quizzes"),
    score: v.number(),
    total_questions: v.number(),
    time_taken: v.number(),
    completed_at: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_quiz", ["userId", "quizId"]),

  quiz_answers: defineTable({
    attemptId: v.id("quiz_attempts"),
    questionId: v.string(),
    selected_answer: v.string(),
    confidence: v.union(
      v.literal("confident"),
      v.literal("guess"),
      v.literal("fluke")
    ),
    is_correct: v.boolean(),
  }).index("by_attempt", ["attemptId"]),

  quiz_answer_confidence: defineTable({
    userId: v.id("users"),
    quizId: v.optional(v.id("attached_quizzes")),
    questionId: v.optional(v.string()),
    confidence_level: v.string(),
    answer_was_correct: v.boolean(),
    is_initial_attempt: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_quiz", ["userId", "quizId"]),

  mock_tests: defineTable({
    title: v.string(),
    description: v.string(),
    total_questions: v.number(),
    duration_minutes: v.number(),
    is_active: v.boolean(),
  }),

  mock_test_questions: defineTable({
    mockTestId: v.id("mock_tests"),
    question_text: v.string(),
    option_a: v.string(),
    option_b: v.string(),
    option_c: v.string(),
    option_d: v.string(),
    correct_answer: v.string(),
    explanation: v.optional(v.string()),
    subject: v.optional(v.string()),
    order_index: v.number(),
  }).index("by_mock_test", ["mockTestId"]),

  mock_attempts: defineTable({
    userId: v.id("users"),
    mockTestId: v.id("mock_tests"),
    score: v.number(),
    total_questions: v.number(),
    time_taken: v.number(),
    completed_at: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_mock", ["userId", "mockTestId"]),

  mock_answers: defineTable({
    attemptId: v.id("mock_attempts"),
    questionId: v.string(),
    selected_answer: v.string(),
    confidence: v.union(
      v.literal("confident"),
      v.literal("guess"),
      v.literal("fluke")
    ),
    is_correct: v.boolean(),
    time_spent: v.optional(v.number()),
    subject: v.optional(v.string()),
  }).index("by_attempt", ["attemptId"]),

  // ─── Mistakes & Learning ──────────────────────────────────────────────────
  mistakes: defineTable({
    userId: v.id("users"),
    questionId: v.string(),
    subjectId: v.optional(v.string()),
    review_count: v.number(),
    source_type: v.union(v.literal("quiz"), v.literal("mock")),
    source_id: v.string(),
    is_mastered: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_question", ["userId", "questionId"])
    .index("by_user_subject", ["userId", "subjectId"]),

  question_memory_states: defineTable({
    userId: v.id("users"),
    quizId: v.id("attached_quizzes"),
    questionId: v.string(),
    bucket: v.union(
      v.literal("A"),
      v.literal("B"),
      v.literal("C"),
      v.literal("D"),
      v.literal("E"),
      v.literal("F")
    ),
    times_shown: v.number(),
    times_correct: v.number(),
    last_was_wrong: v.optional(v.boolean()),
    last_shown_at: v.optional(v.string()),
    last_confidence: v.optional(v.string()),
  })
    .index("by_user_quiz", ["userId", "quizId"])
    .index("by_user_quiz_question", ["userId", "quizId", "questionId"])
    .index("by_bucket", ["bucket"]),

  spaced_repetition_schedules: defineTable({
    userId: v.id("users"),
    quizId: v.id("attached_quizzes"),
    current_stage_index: v.number(),
    next_due_at: v.optional(v.string()),
    last_completed_at: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("archived")
    ),
    meta_stats: v.optional(v.any()),
  })
    .index("by_user", ["userId"])
    .index("by_user_quiz", ["userId", "quizId"])
    .index("by_user_due", ["userId", "next_due_at"]),

  // ─── Gamification & Streaks ───────────────────────────────────────────────
  user_streaks: defineTable({
    userId: v.id("users"),
    username: v.string(),
    current_streak: v.number(),
    longest_streak: v.number(),
    last_activity_date: v.optional(v.string()),
    total_score: v.number(),
    total_quizzes_completed: v.number(),
    total_cases_studied: v.number(),
    total_pyq_attempted: v.number(),
    bonuses_claimed: v.optional(v.array(v.number())),
  })
    .index("by_user", ["userId"])
    .index("by_streak", ["current_streak"])
    .index("by_score", ["total_score"]),

  daily_activity: defineTable({
    userId: v.id("users"),
    activity_date: v.string(),
    quizzes_completed: v.number(),
    mocks_completed: v.number(),
    mistakes_cleared: v.number(),
    time_spent: v.number(),
    coins_earned: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "activity_date"]),

  activity_log: defineTable({
    userId: v.id("users"),
    activity_type: v.union(
      v.literal("quiz"),
      v.literal("mock"),
      v.literal("mistake_quiz"),
      v.literal("explanation_viewed")
    ),
    activity_id: v.optional(v.string()),
    subject: v.optional(v.string()),
    duration: v.optional(v.number()),
    coins_earned: v.number(),
  }).index("by_user", ["userId"]),

  subject_performance: defineTable({
    userId: v.id("users"),
    subjectId: v.string(),
    total_attempts: v.number(),
    total_correct: v.number(),
    total_questions: v.number(),
    average_accuracy: v.number(),
    average_time_per_question: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_subject", ["userId", "subjectId"]),

  weekly_performance: defineTable({
    userId: v.id("users"),
    week_start: v.string(),
    quizzes_completed: v.number(),
    mocks_completed: v.number(),
    total_questions: v.number(),
    total_correct: v.number(),
    average_accuracy: v.number(),
    time_spent: v.number(),
    coins_earned: v.number(),
    active_days: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_week", ["userId", "week_start"]),

  user_points: defineTable({
    userId: v.id("users"),
    username: v.string(),
    month: v.string(),
    monthly_points: v.number(),
    all_time_points: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_month", ["userId", "month"])
    .index("by_monthly_points", ["month", "monthly_points"]),

  streak_bonuses: defineTable({
    streak_days: v.number(),
    bonus_points: v.number(),
    badge_name: v.optional(v.string()),
    badge_emoji: v.optional(v.string()),
  }).index("by_streak_days", ["streak_days"]),

  badges: defineTable({
    userId: v.id("users"),
    badge_type: v.union(
      v.literal("accuracy_champ"),
      v.literal("speedster"),
      v.literal("consistent_learner"),
      v.literal("insight_seeker")
    ),
    badge_level: v.union(
      v.literal("bronze"),
      v.literal("silver"),
      v.literal("gold")
    ),
    achieved_at: v.string(),
    metadata: v.optional(v.any()),
  }).index("by_user", ["userId"]),

  badge_progress: defineTable({
    userId: v.id("users"),
    badge_type: v.union(
      v.literal("accuracy_champ"),
      v.literal("speedster"),
      v.literal("consistent_learner"),
      v.literal("insight_seeker")
    ),
    current_value: v.number(),
    bronze_achieved: v.boolean(),
    silver_achieved: v.boolean(),
    gold_achieved: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "badge_type"]),

  // ─── Game Arena ───────────────────────────────────────────────────────────
  game_lobbies: defineTable({
    mode: v.union(
      v.literal("duel"),
      v.literal("arena"),
      v.literal("tagteam"),
      v.literal("speed_court")
    ),
    status: v.union(
      v.literal("waiting"),
      v.literal("active"),
      v.literal("finished"),
      v.literal("cancelled")
    ),
    question_ids: v.array(v.string()),
    current_round: v.optional(v.number()),
    max_rounds: v.optional(v.number()),
    started_at: v.optional(v.string()),
    finished_at: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_mode", ["mode"])
    .index("by_mode_status", ["mode", "status"]),

  game_players: defineTable({
    lobbyId: v.id("game_lobbies"),
    userId: v.optional(v.id("users")),
    display_name: v.string(),
    avatar_url: v.optional(v.string()),
    score: v.number(),
    current_question: v.optional(v.number()),
    is_bot: v.boolean(),
    eliminated_round: v.optional(v.number()),
    final_rank: v.optional(v.number()),
  })
    .index("by_lobby", ["lobbyId"])
    .index("by_user", ["userId"]),

  game_answers: defineTable({
    lobbyId: v.id("game_lobbies"),
    playerId: v.id("game_players"),
    questionId: v.string(),
    round: v.number(),
    question_order: v.number(),
    answer: v.optional(v.string()),
    is_correct: v.boolean(),
    time_taken_ms: v.number(),
    points_earned: v.optional(v.number()),
  })
    .index("by_lobby", ["lobbyId"])
    .index("by_player", ["playerId"]),

  game_events: defineTable({
    lobbyId: v.id("game_lobbies"),
    event_type: v.string(),
    payload: v.any(),
  }).index("by_lobby", ["lobbyId"]),

  coin_transactions: defineTable({
    userId: v.id("users"),
    lobbyId: v.optional(v.id("game_lobbies")),
    amount: v.number(),
    source: v.string(),
    description: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // ─── Content & Cases ──────────────────────────────────────────────────────
  contemporary_cases: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    year: v.number(),
    month: v.number(),
    subject: v.optional(v.string()),
    case_summary: v.optional(v.string()),
  }).index("by_year_month", ["year", "month"]),

  contemporary_case_questions: defineTable({
    caseId: v.id("contemporary_cases"),
    question_text: v.string(),
    option_a: v.string(),
    option_b: v.string(),
    option_c: v.string(),
    option_d: v.string(),
    correct_answer: v.union(
      v.literal("A"),
      v.literal("B"),
      v.literal("C"),
      v.literal("D")
    ),
    explanation: v.optional(v.string()),
    order_index: v.number(),
  }).index("by_case", ["caseId"]),

  // ─── Payments & Purchases ─────────────────────────────────────────────────
  user_courses: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    course_name: v.optional(v.string()),
    course_price: v.optional(v.number()),
    order_id: v.optional(v.string()),
    purchased_at: v.string(),
    expires_at: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("refunded")
    ),
  })
    .index("by_user", ["userId"])
    .index("by_user_course", ["userId", "courseId"])
    .index("by_status", ["status"]),

  payment_orders: defineTable({
    order_id: v.string(),
    userId: v.id("users"),
    courseId: v.id("courses"),
    amount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("success"),
      v.literal("failed")
    ),
    payment_method: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_order_id", ["order_id"]),

  user_completed_items: defineTable({
    userId: v.id("users"),
    itemId: v.id("structure_items"),
    courseId: v.optional(v.id("courses")),
    completed_at: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_item", ["userId", "itemId"]),

  draft_content_cache: defineTable({
    userId: v.optional(v.id("users")),
    original_content_id: v.string(),
    draft_data: v.optional(v.any()),
  }).index("by_user", ["userId"])
    .index("by_content", ["original_content_id"]),
  
  // ─── Daily News ───────────────────────────────────────────────────────────
  daily_news: defineTable({
    date: v.string(),
    title: v.optional(v.string()),
    content_custom: v.optional(v.string()),
    content_html: v.optional(v.string()),
    summary: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    source_paper: v.optional(v.string()),
    status: v.optional(v.string()),
    display_order: v.optional(v.number()),
    subject: v.optional(v.string()),
    topic: v.optional(v.string()),
    court: v.optional(v.string()),
    priority: v.optional(v.string()),
    exam_probability: v.optional(v.string()),
    capsule: v.optional(v.string()),
    facts: v.optional(v.any()),
    provisions: v.optional(v.any()),
    holdings: v.optional(v.any()),
    doctrine: v.optional(v.any()),
    mcqs: v.optional(v.any()),
    source_url: v.optional(v.string()),
    read_seconds: v.optional(v.number()),
    exam_rank: v.optional(v.number()),
  }).index("by_date", ["date"])
    .index("by_status", ["status"]),

  standalone_quizzes: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    subject_id: v.optional(v.id("subjects")),
    order_index: v.optional(v.number()),
  }),

  standalone_questions: defineTable({
    quiz_id: v.id("standalone_quizzes"),
    question_text: v.string(),
    option_a: v.optional(v.string()),
    option_b: v.optional(v.string()),
    option_c: v.optional(v.string()),
    option_d: v.optional(v.string()),
    correct_answer: v.string(),
    explanation: v.optional(v.string()),
    order_index: v.optional(v.number()),
  }).index("by_quiz", ["quiz_id"]),

  pyq_tests: defineTable({
    title: v.string(),
    exam_name: v.optional(v.string()),
    year: v.optional(v.number()),
    duration_minutes: v.optional(v.number()),
    total_marks: v.optional(v.number()),
    negative_marking: v.optional(v.number()),
    instructions: v.optional(v.string()),
    is_published: v.optional(v.boolean()),
  }),

  pyq_passages: defineTable({
    test_id: v.id("pyq_tests"),
    passage_text: v.string(),
    citation: v.optional(v.string()),
    section_number: v.optional(v.string()),
    subject: v.optional(v.string()),
    order_index: v.optional(v.number()),
  }).index("by_test", ["test_id"]),

  pyq_questions: defineTable({
    test_id: v.id("pyq_tests"),
    passage_id: v.optional(v.id("pyq_passages")),
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
  }).index("by_test", ["test_id"]),

  case_notes: defineTable({
    case_number: v.string(),
    overall_content: v.optional(v.string()),
  }).index("by_case_number", ["case_number"]),

  telegram_sessions: defineTable({
    chat_id: v.number(),
    state: v.optional(v.string()),
    data: v.optional(v.any()),
    user_name: v.optional(v.string()),
  }).index("by_chat_id", ["chat_id"]),
});
