# AGENT 1 — Categories, Projects & upgraded task board

## What shipped

Full end-to-end implementation of the **category + project** labeling system alongside the existing tags, across both web and mobile.

### Database
- **`supabase/migrations/0019_categories_projects.sql`** — new tables `categories`, `projects`, `task_categories`, `task_projects`. RLS mirrors the tags pattern (owner-scoped; join rows gated by task ownership). Unique `(user_id, name)` on labels. Indexes on both task/label sides of the join tables.
- **`supabase/migrations/0020_seed_categories_projects.sql`** — idempotent seed (ON CONFLICT DO NOTHING) for the default 6 categories + 9 projects. Backfills every existing profile, and rewrites `handle_new_user()` so future signups get the same seeds.

### Next.js API (new routes)
All go through `app/api/_shared.ts` — a shared bearer+cookie auth helper that mirrors `app/api/ai/_require-user.ts` so mobile and web use the same auth path.

- `GET  /api/categories` • `POST /api/categories` • `PATCH /api/categories/:id` • `DELETE /api/categories/:id`
- `GET  /api/projects` • `POST /api/projects` • `PATCH /api/projects/:id` • `DELETE /api/projects/:id` — PATCH also accepts `status` to cycle active/paused/archived.
- `POST   /api/tasks/:id/categories`  `{category_id}` (idempotent) • `DELETE /api/tasks/:id/categories/:categoryId`
- `POST   /api/tasks/:id/projects`    `{project_id}`  (idempotent) • `DELETE /api/tasks/:id/projects/:projectId`
- `POST /api/ai/suggest-labels` — new AI agent (`suggest_labels`, logged to `ai_logs` via `runAgent`). Accepts `{task_title}`, returns `{category_ids, project_ids}` validated against the user's own categories + active projects.

### State (Zustand)
- `types/index.ts` (web + mobile): `TaskType` gains `category_ids` + `project_ids`; new `CategoryType`, `ProjectType`, `ProjectStatus`. `NewTaskInput` accepts optional `category_ids`/`project_ids`.
- Store slices added: `categories`, `projects`, plus `fetchCategories`, `fetchProjects`, `addCategory`, `updateCategory`, `deleteCategory`, `attachCategoryToTask`, `detachCategoryFromTask`, `updateTaskCategories`, and the project mirror (`addProject`, `updateProject`, `setProjectStatus`, `deleteProject`, `attachProjectToTask`, `detachProjectFromTask`, `updateTaskProjects`).
- `fetchTasks` now joins `task_categories` and `task_projects`; `addTask` persists initial category/project attachments; all CRUD is optimistic with rollback on failure.
- Mobile uses a thin `lib/labels-api.ts` wrapper that mirrors `lib/ai.ts` (bearer token → deployed Next.js app).

### UI — Task card (both platforms)
Labels row reordered per spec to `Priority → Categories → Projects → Tags → Due`. New `CategoryPill` (dot + name, solid color on tinted bg) and `ProjectBadge` (solid color on tinted bg, no dot, no border). Archived projects render at 55% opacity.

### UI — Add/Edit modal (both platforms)
- Web `AddTaskForm` controls row: `Priority | Category ▾ | Project ▾ | Tags ▾ | Date | Estimate`.
- Web `EditTaskDrawer` gains Category + Project fields (fired on Save via `updateTaskCategories` / `updateTaskProjects`).
- Mobile `AddTaskSheet` + `EditTaskSheet` gain horizontal-chip pickers for category + project, matching the existing tag chip pattern.
- New dashed `"Suggest category & project"` AI chip in both platforms' `AiSuggestionPanel`. Calls `/api/ai/suggest-labels` and shows per-item accept chips plus an "Add all" action.

### UI — Management surfaces
- Web: two new header buttons next to `Tags`, each opening a **full-screen modal** (`CategoryManagerModal`, `ProjectManagerModal`). Edit in place, per-color swatches, status dropdown on projects. Modals close on Esc and on backdrop click.
- Mobile: a new `OverflowMenu` bottom sheet opens from the existing ⋮ button in `TopAppBar` and routes to `CategoryManagerSheet`, `ProjectManagerSheet`, or the existing `TagManagerSheet`. The prior "overflow = tags" wiring is preserved through this menu.

### Color tinting
Runtime HSL-based helper in `lib/utils.ts` (both platforms): `labelTintBg(hex)` converts foreground hex → HSL, clamps saturation at 0.6, lifts lightness to 0.93, returns hex. Same code path for seeded colors and user-added colors.

## Decisions made (per user's answers)

1. **CRUD transport: Next.js /api/categories + /api/projects** — not Supabase-direct. Introduced `_shared.ts` for cross-route auth/CORS. Mobile calls these via a bearer token just like `aiClient` already does.
2. **Mobile parity: full port in same pass** — all types, store, pickers, cards, manager sheets, and the overflow menu are wired on mobile.
3. **Management UI: full-screen modals** — not dropdowns. `CategoryManagerModal` + `ProjectManagerModal` on web, `CategoryManagerSheet` + `ProjectManagerSheet` on mobile.
4. **Color tint: runtime HSL only** — no hardcoded tint map. Works for seeded and user-added colors identically; close but not pixel-identical to the spec's Phase 8 map. If exact match ever matters, we can add a lookup layer in front of `labelTintBg`.

