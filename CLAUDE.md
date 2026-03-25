# Gavelogy Admin — Claude Code Configuration

## Project Identity
Gavelogy Admin is a Next.js 16 admin panel for a **CLAT PG law education platform**. It manages courses, case law notes, AI-generated quizzes/flashcards, PDF judgments, and a Telegram admin bot.

## Tech Stack
- **Framework**: Next.js 16.1.1 (App Router, Turbopack)
- **UI**: React 19, Tailwind CSS 4, Radix UI, TipTap 3 (rich text)
- **Database**: Supabase (PostgreSQL + Realtime + Auth)
- **Storage**: Backblaze B2 (S3-compatible, AWS SDK v3)
- **AI**: Multi-provider fallback chain (NVIDIA → Cerebras → Together → Groq → OpenRouter)
- **State**: Zustand 5 (stores), Context API (admin auth)
- **Messaging**: Telegram Bot API (admin commands)
- **DnD**: @dnd-kit/sortable

## Critical Rules

### Never Do
- Never commit API keys or secrets (use `.env.local`)
- Never use `useEffect` for data fetching — use server components or React Query patterns
- Never bypass TypeScript with `any` unless absolutely necessary and leave a `// TODO:` comment
- Never use `git push --force` on `main`
- Never delete database tables without an explicit SQL migration script in `src/sqlcmds/`
- Never skip the AI provider fallback chain — always use `tryProviders()` in `src/app/api/ai-*/route.ts`
- Never store Telegram admin chat IDs in code — use `TELEGRAM_ADMIN_CHAT_IDS` env var

### Always Do
- Use the Supabase server client from `src/lib/supabase/server.ts` in API routes and Server Actions
- Use the Supabase browser client from `src/lib/supabase/client.ts` in client components only
- Use `src/lib/b2-client.ts` for all Backblaze B2 operations
- Use Zustand stores from `src/lib/stores/` for cross-component state
- Use custom UI components from `src/components/ui/` — don't install new UI libraries without discussion
- Strip custom HTML tags (e.g., `<highlight>`, `<box>`, `<case-identity>`) before storing plain text in Telegram or logs

## Key Patterns

### Custom HTML Tag System
Case law notes use a proprietary tag format. Tags are defined in `src/lib/content-converter.ts`:
- `<highlight color="yellow">` — colored highlight
- `<box>` — bordered box
- `<case-identity>` — case header block
- `<provision>` — statute reference block
Always preserve these tags in database storage; strip only for display in Telegram/plain text.

### AI Provider Fallback
All AI routes in `src/app/api/ai-*/route.ts` use a cascading provider chain. Never call a single provider directly — always try in order: NVIDIA → Cerebras → Together → Groq → OpenRouter. Use the `tryProviders()` helper pattern.

### Telegram Callback Limit
Telegram inline keyboard callbacks are limited to **64 bytes**. Always use 8-character UUID prefixes (first 8 chars) as short IDs. See `src/lib/telegram.ts` for `encodeShortId()` / `decodeShortId()` patterns.

### PDF Handling on Vercel
`pdf-parse` is excluded from the webpack bundle (see `next.config.ts`). Always use the server-side API route `/api/pdf` for PDF parsing — never import pdf-parse in client components. DOM polyfills (DOMMatrix, ImageData, Path2D) are added in `next.config.ts` for the Node.js environment.

## Common Commands
```bash
# Development
npm run dev          # Next.js with Turbopack

# Production build
npm run build        # next build --turbopack

# Lint
npm run lint

# Type check (note: type errors are ignored in build per next.config.ts)
npx tsc --noEmit
```

## File Structure Reference
```
src/
├── app/
│   ├── admin/        — Admin pages: studio, notes, quizzes, tag, news, pyq, dashboard
│   ├── auth/         — Login page
│   └── api/          — 12 API routes (ai-flashcards, ai-quiz, ai-summarize, ai-format,
│                        ai-news, judgment/upload, judgment/signed-url,
│                        judgment/pdf-proxy, pdf, pyq/parse, telegram/webhook, telegram/setup)
├── components/
│   ├── ui/           — 17 Radix UI wrappers (Button, Input, Dialog, etc.)
│   ├── course/       — Editor panel, quiz preview, structure tree, judgment PDF panel
│   └── contexts/     — Admin context provider
├── hooks/            — useAdmin, useSubjects, useStructure, useCourses, useSyncStructure
├── lib/
│   ├── supabase/     — client.ts (browser) + server.ts (SSR)
│   ├── stores/       — Zustand: course-store, draft-store, header-store, local-content-cache
│   ├── realtime/     — use-sync-structure, use-sync-content, realtime-provider
│   ├── telegram.ts   — Telegram bot utilities (200+ functions)
│   ├── b2-client.ts  — Backblaze B2 S3 client
│   └── content-converter.ts — Custom tag ↔ standard HTML conversion
├── actions/          — Server Actions (judgment links, note content, news)
├── types/            — TypeScript type definitions
└── sqlcmds/          — SQL migration scripts
```

## Environment Variables
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET

# Backblaze B2
BACKBLAZE_KEY_ID
BACKBLAZE_APP_KEY
BACKBLAZE_BUCKET_NAME
BACKBLAZE_BUCKET_ENDPOINT

# AI Providers (in priority order)
NVIDIA_API_KEY
CEREBRAS_API_KEY
TOGETHER_API_KEY
GROQ_API_KEY
GROQ_API_KEY_2
OPENROUTER_API_KEY

# Telegram
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_IDS
TELEGRAM_SETUP_KEY
NEXT_PUBLIC_SITE_URL
```

## Loaded Skills (Lazy)
Skills live in `.claude/skills/`. Claude loads them when relevant:
- `ai-provider-chain` — Multi-LLM fallback system
- `case-law-notes` — Custom tag format for case law
- `tiptap-editor` — TipTap rich text editor patterns
- `pdf-handling` — PDF processing on Vercel
- `telegram-bot` — Telegram bot admin integration
- `supabase-patterns` — Supabase client/server patterns
- `backblaze-storage` — Backblaze B2 file storage
- `nextjs-app-router` — Next.js 16 App Router best practices
- `realtime-sync` — Supabase real-time subscriptions
- `draft-state` — Draft/save state with Zustand
- `quiz-flashcard-system` — Quiz and flashcard generation
- `ecosystem-monitor` — Detect breaking changes and propose updates
