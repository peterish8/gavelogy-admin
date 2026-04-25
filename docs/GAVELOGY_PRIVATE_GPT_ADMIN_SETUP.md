# Gavelogy Private GPT/MCP Admin Setup

## 0) Billing / Product clarity

- This setup is for **ChatGPT.com private GPT Actions** usage.
- You can use it with a **ChatGPT Plus** account.
- This does **not** require separate OpenAI API credits just to run private GPT Actions in ChatGPT.com.

## 1) Environment setup (Vercel + Convex)

Set these environment variables in Vercel Project Settings:

- `ADMIN_API_SECRET`: long random secret used by all private admin API routes (`x-admin-secret` header)
- `MCP_ADMIN_SECRET`: optional dedicated secret for Convex private service layer  
  If omitted, Convex private layer falls back to `ADMIN_API_SECRET`.
- `NEXT_PUBLIC_CONVEX_URL` (or `CONVEX_URL`): Convex deployment URL

Recommended: keep `ADMIN_API_SECRET` and `MCP_ADMIN_SECRET` identical unless you need rotation isolation.

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Important:

- Never expose `ADMIN_API_SECRET` in frontend code.
- Never put admin secrets in client-side bundles or browser storage.

## 2) OpenAPI import into Private GPT Actions

Use this schema file:

- `public/gavelogy-admin-openapi.json`

In your Private GPT / Actions setup:

1. Import the OpenAPI JSON.
2. Configure auth header:
   - Header name: `x-admin-secret`
   - Value: your `ADMIN_API_SECRET`
3. Confirm base URL points to your deployed domain:
   - `https://<my-vercel-domain>`

## 3) Safety model

The private admin API only supports:

- `create`
- `read`
- `update`
- `publish`

Deletion is intentionally unavailable through GPT/MCP/API.

Manual delete actions remain UI-only in Gavelogy admin.

Forbidden through this API:

- deleting courses, items, notes, quizzes, questions, daily news, PYQ content
- deleting users/payments/auth/session/OTP data
- raw arbitrary table patching

## 4) Supported endpoint inventory

Capabilities:

- `GET /api/mcp/admin/capabilities`

Courses and structure:

- `GET /api/mcp/admin/courses`
- `POST /api/mcp/admin/courses`
- `PATCH /api/mcp/admin/courses/{courseId}`
- `GET /api/mcp/admin/courses/{courseId}/tree`
- `POST /api/mcp/admin/courses/{courseId}/items`
- `GET /api/mcp/admin/courses/{courseId}/bulk-status`
- `POST /api/mcp/admin/courses/import-structure`
- `POST /api/mcp/admin/courses/crash-course`
- `PATCH /api/mcp/admin/items/{itemId}`

Notes / flashcards / quiz:

- `GET /api/mcp/admin/items/{itemId}/note`
- `POST /api/mcp/admin/items/{itemId}/note`
- `PATCH /api/mcp/admin/items/{itemId}/note`
- `GET /api/mcp/admin/items/{itemId}/flashcards`
- `POST /api/mcp/admin/items/{itemId}/flashcards`
- `PATCH /api/mcp/admin/items/{itemId}/flashcards`
- `GET /api/mcp/admin/items/{itemId}/quiz`
- `POST /api/mcp/admin/items/{itemId}/quiz`
- `PATCH /api/mcp/admin/items/{itemId}/quiz`
- `POST /api/mcp/admin/items/{itemId}/publish-all`

Daily news:

- `GET /api/mcp/admin/daily-news`
- `POST /api/mcp/admin/daily-news`
- `PATCH /api/mcp/admin/daily-news/{newsId}`

Standalone quizzes:

- `GET /api/mcp/admin/standalone-quizzes`
- `POST /api/mcp/admin/standalone-quizzes`
- `PATCH /api/mcp/admin/standalone-quizzes/{quizId}`
- `GET /api/mcp/admin/standalone-quizzes/{quizId}/questions`
- `POST /api/mcp/admin/standalone-quizzes/{quizId}/questions`
- `PATCH /api/mcp/admin/standalone-questions/{questionId}`