## Coordination with Agent 2

Agent 2's work landed in parallel (they added `category_ids` / `project_ids` to `TaskType`, the `/api/insights` route, the `Insights` component, and insights state to the store). I detected this during Phase 4 and:

- Left all Agent 2 types and store state (insights*) untouched.
- Did not touch `/app/insights`, `components/Insights.tsx`, or `app/api/insights/route.ts`.
- My additions to `TaskType` overlapped with Agent 2's (same field names, same types) so there's no conflict.
- My `/api/tasks/:id/categories` and `/api/tasks/:id/projects` routes are new; Agent 2's `/api/insights` relies on the schema I'm shipping (they set `missing_label_schema: true` until migration 0019 runs).

## Testing

- `npx tsc --noEmit` clean on both apps.
- `npx eslint` clean on all new/modified files in the web app.
- Functional spot-checks the user should run after applying migrations:
  - `supabase db push` (or the user's normal migration path) to run 0019 + 0020.
  - Reload; the header should show `🎯 Categories (6)` and `★ Projects (9)` out of the box.
  - Creating/editing a task should attach/detach labels optimistically with no page reload.
  - RLS: sign in as a second user; categories/projects should appear empty for that user (backfill only runs for existing profiles at migration time; new users get them from the trigger).
  - Cascade: deleting a category or project should immediately remove it from all its tasks in-place (we update local state in the same action before the server call).

## Non-goals honored

- `/insights` route, analytics charts, matrix views, tag clouds — untouched (Agent 2's territory).
- No migration of existing tags into categories/projects.
- No auto-categorization beyond the single AI-assist chip.

## Files added

### Supabase
- `supabase/migrations/0019_categories_projects.sql`
- `supabase/migrations/0020_seed_categories_projects.sql`

### Web (`get-it-done-web/`)
- `app/api/_shared.ts`
- `app/api/categories/route.ts`, `app/api/categories/[id]/route.ts`
- `app/api/projects/route.ts`, `app/api/projects/[id]/route.ts`
- `app/api/tasks/[id]/categories/route.ts`, `app/api/tasks/[id]/categories/[categoryId]/route.ts`
- `app/api/tasks/[id]/projects/route.ts`, `app/api/tasks/[id]/projects/[projectId]/route.ts`
- `app/api/ai/suggest-labels/route.ts`
- `components/CategoryPill.tsx`, `components/ProjectBadge.tsx`
- `components/CategoryPicker.tsx`, `components/ProjectPicker.tsx`
- `components/CategoryManagerModal.tsx`, `components/ProjectManagerModal.tsx`

### Mobile (`get-it-done-mobile/`)
- `lib/labels-api.ts`
- `components/CategoryPill.tsx`, `components/ProjectBadge.tsx`
- `components/CategoryPicker.tsx`, `components/ProjectPicker.tsx`
- `components/CategoryManagerSheet.tsx`, `components/ProjectManagerSheet.tsx`
- `components/OverflowMenu.tsx`

## Files modified

### Web
- `types/index.ts` — `TaskType` + new `CategoryType`, `ProjectType`, `ProjectStatus`, extended `NewTaskInput`.
- `lib/store.ts` — 2 new slices, extended `TaskRow`/`rowToTask`/`addTask`/`fetchTasks`/`fetchAll`.
- `lib/ai.ts` — `suggestLabels` client.
- `lib/anthropic.ts` — added `'suggest_labels'` to `AgentKey`.
- `lib/utils.ts` — HSL tint helper.
- `components/TaskCard.tsx` — render CategoryPill + ProjectBadge before tags.
- `components/AddTaskForm.tsx` — Category & Project pickers + label AI handlers.
- `components/EditTaskDrawer.tsx` — Category & Project fields + save diff.
- `components/AiSuggestionPanel.tsx` — new `"Suggest category & project"` chip + results block.
- `components/Dashboard.tsx` — new header buttons + modal mount.

### Mobile
- `types/index.ts` — same extensions as web.
- `lib/store.ts` — same 2 new slices, extended `TaskRow`/`rowToTask`/`addTask`/`fetchTasks`/`fetchAll`.
- `lib/ai.ts` — `suggestLabels` client.
- `lib/utils.ts` — HSL tint helper.
- `components/TaskCard.tsx` — render CategoryPill + ProjectBadge before tags.
- `components/AddTaskSheet.tsx` — Category & Project pickers + label AI handlers.
- `components/EditTaskSheet.tsx` — Category & Project pickers + save diff.
- `components/AiSuggestionPanel.tsx` — new `"Category & project"` chip + results block.
- `app/(tabs)/_layout.tsx` — mount manager sheets + overflow menu; rewire `onOpenOverflow`.
