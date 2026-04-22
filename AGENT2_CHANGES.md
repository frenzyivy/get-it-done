# AGENT 2 — Insights & Analytics page

Scope: new `/insights` route and its backing API. No changes to the task
board, task card, task modal, or category/project/tag CRUD (Agent 1's
territory).

## Files added

| File | Purpose |
|------|---------|
| `get-it-done-web/app/insights/page.tsx` | Server route; auth gate + renders `<Insights />` |
| `get-it-done-web/components/InsightsInit.tsx` | Sets `userId` in Zustand and kicks off the first fetch |
| `get-it-done-web/components/Insights.tsx` | All six sections + page shell |
| `get-it-done-web/app/api/insights/route.ts` | Single `GET /api/insights?range=…` that returns every section's data |

## Files modified

| File | Change |
|------|--------|
| `get-it-done-web/lib/store.ts` | New insights slice: `insightsRange`, `insightsPayload`, `insightsLoading`, `insightsError`, drill-down picks, `fetchInsights()` with a 60 s cache |
| `get-it-done-web/types/index.ts` | Added `InsightsRange`, `InsightsBucket`, `InsightsProjectBucket`, `InsightsTagBucket`, `InsightsMatrixRow`, `InsightsTask`, `InsightsSummary`, `InsightsPayload` |
| `get-it-done-web/components/Dashboard.tsx` | New "📊 Insights" link in the header, next to Settings |

### Coordination with Agent 1

Agent 1 landed their categories/projects slice mid-flight during this change.
Early on, their Store-interface declarations existed but the implementations
didn't, so I dropped in temporary AGENT1 stubs to keep the file compiling.
By the time I finished, Agent 1's real CRUD had landed, so the stubs were
removed. The final `lib/store.ts` is clean — nothing from AGENT1 needed
from my side.

## Architectural decisions

Flagged in the implementing message before I started coding. Recapping:

1. **Stack mismatch.** Spec said FastAPI + Supabase. The web app is pure
   Next.js + Supabase — no FastAPI anywhere. Built the endpoint as a Next.js
   Route Handler under `app/api/insights/`, matching the existing
   `app/api/ai/*` pattern. It reuses the same `requireUser` helper, which
   accepts both a cookie session (browser) and an `Authorization: Bearer`
   header (mobile).
2. **Tracked-time source.** Spec suggested `tasks.time_spent_seconds` /
   `tasks.completed_at`; neither exists in this codebase. The truth source
   for actual work performed is `tracked_sessions` (v2 live timer):
   `duration_seconds` summed over rows where `ended_at IS NOT NULL`, filtered
   by `ended_at` in the chosen range. The legacy `time_sessions` table is
   not read — v2 writes to `tracked_sessions` exclusively and the newer
   surfaces (Timeline, Day view) read from it.
3. **Agent 1's schema dependency.** `categories`, `projects`,
   `task_categories`, `task_projects` are not yet in `supabase/migrations/`.
   The endpoint queries those tables, but each query is wrapped in a
   `fetchRowsSafe` helper that swallows Postgres error `42P01` ("relation
   does not exist") and returns an empty array. When the schema lands, the
   page will light up with no code changes. Until then, a banner on the
   page explains categories/projects aren't set up yet, and the tag cloud
   + double-filter sections still work (tags use the existing schema).
4. **Week boundary.** Sun → Sat in the user's local timezone, matching the
   existing `weekly_work_goal_hours` convention in this project.
5. **Timezone.** All calendar math (week start, month start, deepest-work
   day bucketing) uses `user_preferences.timezone`, falling back to UTC.
6. **One endpoint, all six sections.** `GET /api/insights?range=week|month|all`
   returns the complete payload. The query plan is: one sessions query, one
   task-titles query, plus one query per label type (categories, projects,
   tags, each of the join tables). 7–9 queries total regardless of how many
   tasks the user has. All aggregation is done server-side in a single pass
   over the sessions.

## Data flow

```
/insights page
  └─ InsightsInit (sets userId, calls fetchInsights)
  └─ Insights component
       └─ useStore reads insightsPayload / insightsRange / selected ids
       └─ Clicking range toggle → setInsightsRange → fetchInsights
            └─ fetch('/api/insights?range=…') with Bearer token
                 └─ Route handler
                      → reads user_preferences.timezone
                      → computes [start, end) window
                      → 1 query: tracked_sessions (ended_at in range)
                      → 1 query: prev-period total for delta
                      → 1 query: task titles for tasks with time
                      → 2 queries: categories, projects (graceful 42P01)
                      → 2 queries: task_categories, task_projects joins
                      → 1 query: tags
                      → 1 query: task_tags
                      → aggregates client-side keys into:
                         summary, categories, projects, matrix,
                         tasks_by_project, categories_by_project,
                         tags, categories_by_tag
```

A `missing_label_schema: true` flag is returned if either `categories` or
`projects` is missing, which the client uses to render a friendly banner.

## Double-counting

Kept as the spec requires. A task with multiple categories contributes its
full duration to each of its categories. Same for projects and tags. Sums
across categories/projects will therefore exceed the total-tracked number.
The matrix legend and the tag legend both explain this in plain language.

No pie charts anywhere.

## Visual fidelity

Mirrors `get-it-done-insights.html`:

- 1120 px max shell, Sun-lavender (#f6f5ff) page background, white cards
- 14 px radius cards with 1 px `#ece9f7` borders
- Section headers: 15 px / 700 weight title, 12 px muted subtitle
- Bar rows: 160-px label, flex-1 track with filled bar, 80-px time column
- Matrix: heat tint = `--primary` (#7c5cff) overlay with opacity
  `0.05 + (cell / max) * 0.55`
- Tag cloud: position-based size buckets (top 20 %, next 20 %, middle 30 %,
  bottom 30 %) mapped to 17 / 15 / 13 / 12 px
- Project/tag picker chips use `tintFromHex(hex)` to derive a ~92 %-lightness
  HSL background at runtime, so any user-set color (not just the seeded
  palette) gets a matching tint

## Empty states handled

- No tasks tracked in the range → "No tracked time yet" card
- No categories/projects set up yet (missing schema) → banner + section-level
  messages pointing the user to the management modals Agent 1 is building
- A section has no data for the range → inline empty message inside the section

## Performance

- Aggregations run server-side; endpoint returns a single JSON payload
- Store caches the payload per-range for 60 s, so flicking between range
  chips only hits the network the first time for each range
- Drill-down project/tag changes are pure client-side — no refetch

## Test plan

- Render the page logged-out → redirects to `/login` (server auth gate)
- With no tracked sessions → empty state copy shows
- With sessions but no category/project schema → tag cloud + double-filter
  populate; category/project sections show the "not set up yet" banner
- With the full schema (once Agent 1 lands) → all six sections populate
- Range toggle swaps all six sections at once; previous selections reset
- Matrix cell opacity scales visibly from low-time to high-time cells
- Hand-crafted: 3 tasks, each with known time/category/project/tag
  combinations → verify totals appear in the right buckets and the
  deliberate double-count shows up in the matrix row totals vs the sum of cells

## Verification

- `npx tsc --noEmit` — passes
- `npx eslint` on all modified/added files — passes with 0 warnings
- Not tested in a browser — report marks this explicitly per CLAUDE.md

## Not built (per spec's non-goals)

- No CRUD for categories / projects / tags (Agent 1)
- No changes to task card / board / modal (Agent 1)
- No weekly trend lines, no comparison mode, no CSV export
- No per-day granularity view
- No mobile layout (web-only for v1)