PYQ:

- `GET /api/mcp/admin/pyq-tests`
- `POST /api/mcp/admin/pyq-tests`
- `PATCH /api/mcp/admin/pyq-tests/{testId}`
- `GET /api/mcp/admin/pyq-tests/{testId}/passages`
- `POST /api/mcp/admin/pyq-tests/{testId}/passages`
- `PATCH /api/mcp/admin/pyq-passages/{passageId}`
- `GET /api/mcp/admin/pyq-tests/{testId}/questions`
- `POST /api/mcp/admin/pyq-tests/{testId}/questions`
- `PATCH /api/mcp/admin/pyq-questions/{questionId}`

## 5) Curl examples

Set vars:

```bash
export BASE_URL="https://<my-vercel-domain>"
export ADMIN_SECRET="<your-admin-api-secret>"
```

List courses:

```bash
curl -sS "$BASE_URL/api/mcp/admin/courses" \
  -H "x-admin-secret: $ADMIN_SECRET"
```

Create course (inactive by default):

```bash
curl -sS -X POST "$BASE_URL/api/mcp/admin/courses" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{
    "name": "Contract Law",
    "description": "CLAT PG Contract Law course",
    "price": 0,
    "is_active": false,
    "is_free": false,
    "icon": "scale"
  }'
```

Create item:

```bash
curl -sS -X POST "$BASE_URL/api/mcp/admin/courses/<courseId>/items" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{
    "title": "Offer and Acceptance",
    "description": "Basic principles",
    "item_type": "folder",
    "order_index": 0,
    "is_active": true
  }'
```

Publish note + flashcards + quiz in one call:

```bash
curl -sS -X POST "$BASE_URL/api/mcp/admin/items/<itemId>/publish-all" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{
    "content_html": "[h2]Offer and Acceptance[/h2][p]...[/p]",
    "flashcards": [{"front":"What is offer?","back":"..."}],
    "quiz": {
      "title":"Offer and Acceptance Quiz",
      "questions":[
        {
          "questionText":"Which is correct?",
          "options":["A","B","C","D"],
          "correctAnswer":"A",
          "explanation":"..."
        }
      ]
    },
    "clear_draft": true,
    "source": "chatgpt-mcp"
  }'
```

Daily news update:

```bash
curl -sS -X PATCH "$BASE_URL/api/mcp/admin/daily-news/<newsId>" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"status":"published","summary":"Updated summary"}'
```

## 6) Private GPT system instruction

```txt
You are my private Gavelogy admin assistant.

You can create, read, update, and publish Gavelogy admin content using secured Gavelogy admin API endpoints.

You must never delete anything.
You must never ask for or expose secrets.
You must never modify users, payments, auth sessions, OTPs, or private account data.
You may create and update courses, folders, notes, flashcards, quizzes, daily news, PYQ content, and standalone quizzes if endpoints are available.

Before modifying any existing content:
1. Read the target course/item first.
2. Confirm the item identity from title and id.
3. Avoid overwriting complete content unless I clearly say overwrite.
4. Prefer creating missing content first.
5. For generated case notes, use Gavelogy bracket-tag format.
6. For final note + flashcards + quiz, use publish-all.
7. For course creation, create as inactive by default unless I say publish/activate.

Deletion is not available through this GPT. If deletion is needed, tell me to do it manually inside Gavelogy admin.
```

## 7) Notes generation style pack

Use this file as your canonical note-generation instruction and format guide:

- `docs/GAVELOGY_NOTES_MEGA_SYSTEM_PROMPT.md`

It includes:

- strict TipTap/bracket-tag allowlist
- allowed highlight colors and box colors only
- mega legal-notes system prompt
- style example block

MCP/API enforcement:

- `POST/PATCH /api/mcp/admin/items/{itemId}/note` and `POST /api/mcp/admin/items/{itemId}/publish-all` now reject unsupported note highlight colors and box colors.

## 8) Final safety reminder

Deletion stays manual inside Gavelogy admin only.
