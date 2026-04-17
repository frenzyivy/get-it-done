# CLAUDE.md — Get-it-done

## Project Overview

**Get-it-done** is a personal task management app with subtask tracking, custom tags, Kanban + List views, per-subtask Pomodoro time tracking, AI-powered agents (subtask generation, smart tagging, daily summaries), smart automations (reminders, recurring tasks, status escalation), and cross-platform notifications.

- **Web**: Next.js 14+ (App Router) + TypeScript + Tailwind CSS + Zustand + Supabase
- **Mobile**: React Native (Expo SDK 51+) + TypeScript + NativeWind + Zustand + Supabase
- **AI**: Anthropic Claude API via Next.js API routes (server-side only)
- **Automations**: Supabase Edge Functions + pg_cron
- **Notifications**: In-app (Realtime) + Push (Expo) + Email (Resend)
- **Database**: Supabase PostgreSQL with RLS

## Key Files

| File | Purpose |
|------|---------|
| `PLAN.md` | Full build spec — database schema (13 tables), AI agents, automations, notifications, screens, components, API, implementation phases |
| `task-distributor.jsx` | Working interactive prototype — visual and behavioral reference for core features |
| `CLAUDE.md` | This file — coding conventions, architecture rules, and build instructions |

## Read PLAN.md First

Before writing ANY code, read `PLAN.md` completely. It contains 19 sections covering:
- Database schema: 13 tables with RLS, triggers, RPC functions, cron jobs
- 5 AI agent endpoints with prompts and response formats
- 7 built-in automation rules with triggers and actions
- 3 notification channels with implementation details
- Supabase Edge Functions structure
- Component breakdown for every screen
- 8-phase implementation order
- 26 key behaviors that must be preserved

## Architecture Rules

### AI Calls — Server-Side Only
```
Client (Web/Mobile) → Next.js API Route (/api/ai/*) → Claude API
                                                     → Save to ai_logs table
                                                     → Return suggestions to client
```
- NEVER import `@anthropic-ai/sdk` in client components or mobile code
- NEVER expose `ANTHROPIC_API_KEY` to the browser or mobile app
- ALL AI endpoints live in `app/api/ai/` as Next.js Route Handlers
- Mobile app calls these same endpoints via fetch
- Every AI call logs to `ai_logs` table with token count

### Automations — Edge Functions Only
```
pg_cron → Supabase Edge Function → Read DB → Evaluate rules → Execute actions
                                                             → Send notifications
```
- Automations run in Supabase Edge Functions (Deno runtime)
- Triggered by pg_cron schedules, NOT by client-side code
- All cron jobs must be idempotent (safe to re-run)
- Use `_shared/` folder for common clients (supabase, anthropic, resend)

### Notifications — 3 Channels
```
Edge Function → INSERT into notifications table → Supabase Realtime → Client (in-app)
             → Expo Push API → Mobile device (push)
             → Resend API → User email (email)
```
- In-app: Supabase Realtime subscription on `notifications` table
- Push: Expo Push Notifications (mobile only, requires expo_push_token in user_preferences)
- Email: Resend API from Edge Functions

### Data Flow
```
Client ←→ Zustand Store ←→ Supabase (PostgreSQL + RLS)
                          ←→ Next.js API Routes (AI only)
                          ←→ Supabase Realtime (notifications)

Supabase Edge Functions ←→ Supabase DB (automation reads/writes)
                        ←→ Claude API (daily summary agent)
                        ←→ Expo Push API (push notifications)
                        ←→ Resend API (email notifications)
```

## Coding Conventions

### TypeScript
- Strict mode enabled
- No `any` types — use proper interfaces from `types/index.ts`
- Prefer `interface` over `type` for object shapes
- Use `const` assertions for static arrays (priorities, kanban columns)

### React / Next.js
- Functional components only
- Use `'use client'` directive only on components that need interactivity
- Server components by default for layouts and pages that just fetch data
- Keep components small — one file per component in `components/`
- Co-locate hooks inside the component file unless shared

### State Management
- Zustand store in `lib/store.ts`
- All Supabase calls happen inside store actions, not in components
- AI calls go through `lib/ai.ts` helper → hits API routes → store updates with results
- Optimistic updates: update local state first, then sync to Supabase
- Components read from store via `useStore(selector)` pattern

### Styling (Web)
- Tailwind CSS utility classes only — no custom CSS files
- Use design tokens from PLAN.md Section 7
- Font: DM Sans via Google Fonts in `layout.tsx`
- No inline `style={{}}` objects — use Tailwind classes
- Dark mode: not in scope for v1

### Styling (Mobile)
- NativeWind (Tailwind for React Native)
- Same design tokens as web
- DM Sans via `expo-font`
- Bottom sheets via `@gorhom/bottom-sheet` for modals/forms

### Supabase
- Client initialized once in `lib/supabase.ts`
- Web: `createBrowserClient` from `@supabase/ssr`
- Mobile: `createClient` with `AsyncStorage` adapter
- All tables have RLS — never bypass with service key on client
- Use `save_time_session` RPC for atomic time saves (never update 3 tables separately)
- Edge Functions use service role key (admin access) — stored as Edge Function secret

### Edge Functions (Deno)
- One function per concern: `daily-summary`, `check-due-dates`, `create-recurring-tasks`, etc.
- Shared utilities in `supabase/functions/_shared/`
- Always check `user_preferences` before sending notifications
- Always check `is_enabled` on automation_rules and recurring_templates
- Log errors to console (Supabase captures Edge Function logs)

### File Naming
- Components: `PascalCase.tsx` (e.g., `TaskCard.tsx`, `AiSuggestionPanel.tsx`)
- API routes: `route.ts` inside named folders (e.g., `app/api/ai/generate-subtasks/route.ts`)
- Edge Functions: `index.ts` inside named folders (e.g., `supabase/functions/daily-summary/index.ts`)
- Lib files: `camelCase.ts` (e.g., `store.ts`, `supabase.ts`, `ai.ts`)
- Types: `index.ts` in `types/` folder

## Component Hierarchy

```
Dashboard (page.tsx)
├── Header
│   ├── App title + stats (task count, progress %, total time)
│   ├── NotificationBell (🔔 + unread count + dropdown)    ← NEW
│   ├── TagManager (dropdown)
│   └── ViewToggle (List / Board)
├── KanbanView
│   └── KanbanColumn (×3: todo, in_progress, done)
│       ├── TaskCard (×n, draggable)
│       │   ├── PomodoroTimer (timer icon + expandable panel)
│       │   │   └── Subtask dropdown selector
│       │   ├── PriorityBadge
│       │   ├── TagBadge (×n)
│       │   ├── ProgressBar
│       │   ├── AiBreakdownButton (✨)                      ← NEW
│       │   └── SubtaskItem (×n, when expanded)
│       │       └── Time badge
│       └── AddTaskForm
│           ├── AiSuggestionPanel (subtasks + tags)          ← NEW
│           └── RecurringToggle (🔄 Make Recurring)          ← NEW
└── ListView
    ├── TaskCard (×n, sorted by priority)
    └── AddTaskForm

Settings (page.tsx)                                          ← NEW
├── NotificationPreferences
├── AiPreferences (toggle auto-subtasks, auto-tags, auto-priority)
├── DailySummaryConfig (time picker, timezone)
├── RecurringTaskList (manage templates)
└── AutomationToggles (enable/disable built-in rules)
```

## Implementation Phases

Follow PLAN.md Section 17 exactly. Summary:

| Phase | What | Days |
|-------|------|------|
| 1 | Backend — Supabase schema (all 13 tables) | 1 |
| 2 | Web App — Core features (tasks, subtasks, tags, timer, kanban) | 3-4 |
| 3 | Android App — Port core to React Native | 3-4 |
| 4 | AI Agents — 4 endpoints + suggestion UI | 2-3 |
| 5 | Smart Automations — Edge Functions + recurring tasks + cron | 2-3 |
| 6 | Notifications — In-app + push + email | 1-2 |
| 7 | Daily Summary Agent — Edge Function + Claude + rich card | 1 |
| 8 | Polish — Optimistic UI, skeletons, empty states, PWA | 1-2 |

**Total: ~15-22 days**

## Critical Behaviors (Do Not Break)

### Core
1. Timer LOCKS the subtask dropdown while running
2. Saving a session uses `save_time_session` RPC — atomic update to 3 tables
3. Completing ALL subtasks → auto-move task to "done"
4. Un-completing a subtask on "done" task → move back to "in_progress"
5. Session log stores subtask title as snapshot label (survives renames)
6. Cards get purple glow when timer is actively running
7. Discard on paused timer = throw away elapsed, no DB write
8. New subtasks auto-appear in the timer's "Working on" dropdown

### AI
9. All Claude API calls are server-side only (Next.js API routes)
10. AI suggestions are ALWAYS optional — user must accept/reject
11. Auto-trigger AI respects `user_preferences` toggles
12. Every AI call logs to `ai_logs` with token count
13. Smart Tagger only suggests from user's existing tags

### Automations
14. Recurring tasks INSERT new tasks — never modify the template
15. Due date reminders fire once per task (track sent status)
16. All cron jobs are idempotent
17. Overdue escalation only changes priority, never deletes/completes

### Notifications
18. In-app uses Supabase Realtime (no polling)
19. Push token refreshed on every app launch
20. Email respects user's timezone setting

## Don'ts

- Don't import `@anthropic-ai/sdk` in any client-side code
- Don't expose `ANTHROPIC_API_KEY` or `RESEND_API_KEY` to the browser
- Don't skip RLS policies — every table needs them
- Don't update time_sessions + tasks + subtasks in 3 separate calls — use the RPC
- Don't auto-accept AI suggestions — always show approval UI
- Don't send notifications without checking user_preferences
- Don't use `localStorage` — use Zustand for state, Supabase for persistence
- Don't hardcode tag colors — use the TAG_COLORS palette array
- Don't create separate CSS files — Tailwind only
- Don't use `useEffect` for data fetching — fetch in store actions
- Don't build both platforms simultaneously — finish web first, then port to mobile
- Don't build AI/automations before core is complete — follow the phase order
