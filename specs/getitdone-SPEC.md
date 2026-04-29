# Get-it-done — Full Redesign & Feature Spec

> **Status:** approved by Komal · ready to implement
> **Stack:** Next.js + FastAPI + Supabase + Zustand · React Native (Expo) for mobile
> **Owner:** Komal (solo build) · **Date:** April 25, 2026

---

## Table of Contents

1. [Why this rebuild](#why-this-rebuild)
2. [Design system](#design-system)
3. [Data model changes](#data-model-changes)
4. [The 6 core feature changes](#the-6-core-feature-changes)
5. [The 7 views — what each shows](#the-7-views)
6. [New features added during redesign](#new-features-added-during-redesign)
7. [Implementation order](#implementation-order)
8. [API contract](#api-contract)
9. [Component map](#component-map)
10. [Open questions](#open-questions)

---

## Why this rebuild

The current app works but has six concrete problems Komal hit while using it daily:

1. Tasks marked "In Progress" stay there even when no work was logged
2. Projects can only be deleted, not completed — losing history feels wrong
3. Dropdowns force tap → tap → "Done" → close. Every modifier costs 3 clicks.
4. New tasks always require re-tagging project + category, even when filtering by them
5. No way to triage by urgency without manually scanning every card
6. Streak / completion data sits in a banner, not in Insights where you'd review it

This rebuild fixes all six and pushes harder on three things:

- **Aesthetic** — pure black-and-white glassmorphic palette, no chromatic accents, weight contrast does the work
- **Time tracking is the spine** — status, calendar bubbles, insights, daily streak all derive from logged time
- **Fast input** — Ctrl+K command bar with structured grammar removes friction from the highest-frequency action

---

## Design system

### Palette — strict B&W only

```css
:root {
  /* surfaces */
  --bg: #e8e8ea;          /* page background, neutral grey */
  --bg-deep: #d4d4d8;     /* slightly deeper for sections */
  --paper: #f7f7f8;       /* card-like white */
  --frost: rgba(255,255,255,.72);        /* glass card on light bg */
  --frost-strong: rgba(255,255,255,.88); /* modal glass */
  --frost-deep: rgba(255,255,255,.55);   /* subtle frosted areas */

  /* ink */
  --black: #0a0a0a;       /* primary text + dark cards */
  --black-soft: #18181b;
  --black-mute: #27272a;
  --white: #ffffff;
  --ink: #0a0a0a;
  --ink-soft: #3f3f46;
  --ink-mute: #71717a;
  --ink-faint: #a1a1aa;
  --ink-ghost: #d4d4d8;

  /* lines */
  --line: rgba(10,10,10,.08);
  --line-strong: rgba(10,10,10,.14);
  --line-on-dark: rgba(255,255,255,.1);
  --line-on-dark-strong: rgba(255,255,255,.18);

  /* there is NO accent color. White is "accent" on dark; black is "accent" on light */
  --accent: #ffffff;
  --accent-on-light: #0a0a0a;
}
```

**Rule:** never introduce a hue. Hierarchy comes from weight, opacity, and surface contrast, not color. The only place "color" exists is the active-tracking pulse (white on black).

### Typography

```css
--sans: 'Inter', system-ui, sans-serif;
--mono: 'JetBrains Mono', monospace;
/* No serif. No italic display fonts. */
```

**Weights used:**
- 700 — main numbers, page titles, big metrics
- 600 — task titles, primary buttons
- 500 — secondary buttons, list items
- 400 — body, descriptions
- 300 — accent words inside titles (e.g., the second word of `Today's intent.`)

**Mono is reserved for:**
- Counts (`12 tasks`, `47m 23s`)
- Tiny uppercase labels (`TOTAL TRACKED`, `LAST 90 DAYS`)
- Code-like syntax (`@allianza`, `!!!`)
- Tabular numerics (live timer, calendar hours)

**Tabular nums everywhere they matter:** any digit that ticks (timer, percentages) gets `font-variant-numeric: tabular-nums` so the layout doesn't shift.

### Surfaces & contrast

There are exactly **three surface types**:

| Surface | When | Example |
|---|---|---|
| Frosted white glass | Default for everything | most cards, dropdowns, the modal |
| Pure black card | The ONE thing currently being worked on | active-tracking task, Now Tracking banner, Calendar card, Urgent priority column |
| Light cream/frost-deep | Subtle inset surfaces | day-detail bg, ai-assist row |

**The black card is opinionated.** It signals "this is where your attention should be right now." Use it for one thing per view at most.

### Spacing

- Card padding: `22px-26px` for primary cards, `14px-18px` for nested
- Border-radius: `4px` (tags), `8px` (inputs), `12-14px` (small cards), `20px` (modals), `28px` (hero cards)
- Cell gap in grids: `4-8px` for tight (heatmap), `12-16px` for cards
- Vertical rhythm: section breaks use `border-top: 1px solid var(--line)` + `padding-top: 28-32px`, almost never margin

### Motion

- Live indicators pulse at **1.4s** ease-in-out, all synced (banner pulse, task pulse, subtask pulse use the same `nt-live` keyframe)
- Hovers are `.15s` transitions on all interactive surfaces
- Modal slide-up: `.22s cubic-bezier(.2,.8,.2,1)`
- Calendar ring fill: `.4s ease` on `stroke-dashoffset`
- Now Tracking banner has a subtle `4s` linear sheen across it (looks "alive" without distracting)

---

## Data model changes

> **Reconciliation note (2026-04-25):** The original draft of this section was written before migrations 0012–0020 landed. Three things in the existing schema force changes to the proposed model:
>
> 1. **`tracked_sessions` already exists** (migration 0012) and is the canonical time-tracking table. It has `task_id`, `subtask_id`, `started_at`, `ended_at`, `duration_seconds`, plus `mode`, `drift_events`, `planned_block_id`, `broken`, `planned_duration_seconds`. All existing time-tracking code reads/writes it. The spec previously called for a new `time_logs` table — we keep `tracked_sessions` as the source of truth and rebrand the API surface around it.
> 2. **Concurrent timers are intentional.** Migration 0015 explicitly **dropped** the unique-active partial index because Feature 4 (concurrent timers) and the mobile Focus Lock flow rely on more than one timer being active at once. We do not reintroduce the constraint. The Now Tracking banner shows the most-recent active session; if multiple are running, the banner gets a small "+N more" affordance to switch.
> 3. **`projects.status` already accepts `'paused'`** (migration 0019). Switching the check to `('active','completed','archived')` would break existing rows. We widen the check to allow all four (`active`, `paused`, `completed`, `archived`), treat `paused` as a legacy alias of `active` for filtering, and add a back-fill migration later if Komal wants to retire it.
>
> Existing fields we lean on instead of duplicating: `user_profiles.current_streak / longest_streak / last_goal_met_date` (migration 0012) and `user_preferences.weekly_work_goal_hours` (migration 0017). We extend rather than parallel.

### `projects` — add lifecycle status

```sql
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS description  TEXT;  -- one-line subtitle on List view squares

-- Widen the status check to allow 'completed'. We keep 'paused' so existing
-- rows survive; the UI treats 'paused' as a legacy form of 'active'.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'archived'));

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (user_id, status);
```

**Behavioral rules:**
- `active` — visible in all dropdowns, the default
- `paused` — legacy state from migration 0019; treated as `active` everywhere in the UI until it's retired
- `completed` — keeps all data, hidden from create-task picker by default, shown only when user toggles "Show completed". Setting status to `completed` stamps `completed_at = now()`.
- `archived` — hidden everywhere except the manage-projects screen. Setting status to `archived` stamps `archived_at = now()`.

Delete is a separate operation (hard delete) reserved for accidental projects, with confirmation dialog.

### `tasks` — derived `effective_status`

Don't add a manual status column with three values. Status is computed.

The existing `tasks.status` column (migration 0003 — `'todo' | 'in_progress' | 'done'`) stays in place as the **persisted user intent**. The view derives `effective_status` from time tracked via `tracked_sessions`:

```sql
-- Derived status: time logged on the task or any of its subtasks promotes it
-- to in_progress; tasks.completed_at being set wins over everything.
CREATE OR REPLACE VIEW v_task_status AS
SELECT
  t.id,
  t.user_id,
  CASE
    WHEN t.completed_at IS NOT NULL THEN 'done'
    WHEN EXISTS (
      SELECT 1 FROM tracked_sessions ts
      WHERE ts.task_id = t.id
        AND COALESCE(ts.duration_seconds, 0) > 0
    ) OR EXISTS (
      SELECT 1 FROM tracked_sessions ts
      JOIN subtasks st ON st.id = ts.subtask_id
      WHERE st.task_id = t.id
        AND COALESCE(ts.duration_seconds, 0) > 0
    ) OR EXISTS (
      -- An open (still-running) session also counts as in_progress
      SELECT 1 FROM tracked_sessions ts
      WHERE (ts.task_id = t.id
             OR ts.subtask_id IN (SELECT id FROM subtasks WHERE task_id = t.id))
        AND ts.ended_at IS NULL
    ) THEN 'in_progress'
    ELSE 'todo'
  END AS effective_status
FROM tasks t;
```

Tasks gain a `completed_at` column (Done is manual). The legacy `tasks.status` column stays for now so older code doesn't break; new queries should JOIN `v_task_status` and ignore `tasks.status`. A later migration can drop `tasks.status` once all callers are migrated.

```sql
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
  ON tasks (user_id, completed_at)
  WHERE completed_at IS NOT NULL;
```

Drag-to-In-Progress without time will bounce back to To Do — enforced at the API layer, not the schema, since `effective_status` is read-only.

### `tracked_sessions` — the foundation (already exists)

The spec's earlier `time_logs` table is replaced by the existing `tracked_sessions` table from migration 0012. No schema change needed for Phase 1; the new endpoints and views read from it directly.

Key columns we depend on:
- `user_id`, `task_id`, `subtask_id`
- `started_at`, `ended_at`, `duration_seconds`
- `mode` (`free | pomodoro_25_5 | pomodoro_50_10 | open | call_focus | app_focus | strict`)
- `broken`, `broken_reason`, `planned_duration_seconds` (Focus Lock)
- `drift_events` (Strict mode tab-switch log)

The "active session" sentinel = `ended_at IS NULL`. **Concurrent active rows are allowed** (Feature 4). The Now Tracking banner picks the most-recent one and offers a switch when there's more than one.

If we ever decide to enforce single-active-timer again, that's a separate behavior change with its own migration — not part of Phase 1.

### `saved_views` — for filter combinations

```sql
CREATE TABLE saved_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  view_type   TEXT NOT NULL
    CHECK (view_type IN ('board','list','priority','calendar')),
  filters     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- example: {"projects": ["uuid1","uuid2"], "categories": ["uuid3"], "tags": ["#deep-work"]}
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name, view_type)
);

ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own saved_views" ON saved_views
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_saved_views_user ON saved_views (user_id, view_type);

CREATE TRIGGER set_saved_views_updated_at
  BEFORE UPDATE ON saved_views
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();
```

References `profiles(id)` (the existing user table), not a generic `users(id)`.

### `daily_targets` — per-day goals (calendar)

```sql
CREATE TABLE daily_targets (
  user_id     UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  -- Per-weekday target hours
  mon         NUMERIC(4,1) NOT NULL DEFAULT 16 CHECK (mon BETWEEN 0 AND 24),
  tue         NUMERIC(4,1) NOT NULL DEFAULT 16 CHECK (tue BETWEEN 0 AND 24),
  wed         NUMERIC(4,1) NOT NULL DEFAULT 18 CHECK (wed BETWEEN 0 AND 24),
  thu         NUMERIC(4,1) NOT NULL DEFAULT 16 CHECK (thu BETWEEN 0 AND 24),
  fri         NUMERIC(4,1) NOT NULL DEFAULT 14 CHECK (fri BETWEEN 0 AND 24),
  sat         NUMERIC(4,1) NOT NULL DEFAULT 12 CHECK (sat BETWEEN 0 AND 24),
  sun         NUMERIC(4,1) NOT NULL DEFAULT 8  CHECK (sun BETWEEN 0 AND 24),
  preset_name TEXT
    CHECK (preset_name IS NULL OR preset_name IN ('balanced','weekend-off','hustle','custom')),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE daily_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own daily_targets" ON daily_targets
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_daily_targets_updated_at
  BEFORE UPDATE ON daily_targets
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();
```

The existing `user_preferences.weekly_work_goal_hours` (migration 0017) was a single weekly number; `daily_targets` replaces that with per-day granularity needed for the Calendar's ring rendering. We keep `weekly_work_goal_hours` for backward compatibility but new code reads `daily_targets`.

### Streaks — extend `user_profiles` instead of creating `user_streaks`

`user_profiles` (migration 0012) already stores `current_streak`, `longest_streak`, `last_goal_met_date`. The spec needs one more field: when the longest streak ended (for the "Best yet · Apr 7" subtitle). Add it as a column rather than spinning up a parallel table.

```sql
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS longest_streak_ended_at DATE;
```

Recomputed nightly via cron, plus on-demand when a task is checked off (existing trigger logic in migration 0018 stays — we extend it to also stamp `longest_streak_ended_at` when `current_streak` rolls over `longest_streak`).

### Already-existing tables (no change)

`tasks`, `subtasks`, `categories`, `tags`, `task_tags`, `task_categories`, `tracked_sessions`, `planned_blocks`, `user_profiles`, `user_preferences`, `automation_rules`, `recurring_templates`, `notifications`, `ai_logs` — keep as-is. Phase 1 step 1 only **adds** to schema; nothing existing is renamed or dropped.

---

## The 6 core feature changes

### Change #1 — Status auto-derives from time logged

**What:** Remove the manual "In Progress" status. A task is automatically `in_progress` if and only if any time log exists for the task or any of its subtasks with `duration_seconds > 0` (or has an active running log).

**Why it matters:** No more graveyard of half-promised work. The Board's "In Progress" column genuinely reflects active work.

**Behavioral rules:**
- Two-way: deleting all time logs on a task moves it back to To Do
- Manual drag from To Do → In Progress without time logged: snaps back, with a small toast "this task hasn't been started — drag a timer to start"
- Done is still manual (a checkbox), and overrides the derived status

**Implementation:**
1. Replace any `tasks.status` column reads with a join against `v_task_status`
2. The Board column queries become:
   ```sql
   -- To Do tab
   SELECT * FROM tasks t
     JOIN v_task_status v ON v.id = t.id
     WHERE v.effective_status = 'todo';
   -- In Progress tab
   WHERE v.effective_status = 'in_progress';
   ```
3. Add a small italic "why is this here?" line on each in-progress task card explaining the trigger ("22m of work logged on this task" / "1 of 3 subtasks has time logged")

### Change #2 — Project lifecycle: Active / Completed / Archived

**What:** Replace the binary delete model. Three lifecycle states + delete as a separate destructive action.

**Why:** Komal has projects like `hi-rose` that ended successfully — losing their analytics history feels wrong. But they shouldn't clutter the new-task picker either.

**UI on Manage Projects screen:**
- Tabs: All (n) · Active (n) · Completed (n) · Archived (n)
- Each row has a status `<select>` to flip state
- Completed projects render with strikethrough, opacity .5, plus an italic "hidden from create-task picker" hint
- Delete confirms with a modal: "This will permanently remove [name] and all its tasks. Type project name to confirm."

**Picker behavior (everywhere a project dropdown appears):**
- Default: shows only `active` projects
- Two checkbox toggles inside dropdown: `[ ] Show completed (n)` and `[ ] Show archived (n)`
- Completed projects render greyed + italic + a small `COMPLETED` mono tag on the right

### Change #3 — Drop the "Done" button on dropdowns

**What:** Single-select dropdowns (priority, project, date) close on tap. Multi-select (categories, tags) close on tap-outside or Esc.

**Implementation:**
- Single-select: `onClick` triggers value assignment + `setOpen(false)`
- Multi-select: bind `onMouseDown` to a click-outside handler; remove the "Done" button entirely
- Add an `Esc` keyboard handler globally to close any open dropdown
- Add a tiny mono-text hint at the bottom: `click outside or press esc to close` (only on multi-select)

### Change #4 — Filter bar with sticky tag inheritance

**What:** Above the Board, a filter bar with chips. When filters are active and you create a new task from that view, the new task auto-inherits those filter values, with a small "↪ inherited" mark on each pre-filled field.

**UI:**
- Black pill chips with a tiny mono uppercase "key" prefix (e.g., `PROJECT get-it-done ×`)
- "+ Add filter" button (dashed border, opens a picker)
- Saved views dropdown on the right + "Save view" button
- Below the filter bar, an explainer banner: "*Heads up: New tasks created from this filtered view auto-inherit ...*"

**Inheritance:**
- The Create Task modal opens with project + category pre-filled
- A small `↪` arrow precedes each inherited value
- User can override by clicking the chip and choosing a different value (then the arrow disappears)
- Saved views: name → preserves filter combo + sort. Default: untitled. User can save current filter set with a button.

**Quick-add bar (Ctrl+K)** also respects active filters — see [the Quick-add section below](#quick-add-command-bar-ctrlk).

### Change #5 — Priority view (new tab)

**What:** A new view tab next to Board / List / Schedule / Calendar. Three swimlanes by priority: Urgent · Medium · Low.

**Layout:**
- Three equal columns, gap `16px`
- The Urgent column is a **black card** (matches the visual rule for "current focus")
- Med and Low are frosted-white cards
- Each column has its own "+ Add [priority] task" button at the bottom that auto-stamps that priority
- Filters from the Board view carry over

**Sub-mechanics:**
- Same task cards as Board, but compact (smaller padding, no progress bar visible by default)
- Done tasks fade out + can be hidden via a "Hide done" toggle in the column header

### Change #6 — Streak + completion analytics in Insights

**What:** A new "Daily progress" tab inside Insights showing streak ring, today/this-week/30-day stats, and a `Today so far` task list.

**Streak rule (per Komal):** A day counts toward the streak if you complete ≥ 1 task from your daily 5 (lenient).

**Cards:**

1. **Streak ring** — circular SVG, 56px, with the current streak number bold inside, partial coral arc... wait, no coral. Partial **white-on-black** arc showing progress toward the next milestone (5d, 10d, etc.). Subtitle: best yet · date.
2. **Today** — `1 / 5`, hours remaining
3. **This week** — `18 / 30`, % + delta vs last week
4. **30-day average** — `3.2 / 5`, % completion rate

Below: **Today so far** card — a slim list of today's tasks with check/missed status, category dot, time tracked. Includes a Today / Yesterday / Pick a day toggle.

Below that: **When you work** heatmap (see [new features](#new-features-added-during-redesign)).

Below that: **Streak history** — line chart of last 12 weeks of streak length, with the peak called out and a pulsing today marker.

---

## The 7 views

In navigation order:

### 1. Board

The home view. Tasks grouped by To Do / In Progress / Done.

**Above the fold:**
- Header: brand mark, search/quick-add, Categories/Projects/Tags counts, Insights button
- Title row: `Today's intent.` (bold + light) with a live timestamp + pulsing dot
- **Now Tracking banner** (when something is being tracked) — black card with task name, big monospace timer, Focus/Pause/Stop buttons. See [Now Tracking section](#now-tracking-banner).
- Today hero: 3 cards — "Today's 5" (black, big "1 of 5"), Streak (frosted with sparkline), Tracked today (frosted with sparkline)

**Below the fold:**
- View tabs (Board · List · Schedule · Calendar · NEW Priority)
- Status tabs (To do · In progress · Done) with mono counts
- Filter bar
- Filter explainer banner (when filters active)
- "+ Add task" row (inherits filter values)
- Task cards

### 2. List by project

Project-grouped square cards in a 3-column responsive grid.

**Each square has:**
- Status header (Active dot + "Active" label + task count)
- Project name (bold) + one-line description
- Progress bar + %
- Three stats: Tracked / Open / Done
- Inline scrollable task list with compact rows
- "+ Add task to [project]" button

**The actively-tracked project's square is black** (matches the visual rule). Everything else frosted.

**Toolbar above the grid:**
- Group by: Project / Category / Flat list
- Sort by: progress / recently worked / total time / alphabetical

**Compact variant:** projects with <4 tasks render in a shorter card with stats hidden.

### 3. Priority

Three swimlanes (Urgent black / Med frost / Low frost). See [Change #5](#change-5--priority-view-new-tab).

### 4. Schedule

**Done 2026-04-28** (Phase 6 step 17). Day grid (06:00–22:00) with two side-by-side lanes per hour: Planned (left) and Tracked (right). NOW line spans both lanes. Existing planned blocks are draggable across hours to reschedule (preserves the start-minute, just rewrites start_at hour). Tracked overlay is rendered from `/api/sessions/by-day-detailed?date=...` so each tracked session draws as a black bar in the right lane at its real start-minute / duration. Live (unended) sessions get a slow pulse and refetch every 60s while at least one session is active. Header strip shows Planned `Xh Ym` and Tracked `Xh Ym` totals. B&W reskin pass replaces lavender hovers (`#f3f0ff`, `#f5f3ff`) with `#f3f4f6`, the red NOW line with ink black, and `[#888]` greys with token `#9ca3af`.

### 5. Calendar — goal vs work

The new ring-based calendar. See [calendar section](#calendar---ring-based-goal-vs-work).

### 6. Insights

Three sub-tabs:
1. **Where your time went** (existing, B&W skinned)
2. **Daily progress** (NEW — Change #6)
3. **Category × Project matrix** (existing, B&W skinned)

Plus the new **When you work** card (hour-of-day heatmap).

### 7. Manage projects (modal/page)

See [Change #2](#change-2--project-lifecycle-active--completed--archived).

---

## New features added during redesign

### Now Tracking banner

A black card that sits at the top of the Board (above the title row) when a timer is active. Layout:

```
[●] NOW TRACKING                                    47m 23s
    Updates in Get-it-done                          ↗ Focus
    get-it-done · DEVELOPMENT · MED PRIORITY        ⏸ Pause
                                                    ⏹ Stop
```

**Components:**
- Pulsing white dot + "NOW TRACKING" mono uppercase label
- Big task name (15px sans, weight 600)
- Tiny meta line in mono (`get-it-done · DEVELOPMENT · MED PRIORITY`)
- Right side: 32px monospace timer counting up live (uses `setInterval(1000)` + tabular-nums)
- Three buttons:
  - **Focus** (white pill, primary) — starts a Pomodoro 25/5 cycle, dims everything except active task + subtasks, mutes notifications
  - **Pause** (subtle dark pill) — pauses the timer
  - **Stop** (transparent dark pill) — stops + saves the time log

A subtle `4s` linear sheen animates across the banner ([CSS gradient + background-size:200% animation]).

### Calendar — ring-based goal vs work

Each day in the calendar grid renders one of four states:

| State | Visual | Trigger |
|---|---|---|
| **No data** | Just the date number | No work logged AND target > 0 |
| **Rest day** | Date number, opacity .45 | Target = 0, no work logged |
| **Partial** | Faint ring track + partial white-fill arc | Hours > 0 but < target |
| **Goal hit** | Track + complete white ring (3px stroke) | Hours ≥ target |
| **Exceeded** | 5px stroke ring + white drop-shadow glow | Hours > target |
| **Rest bonus** | Glowing full ring labeled "bonus" on hover | Hours > 0, target = 0 |

**Ring math:**
```javascript
const r = 44;                       // 100x100 viewBox, 8% inset
const c = 2 * Math.PI * r;          // ≈ 276.46
const visualRatio = Math.min(1, hoursWorked / dailyTarget);
const dashOffset = c * (1 - visualRatio);
// SVG: <circle stroke-dasharray={c} stroke-dashoffset={dashOffset} ... />
```

**Per-day editable targets** (Change applied to calendar):
- Above the grid, a black config card has 7 number inputs (Mon–Sun)
- Each input editable, range 0–24h
- Three preset buttons: `Weekdays only` (M-F 16h, weekends 0) / `Balanced` (16/16/18/16/14/12/8) / `Hustle 7 days` (14 every day) / `Custom` (auto-sets when user hand-edits)
- Weekly total auto-sums in the header

**Below the grid:**
- Legend showing all 4 ring states
- Weekly totals strip — 5 small cards showing each week's hours / weekly target with a thin progress bar

### When you work — hour-of-day heatmap

A `7 × 24` grid (days of week × hours of day) showing tracked time intensity per hour-bucket. Inside Insights as its own card.

**Layout:**
- Header: title + sub + range toggle (7d / 30d / 90d)
- Day labels left (Mon...Sun), hour labels top (12a, 4a, 8a, 12p, 4p, 8p)
- Each cell is 22px tall, intensity scaled 0–4 across grayscale (light card) or white-opacity (dark card)
- Below: 4-column summary — Peak hour · 2nd peak · Most focused day · Late-night ratio (% after 10pm)

**Why it earns its place in the Insights tab:** answers a different question than the daily heatmap — *when am I actually doing the work?* — and surfaces patterns Komal might not consciously realize (e.g., "you spike on Wed 9pm-11pm").

### Quick-add command bar (Ctrl+K)

Triggered by Ctrl+K (Windows) or Cmd+K (Mac) from anywhere in the app. Also accessible via a "Quick add · Ctrl+K" button in the header.

**Grammar (explicit triggers required):**

| Symbol | Purpose | Example |
|---|---|---|
| `@name` | project (fuzzy match) | `@allianza` |
| `#name` | category | `#dev` |
| `!!!` / `!!` / `!` | priority urgent / med / low | `!!!` |
| `~30m` / `~2h` / `~1.5h` | time estimate | `~45m` |
| `today` / `tomorrow` / `mon-sun` / `apr 30` / `in 3 days` | due date | `tomorrow` |
| `-> a; b; c` | subtasks | `-> draft; review; ship` |

Anything not matched is the title.

**Example:**
```
@allianza #outreach send GDPR pages to 5 berlin clinics tomorrow !!! ~1h
-> draft pdf; pull 5 clinic emails; send batch
```

Creates: project=allianza-biz, category=outreach, priority=urgent, due=tomorrow, estimate=1h, title="send GDPR pages to 5 berlin clinics", with 3 subtasks.

**Behavioral rules:**
- **Filter inheritance:** If filters active, project + category pre-fill from filters with `↪` mark. Override by typing `@otherproject`.
- **Sticky after Enter:** Input clears, chips reset, cursor stays focused. Keep typing for the next task. Esc to close.
- **Shift+Enter:** Creates the task AND immediately starts the timer. Closes the bar.
- **Live parse preview:** Below the input, chips light up as you type showing what was detected.

**Visual:** Frosted dark-glass card, 620px wide, in the upper third of the screen. Backdrop blur. Subtle scale-up animation on chip insertion.

**Implementation notes for the parser:**
- Use [chrono-node](https://github.com/wanasit/chrono) for date parsing — handles "next friday", "in 3 weeks", "may 1", etc.
- Project fuzzy match: prefix > substring > Levenshtein distance, with autocomplete dropdown when ambiguous (typing `@a` shows all projects starting with `a`)
- Validation: title is the only required field. If no project resolved AND no inherited filter, task lands in an "Inbox" project for triage.

### Status of changes — visual signaling

Every task across the app uses these classes:

```html
<!-- Default (To Do) -->
<div class="task">

<!-- In Progress (status), but not currently tracking -->
<div class="task">  <!-- still white card, NO black -->

<!-- Currently tracking right now -->
<div class="task active-tracking">  <!-- THIS one is black -->

<!-- Bounced from In Progress because no time logged -->
<div class="task bounced">  <!-- white card with subtle accent border -->

<!-- Done -->
<div class="task done">
```

**Strict rule:** Only `.active-tracking` flips to black. There is exactly one `.active-tracking` task per user at any moment.

### Task time displays

Replace the small grey "0s" pill with a two-line block right after the task title:

```html
<div class="task-head">
  <span class="checkbox"></span>
  <span class="timer-icon">⏱</span>
  <span class="task-title">Updates in Get-it-done</span>
  <span class="task-total-time live">           <!-- "live" if currently tracking -->
    <span class="v">47m 23s</span>
    <span class="lbl">TOTAL TRACKED</span>     <!-- or "NEVER STARTED" if 0s -->
  </span>
  <div class="task-actions">...</div>
</div>
```

A thin vertical hairline divider sits between the title and the time. Action buttons (▶ ★ 📅 ✎ ×) push to the far right via `margin-left: auto`.

For tasks with subtasks, a **rollup bar** appears between the progress bar and the subtask list:
```
[TIME BREAKDOWN] ━━━━━━━━━━ 1 of 3 subtasks worked      47m 23s
```

Each subtask row gets a clean monospace number on the right (no green pill). Currently-active subtask gets the same pulsing dot prefix as the running task.

---

## Implementation order

Build in this order. Each step is shippable.

### Phase 1 — Foundation (week 1)

1. **Schema migrations** (additive only — see [Data model changes](#data-model-changes))
   - Widen `projects.status` check to include `'completed'`; add `completed_at`, `archived_at`, `description`
   - Add `tasks.completed_at`
   - Create `v_task_status` view (reads `tracked_sessions`)
   - Create `daily_targets` table
   - Create `saved_views` table
   - Add `user_profiles.longest_streak_ended_at`
   - **Skipped:** `time_logs` table (use existing `tracked_sessions`); `user_streaks` table (use existing `user_profiles`)

2. **Time-tracking API** (built around existing `tracked_sessions`)
   - `POST /api/sessions/start` — opens a new session row; does NOT auto-close other active rows (concurrent timers stay supported per migration 0015)
   - `POST /api/sessions/:id/stop` — sets `ended_at = now()`, computes `duration_seconds`
   - `GET /api/sessions/active` — returns all active sessions for the user; banner picks the most-recent
   - `GET /api/tasks/:id/time-summary` — total seconds + per-subtask breakdown (sums `tracked_sessions.duration_seconds`)
   - Supabase realtime channel on the `tracked_sessions` table so the banner stays in sync across tabs

3. **Status derivation**
   - Refactor task queries to JOIN `v_task_status`
   - Update Zustand store: `task.effective_status` is computed from `tracked_sessions`
   - Keep the legacy `tasks.status` column writable for now; new code prefers `effective_status`

### Phase 2 — Core features (week 2)

4. **Change #2 — Project lifecycle**
   - Manage Projects page redesign with status tabs + dropdowns
   - Update all project pickers to filter by status with show-completed/archived toggles
   - Add "Reactivate" action on completed/archived rows

5. **Change #3 — Kill the Done button**
   - Refactor all dropdown components (`<ProjectPicker />`, `<CategoryPicker />`, `<TagPicker />`, etc.) to use click-outside + Esc handling
   - Remove "Done" buttons globally
   - Add the dashed-text hint footer for multi-select dropdowns

6. **Change #4 — Filter bar + saved views**
   - Build `<FilterBar />` component with chip rendering
   - Build `<SavedViewsDropdown />` with save/load mechanics
   - Wire filter state into Create Task modal so values pre-fill with `↪` mark
   - Add the explainer banner that surfaces inheritance

7. **Change #1 — Status auto-derive logic**
   - Already done in Phase 1 (the view). Now wire the UI:
   - Add the "why is this here?" italic line under in-progress tasks
   - Add the "bounced back to To Do" toast when user drags task without time

### Phase 3 — New views (week 3)

8. **Priority view (Change #5)**
   - New route `/priority`
   - `<PrioritySwimlane />` × 3
   - Per-column "+ Add" that pre-fills priority

9. **List by project view**
   - New route `/list`
   - `<ProjectSquare />` component (head + tasks + add button)
   - Group-by toggle (project / category / flat)
   - Sort dropdown
   - Compact-vs-full variant logic (auto: <4 tasks = compact)

10. **Calendar view**
    - New route `/calendar`
    - `<DailyTargetsConfig />` with 7 inputs + 4 preset buttons
    - `<CalendarRingGrid />` — month grid with SVG rings (the math from the spec)
    - `<WeeklyTotals />` strip

### Phase 4 — Insights & streaks (week 4)

11. **Daily progress tab (Change #6)**
    - Streak ring SVG component
    - Stat grid (4 cards)
    - Today so far list (with day picker)
    - Streak computation cron job (nightly + on task complete)

12. **When you work heatmap**
    - Aggregate query: time logs grouped by hour-of-day × day-of-week
    - `<HourHeatmap />` with range toggle (7d/30d/90d)
    - 4-column summary

13. **Now Tracking banner**
    - `<NowTrackingBanner />` component
    - Subscribes to active time log via realtime
    - Live timer that ticks `setInterval(1000)` while connected
    - Focus / Pause / Stop wired to time-tracking API

14. **Task time displays redesign**
    - Replace `<TaskTimePill />` with `<TaskTotalTime />` (two-line block)
    - Replace `<SubtaskTimePill />` with `<SubtaskTime />` (mono number)
    - Add `<TimeBreakdownRollup />` for tasks with subtasks

### Phase 5 — Quick-add (week 5)

15. **Quick-add command bar**
    - Global keyboard hook for Ctrl+K / Cmd+K + Esc
    - `<QuickAddModal />` with the dark-glass card
    - Parser module: `parseQuickAddInput(raw, activeFilters) → { title, project, category, priority, estimate, due, subtasks, inherited }`
    - Live preview of detected chips
    - Sticky behavior after Enter
    - Shift+Enter creates AND starts timer (calls time-tracking API in sequence)

### Phase 6 — Polish (ongoing)

16. **Mobile parity** — port new views to React Native, with home-screen widget for Now Tracking timer
17. **Schedule view** — redesigned in B&W (last view to skin)
18. **Existing Insights tabs** — re-skin "Where your time went" and "Category × Project matrix" in B&W

---

## Project status

- **Phases 1-7 complete:** 18 of 18 spec steps + 8 of 9 mobile UI ports
- **Active development paused 2026-04-29** for usage-driven feedback period
- **Open items:**
  - Phase 7 step F (Android home-screen widget) — deferred, plan in `memory/phase7_step_f_widget_plan.md`
  - 4 pre-existing lint errors (not introduced by redesign)
  - DnD bounce-back end-to-end smoke test (structurally blocked until multi-column DnD path exists)
- **Acceptance checklist (line ~1029):** to be ticked through real usage

---

## Phase progress

### Phase 1 — Foundation ✅ COMPLETE 2026-04-25
- [x] Step 1 — Schema migrations (applied 2026-04-25 to live Supabase)
- [x] Step 2 — Time-tracking API (verified 2026-04-25; migration 0027 added tracked_sessions to supabase_realtime publication)
- [x] Step 3 — Status derivation refactor (2026-04-25; web app reads `effective_status` from `v_task_status`. Mobile parity completed 2026-04-28 in Phase 6 step 16: same two-query merge of `tasks` + `v_task_status`, `effective_status` + `completed_at` added to the mobile TaskType, all 12 read-path consumers ported, Done-checkbox on mobile now writes `completed_at` so the view stays coherent.)

### Phase 2 — Core features ✅ COMPLETE 2026-04-25
- [x] Step 4 — Project lifecycle UI (Change #2) — complete 2026-04-25 (smoke-tested in running app). Decisions: 'paused' is legacy-only (hidden from new actions, tolerated for pre-redesign rows); reactivation is `PATCH { status: 'active' }`, no dedicated `/reactivate` endpoint; delete is inline typed-name confirmation with attention-locking via row-fading + pointer-events:none on siblings.
- [x] Step 5 — Kill the Done button (Change #3) — complete 2026-04-25 (smoke-tested in running app, all 7 tests pass). Shared `useDismissOnOutside` hook (`lib/hooks/useDismissOnOutside.ts`) handles `mousedown`-outside + Esc for the three custom multi-selects (CategoryPicker, ProjectPicker, TagPicker). Single-selects (priority, estimate) are native `<select>`s — already close on tap natively. Mono hint `click outside or press esc to close` rendered at the bottom of every multi-select popover.
- [x] Step 6 — Filter bar + saved views (Change #4) — complete 2026-04-25 (smoke-tested in running app, all 7 tests pass). Filter dimensions: project, category, tag, priority. Across-dim AND, within-dim OR (`lib/filters.ts`). New API: `/api/saved-views` (GET/POST) and `/api/saved-views/[id]` (PATCH/DELETE) — `view_type` immutable on update. New components: `FilterBar`, `FilterPicker`. Filter state persisted via `zustand/middleware/persist` keyed `get-it-done:filters:v1` — **single global key, not per-user**: stale tag/project/category IDs from another account silently no-op against the current user's data (accepted tradeoff vs the complexity of dynamic per-user keying). **Per-value `↪` inheritance**: each pre-filled value carries its own ↪ badge above the AddTaskForm; removing inherited value A drops only A's mark, B stays; user-added C never carries one. Saved views shown across-view-type; clicking a view from another view_type navigates to that view AND applies its filters in one action. Save-view UX is inline name prompt (Enter submits, Esc cancels), disabled when no filters are active. Out of scope (deferred): Quick-add Ctrl+K (Phase 5 step 15), Priority/Calendar view filtering (those views don't exist yet — Phase 3), pinned/sort_order surface in dropdown.
- [x] Step 7 — Status auto-derive UI (Change #1) — complete 2026-04-25 (italic line + toast styling smoke-tested in running app; end-to-end DnD bounce-back smoke test deferred to Phase 6 because no live drag path exists yet). (a) Italic "↳ In Progress — …" line under in-progress task cards (`whyInProgressLine` in `lib/utils.ts`): "X of Y subtasks ha{s,ve} time logged" when subtasks exist with time, otherwise "Nm of work logged on this task". (b) Bounce-back toast on drag-to-In-Progress without any logged time: shared `Toast` component + `toast`/`showToast`/`dismissToast` slot in the Zustand store; B&W glass aesthetic, bottom-right, auto-dismiss 3.5s, ID-scoped to avoid stale-timer races. Bounce-back fires only in `KanbanView` (the only multi-column DnD path). Done-checkbox path stays manual per spec. **Retro:** `KanbanView` is currently NOT mounted in `Dashboard.tsx` — the active "Board" tab routes to `BoardView` (single-column tabs). Bounce-back code is correct, type-checked, and built, but ships *dormant* until Phase 3's Board redesign re-mounts a multi-column DnD view. The running app has no manual-status-promotion path anyway (tabs are filters not destinations; EditTaskDrawer has no status select), so Change #1's prevented bug is already unreachable in the current shape. Decision: don't add a manual status path solely to test prevention of a manual path — that contradicts the spec architecture. End-to-end DnD smoke test is deferred to the Phase 6 backlog.

### Phase 3 — New views ✅ COMPLETE 2026-04-26
- [x] Step 8 — Priority view (Change #5) — complete 2026-04-26 (smoke-tested in running app). Three swimlanes (Urgent black "current focus" card, Med + Low frosted-white). Schema has 4 priorities; spec has 3 lanes — `high` folds into the Med lane, `medium` is the lane's "+ Add" stamp. Compact `TaskCard` variant suppresses the progress bar block (subtask count + the "↳ In Progress …" line still render). Per-column "Hide done" checkbox (only visible when there are done tasks); done tasks otherwise faded to 0.55 opacity. `AddTaskForm` gained `defaultPriority` + `triggerLabel` props so each lane's "+ Add Urgent task" button auto-stamps its priority. Filter bar carries over (FilterBar now also surfaces on Priority view); saved-views support added (`view_type === 'priority'` round-trips through `loadView`/`saveView`).
- [x] Step 9 — List by project view — complete 2026-04-26 (smoke-tested in running app). New `ListByProjectView` replaces the flat `ListView` route in `Dashboard` (List tab now opens grouped). Toolbar: Group by (Project / Category / Flat list) + Sort by (progress / recently worked / total time / alphabetical). "Flat list" group-by mode renders the existing `ListView` unchanged so the old behavior is still reachable. New `ProjectCard` with status row, name, progress bar, 3 stats (Tracked / Open / Done), inline scrollable task list, "+ Add task to [project]" button. Compact variant (<4 tasks) hides the stats row and shrinks min-height. Active-tracking project (any task in the group has a row in `activeSessions`) renders as the black "current focus" card. Tasks with no project/category fall into an "Unassigned" pseudo-card at the end. `AddTaskForm` gained `defaultProjectIds?: string[]` so per-card "+ Add" pre-attaches the project (filter inheritance for project_ids still wins). **Decisions:** (a) project description plumbing skipped — DB column from migration 0021 stays unused for now (cards render name only); (b) group-by/sort-by are session-local UI state, NOT persisted via saved views (display state, not filter state).
- [x] Step 10 — Calendar view — complete 2026-04-26 (smoke-tested in running app). Ring-based goal-vs-work calendar implementing all 6 spec ring states (`no_data` / `rest_day` / `partial` / `goal_hit` / `exceeded` / `rest_bonus`). New API: `GET/PUT /api/daily-targets` (lazy-creates a row from migration 0024 defaults; PUT does an upsert); `GET /api/sessions/by-day?from=&to=` (tz-aware bucketing keyed YYYY-MM-DD, same `started_at`-only simplification as `/by-hour-of-week`). New components: `CalendarView` (top-level, owns visible-month state, fetches sessions on month change with ±1 month padding for the weekly strip), `CalendarTargetEditor` (black config card, save-on-blur per Decision (c), preset buttons commit immediately), `CalendarGrid` (Sun-first 6×7 month grid), `CalendarDay` (SVG ring per spec math `r=44`, `c≈276.46`), `CalendarLegend` (6 chips), `CalendarWeeklyStrip` (5 weeks ending today). Calendar tab placed at the end of the view switcher: Board · List · Priority · Schedule · Timeline · Calendar.

### Phase 4 — Insights & streaks ✅ COMPLETE 2026-04-26
- [x] Step 11 — Daily progress tab (Change #6) — complete 2026-04-26 (smoke-tested in running app). New 3-tab nav at the top of the Insights page: "Where your time went" (existing) / "Daily progress" (new) / "Category × Project matrix" (existing matrix only). Daily progress tab renders: streak ring (56px white-on-black SVG with arc to next milestone — 5/10/25/50/100/250/500/1000 ladder, falls back to current+100 above the top), 3 stat cards (Today X/5, This week X/35 with delta vs last week, 30-day average X.X/5 with completion rate %). "Today so far" list below with Today/Yesterday/Pick-a-day toggle. **Decisions:** (1) Streak history line chart deferred to Phase 6 — needs per-day streak reconstruction from `tasks.completed_at` + `planned_for_date` history; not currently plumbed. (2) Stat math uses `tasks.completed_at` (Phase 1 step 3 derive) for "done in range" detection.
- [x] Step 12 — When you work heatmap — complete 2026-04-26 (smoke-tested in running app). New `WhenYouWorkCard` rendered below `TodaySoFarCard` in the Daily Progress tab. 7×24 grid: rows Mon..Sun (rendered in spec order via `[1,2,3,4,5,6,0]` → API's Sun-first indexing), columns 0..23h. Cell intensity bucketed 0..4 against the matrix's max non-zero seconds; greyscale swatches. Hour labels (12a/4a/8a/12p/4p/8p) anchored at multiples of 4. Range toggle (7d / 30d / 90d) via the `/api/sessions/by-hour-of-week` endpoint (already built in Phase 1). 4-column summary footer per spec: Peak hour (hour-of-day total across all days), 2nd peak, Most focused day, Late-night ratio (% of total tracked time after 10pm). Store gained `hourOfWeekRange` / `hourOfWeekMatrix` / `hourOfWeekFetchedFor` slots; `setHourOfWeekRange` triggers a refetch.
- [x] Step 13 — Now Tracking banner — complete 2026-04-26 (smoke-tested in running app). `NowTrackingBar.TrackingRow` redesigned: black card (`#1a1a2e`) with white text replacing the old purple `#7F77DD`. New layout: NOW TRACKING mono uppercase label + pulsing white dot (1.4s scale+opacity loop), big task name (15px sans, semibold), tiny mono meta line `project · CATEGORY · PRIORITY` (project/category/priority pulled from the active task's `project_ids[0]` / `category_ids[0]` / `priority`; segments skipped if null). Big 32px monospace tabular-nums timer. Three pill buttons stacked vertically: Focus (white pill, primary; behavior unchanged — opens FocusModeView), Pause (subtle white/12 bg dark pill), Stop (transparent with white/20 border). 4-second linear sheen via inline `<style>` keyframes (`nowTrackingSheen`) with a 200%-wide gradient + `background-position` shift. Mode badges (call_focus / strict / pomodoro_25_5 / etc.) and drift-events pill preserved. Multi-timer header banner and `lastStopSummary` green saved-toast kept as-is.
- [x] Step 14 — Task time displays redesign — complete 2026-04-26 (smoke-tested in running app). (a) `TaskCard` title row: replaced the old `⏱ Xs` pill with a two-line block — top line is a font-mono tabular-nums value (preserves over-budget color cues from `investedColor`/`investedBg`); bottom line is an 8px mono uppercase label `TOTAL TRACKED` (or `NEVER STARTED` when invested === 0). Thin 1px hairline divider precedes the block. Live-tracking state shows a pulsing purple dot prefix on the value line, matching the NowTrackingBar pattern (`taskCardLivePulse` keyframes). Estimate kept but visually demoted to a small mono `est Xm` text (no pill background). (b) New rollup bar between the progress bar block and the subtask list, only when expanded AND task has subtasks: `TIME BREAKDOWN ━━ X of Y subtasks worked  47m 23s`. (c) `SubtaskItem`: replaced the purple `🕐 X` pill with a clean monospace number on the right. Currently-active subtask gets a pulsing purple dot prefix (`subtaskLivePulse`).

### Phase 5 — Quick-add ✅ COMPLETE 2026-04-26
- [x] Step 15 — Quick-add command bar (Ctrl+K) — complete 2026-04-26 (smoke-tested in running app). New `QuickAddBar` component (frosted dark-glass card, 620px, anchored 12vh from top, full-viewport backdrop). Global Ctrl+K / Cmd+K toggle wired via `keydown` listener; "⚡ Quick add ⌘K" header button is the second entry point. Grammar handled by hand-rolled `lib/quickAddParser.ts` + `lib/quickAddDateParser.ts` (no `chrono-node` dep — Decision Q1=b): `@project` (fuzzy: exact > prefix-unique > substring-unique), `#category` (same fuzzy), `!!!`/`!!`/`!` priorities, `~30m`/`~2h`/`~1.5h` estimates, `today`/`tomorrow`/`mon..sun`/`apr 30`/`in N days`/`in N weeks` due dates, `-> a; b; c` subtasks. Live parse preview chips render below the input with `↪` for filter-inherited values. Sticky-after-Enter (clears input, keeps bar open + focused). Shift+Enter creates the task AND immediately starts the timer, then closes the bar. Esc / outside-click close. Decisions: (a) Inbox project lazy-created on first quick-add submit when no project resolves and no filter inheritance applies (Decision Q2=a). (b) Unresolved `@project` / `#category` tokens are dropped silently from the submit (task still created); a toast names what didn't match (Komal's Phase 5 add-on). (c) Initially mounted in Dashboard only (Decision Q4=a); lifted to `app/layout.tsx` in Phase 6 polish 2026-04-26 — Ctrl+K now works on Insights and Settings too.

### Phase 6 — Polish
- [x] Step 16 — Mobile parity **(done 2026-04-28)** — scope: bring mobile to parity on Phase 1 step 3 status derivation. Mobile TaskType gained `effective_status` + `completed_at`; `fetchTasks` does the same two-query merge as web (`tasks` + `v_task_status`, merged in JS by id, falls back to `row.status` for rows missing from the view); `addTask`/`updateTask`/`startTrackingTask` updated to keep optimistic `effective_status` coherent; the Done checkbox in `TaskCard` and `TodayFiveSheet` now writes `completed_at` along with the legacy `status`; 12 read-path consumers (KanbanView, ListView, TaskItem, TodayFiveSheet, TodayCard, DailyGoalBar, RolloverPromptSheet, ScheduleView palette filter, settings.tsx focus picker, tabs `_layout.tsx` focus picker, TaskCard styling × 4) flipped to read `effective_status`. The redesigned views (Priority, List-by-project, Calendar, Daily Progress tab, NowTrackingBar redesign, Schedule rebuild, etc.) are NOT yet ported to mobile — that's the larger UI port deferred to a future Phase 7. v1 mobile parity = data layer correct so the existing mobile UI works coherently with the redesigned schema. Home-screen widget for Now Tracking timer also deferred to Phase 7.
- [x] Step 17 — Schedule view redesign **(done 2026-04-28)** — Planned/Tracked side-by-side lanes; drag-to-reschedule on existing blocks; new `/api/sessions/by-day-detailed` endpoint; live session pulse + 60s auto-refetch; B&W reskin (NOW line ink, lavender hovers → `#f3f4f6`, `[#888]` → `#9ca3af`).
- [x] Step 18 — Existing Insights tabs reskin — applied 2026-04-26; **smoke test confirmed 2026-04-28** (Komal in real usage). Token swap inside `components/Insights.tsx`: `INK` `#1a1730→#1a1a2e`, `INK_MUTE` `#8e89a8→#9ca3af`, `LINE` `#ece9f7→#e5e7eb`, `LINE_SOFT` `#f2f0fa→#f3f4f6`, `PRIMARY/PRIMARY_DEEP` collapsed to `#1a1a2e` (black accent), `PRIMARY_SOFT` `#efeaff→#f3f4f6`. Page background `#f6f5ff→#e8e8ea` (system bg). Brand mark `⚡` flipped from `#f59e0b` (orange) to `INK` for B&W consistency. Inline `#d5cafe` border → `LINE` token. `tintFromHex` (used for category/project color tints in bars and matrix) kept as-is — those are user-chosen identity colors, not chrome. Auto-propagated to all 11 purple-using sites via the existing token constants. Dashboard header brand mark + FloatingAddButton + other Dashboard chrome still use the legacy purple — those are out of step 18 scope.

### Phase 7 — Mobile UI port (in progress)
- [x] **Step A1 — NowTrackingBar redesign on mobile** (done 2026-04-28). `TrackingCard.tsx` redesigned in place with the spec's ink-black card (`#1a1a2e`) in light mode (kept M3 Momentum lime in dark mode). Added meta line `project · CATEGORY · PRIORITY`, 28px tabular timer, and a vertical pill stack (Focus white / Pause subtle / Stop transparent border). Existing slide-in entrance animation + pulsing dot preserved via Reanimated. Multi-session badge `+N` renders inline next to the "NOW TRACKING" label instead of the old separate yellow row. Drift count renders as a red `⚡ N` pill. Dead `NowTrackingBar.tsx` (unmounted) deleted. JetBrainsMono font references stripped — fonts not loaded on mobile yet, default sans + `tabular-nums` font variant gives the same effect.
- [x] **Step A2 — Daily Progress tab on mobile** (done 2026-04-28). Sub-tab toggle added at the top of `InsightsView`: "Daily progress" (default) / "Where time went" (existing legacy view). New `components/insights/DailyProgressTab.tsx` mirrors the web layout: streak ring (88px black card with white arc, day count, "best yet · Nd"), 3 stat cards (Today / This week / 30-day average), Today So Far list (reads tracked_sessions directly via Supabase JS client, RLS-scoped). Heatmap and streak-history line chart are mobile-deferred — those need bigger SVG work and the data still lives on web. The legacy "Where your time went" tab is unchanged behind the new sub-tab.
- [x] **Step B1 — Priority view on mobile** (done 2026-04-28). New `components/PriorityView.tsx`, three lanes via `SegmentedButtons` (Urgent / Med / Low). Schema's 'high' folds into Med. Mobile compresses the web's 3-column swimlane layout into a single-lane-at-a-time pattern (matches the mobile Kanban convention). Done tasks excluded from all lanes — they have no priority signal once completed. The Urgent lane gets a black "CURRENT FOCUS" header strip per spec § Design system. Wired into `app/(tabs)/index.tsx` (Board screen) behind a "By status / By priority" SegmentedButtons toggle at the top — non-destructive: Kanban stays default.
- [x] **Step B2 — List by project view on mobile** (done 2026-04-28). New `components/ListByProjectView.tsx` with two SegmentedButtons toolbars (Group: Project / Category / Flat; Sort: Progress / Recent / Time / A–Z). Each non-flat group = a collapsible section header with the project/category color dot, name, task count + progress % + total tracked time. Active project (one with a live session) gets a black header per spec § Design system. Flat mode renders a single sorted list using TaskItem. Wired into `app/(tabs)/list.tsx` (Today screen) behind a "Today / By project" SegmentedButtons toggle — Today (sectioned) stays default.
- [x] **Step C — Calendar view on mobile** (done 2026-04-28). New `components/CalendarView.tsx`, `CalendarGrid.tsx`, `CalendarDay.tsx`. RN-svg port of the web ring-state calendar — same 6 ring states (no_data / rest_day / partial / goal_hit / exceeded / rest_bonus), same ring math (r=44 in 100×100 viewBox, c ≈ 276.46). Read-only with month nav (← · `Month YYYY` · → · today). Cell size auto-derived from screen width. Wired into `app/(tabs)/schedule.tsx` behind a "Day / Calendar" SegmentedButtons toggle. Editor + weekly strip deferred — Komal can edit targets via web. Store gained `dailyTargets` + `secondsByDay` slots + `fetchDailyTargets` (auto-creates a 'balanced' preset row on first read for a fresh user) + `fetchSessionsByDay` (direct Supabase JS read, RLS-scoped, with ±1 day padding for tz safety, JS-side filtering by Intl.DateTimeFormat).
- [x] **Step D — Schedule additions on mobile** (done 2026-04-28). Pragmatic scope: the existing 913-line mobile ScheduleView was already side-by-side (planned left lane / actual right lane) and on-plan vs off-plan detection — better than I'd remembered. Did NOT do a full rebuild (would degrade mobile UX for narrow screens). What changed: (1) **drag-to-reschedule** — added `DraggablePlannedBlock` wrapper using `react-native-gesture-handler` Pan + Reanimated `useSharedValue`; the small `⋮⋮` handle in the top-right of each planned block is the only surface that initiates pan, leaving the body's `onLongPress` for delete; on release, snaps to nearest 15min via `(deltaPx / HOUR_H) * 60` and calls `updatePlannedBlock(id, { start_at })`; clamps to the visible day window. (2) **B&W reskin** — `success` color (on-plan blocks): `#0F7A4B` light → `#1a1a2e` ink, dark stays lime. Live block: was `c.primary` (M3 purple) → `#1a1a2e` light / `#E4FF3A` dark, with corresponding fg flips so text stays readable. NOW line + dot + text: was `c.error` red → `#1a1a2e` ink. Hue-based pastel fills for planned blocks kept (user-chosen tag colors per spec rule).
- [x] **Step E1 — When You Work heatmap on mobile** (done 2026-04-28). New `components/insights/WhenYouWorkCard.tsx` mounted at the bottom of the Daily Progress tab. 7×24 grid (Mon-first display, Sun-first store indexing) with 5 swatch intensities `#f3f4f6 → #1a1a2e` (light) / `#2A2A30 → #E4E4E7` (dark). Range pill (7d/30d/90d). 4-stat summary footer (Peak hour / 2nd peak / Top day / Late-night %). Bucketing by `started_at` only — simpler than web's hour-by-hour overlap walking; matches the directional-signal use case. Store gained `hourOfWeekRange/Matrix/FetchedFor` slots + `setHourOfWeekRange` + `fetchHourOfWeek(force?)` actions, reads `tracked_sessions` directly via Supabase JS (RLS-scoped).
- [x] **Step E2 — Streak history line chart on mobile** (done 2026-04-28). New `components/insights/StreakHistoryCard.tsx` mounted at the bottom of the Daily Progress tab. Pure react-native-svg port of the web chart — same path-with-gap-breaks rendering, peak callout dot + label, today marker with Reanimated pulsing ring overlay (Animated.View positioned over the SVG dot since `createAnimatedComponent(Circle)` is noisier). Calls the deployed web `/api/insights/streak-history` via `EXPO_PUBLIC_WEB_URL` (single-source the streak rule replay; mobile and web won't drift). New `lib/insights.ts` `fetchStreakHistory()` helper + new store slot `streakHistory` + `fetchStreakHistory(force?)` action with cache key = local-tz today. Empty/loading states match the heatmap card.
- [~] **Step F — Now Tracking Android widget — deferred 2026-04-28.** Not the tail end of an auto-mode loop. The work is multi-day native: new dep (`react-native-android-widget` or `react-native-glance-widget`) → config plugin in `app.json` for `AndroidManifest` `<receiver>` + widget XML resources → native Kotlin AppWidgetProvider → WorkManager periodic updater (≥15min minimum interval; live-second tick isn't achievable on Android widgets) OR push-based updates from the app process → auth handoff (widget process can't read the Supabase session unless we share it via SharedPreferences). Requires an EAS development build (Expo Go can't host the widget). Sequence as its own project when prioritized — see `memory/phase7_step_f_widget_plan.md` for the plan-of-record.

### Phase 7 — DONE 2026-04-28
8 of 9 candidates shipped (A1, A2, B1, B2, C, D, E1, E2). The home-screen widget is the only deferred item; phase considered closed.

---

## API contract

Endpoints to build/update. All return JSON. Auth via Supabase JWT in `Authorization: Bearer ...` header.

### Time tracking — backed by `tracked_sessions`
```
POST   /api/sessions/start                  { task_id, subtask_id?, mode? } → session
POST   /api/sessions/:id/stop               { } → closed session
GET    /api/sessions/active                 → sessions[] (concurrent timers allowed)
GET    /api/tasks/:id/time-summary          → { total_seconds, by_subtask: [...] }
GET    /api/sessions/by-hour-of-week        ?range=30d → { (day, hour): seconds }
```

### Tasks
```
GET    /api/tasks                           ?status=todo&project=...&category=... → tasks[]
GET    /api/tasks/:id                       → task with derived status
POST   /api/tasks                           { title, project_id, category_id, priority, ... } → task
PATCH  /api/tasks/:id                       { ...partial } → task
POST   /api/tasks/:id/complete              → task with completed_at set
DELETE /api/tasks/:id                       → 204
```

### Projects
```
GET    /api/projects                        ?status=active → projects[]
POST   /api/projects                        { name, description, color } → project
PATCH  /api/projects/:id                    { status, ...partial } → project
DELETE /api/projects/:id                    → 204 (hard delete + cascade)
```
*Note: the spec previously listed a dedicated `POST /api/projects/:id/reactivate`
endpoint. Decided 2026-04-25 to drop it — `PATCH { status: 'active' }` covers
the same operation. One less endpoint to maintain.*

### Saved views
```
GET    /api/saved-views                     → views[]
POST   /api/saved-views                     { name, view_type, filters } → view
PATCH  /api/saved-views/:id                 → view
DELETE /api/saved-views/:id                 → 204
```

### Daily targets
```
GET    /api/daily-targets                   → { mon, tue, ..., sun, preset_name }
PUT    /api/daily-targets                   { mon, tue, ..., sun, preset_name } → updated
```

### Streaks & analytics
```
GET    /api/streaks                         → { current_streak, longest_streak, longest_streak_ended_at, last_goal_met_date }
GET    /api/insights/daily-progress         ?range=30d → { days: [{ date, completed, total, hours }] }
GET    /api/insights/today-so-far           ?date=2026-04-25 → { tasks: [...], hours_tracked, completed_count }
```

### Quick-add (server-side parse fallback)
```
POST   /api/quick-add/parse                 { raw, active_filters } → parsed task object
POST   /api/quick-add/create                { raw, active_filters, start_timer } → created task (+ active time log if start_timer)
```

---

## Component map

Frontend component tree (React).

```
<App>
  <NowTrackingBanner />          ← global, sticky, only visible when active log
  <QuickAddModal />               ← global, opens on Ctrl+K
  <Header>
    <Brand /> <PrimaryNav /> <QuickAddButton />
  </Header>

  <Routes>
    /board       → <BoardView>
                    <TitleRow /> <TodayHero />
                    <ViewTabs /> <StatusTabs />
                    <FilterBar /> <FilterExplainer />
                    <AddTaskRow />
                    <TaskList>
                      <TaskCard />          ← uses .active-tracking class
                        <TaskTotalTime />
                        <TaskMeta />
                        <WhyHere />
                        <TaskProgress />
                        <TimeBreakdownRollup />
                        <SubtaskList>
                          <SubtaskRow />
                            <SubtaskTime />

    /list        → <ListView>
                    <Toolbar group-by sort-by />
                    <ProjectGrid>
                      <ProjectSquare>
                        <ProjectHead /> <ProjectStats />
                        <ProjectTaskList /> <AddToProjectButton />

    /priority    → <PriorityView>
                    <PrioritySwimlane variant="urgent" />
                    <PrioritySwimlane variant="med" />
                    <PrioritySwimlane variant="low" />

    /calendar    → <CalendarView>
                    <DailyTargetsConfig />
                    <CalendarCard>
                      <CalendarHead /> <CalendarTotals />
                      <CalendarRingGrid />
                      <WeeklyTotals /> <CalendarLegend />

    /insights    → <InsightsView>
                    <InsightsTabs />
                    <StatGrid />              ← streak ring, today, this week, 30-day
                    <TodaySoFarCard />
                    <WhenYouWorkHeatmap />
                    <StreakHistoryChart />

    /projects    → <ManageProjectsView>
                    <ProjectStatusTabs />
                    <ProjectList>
                      <ProjectRow status="active|completed|archived" />
                    <AddProjectForm />
                    <StatusGuide />
  </Routes>
</App>
```

Shared components:
- `<ProjectPicker />` — used by Create Task modal, Quick-add, and filters. Knows about active/completed/archived split.
- `<CategoryPicker />`, `<TagPicker />`, `<PriorityPicker />`, `<DatePicker />`
- `<Checkbox />`, `<IconButton />`, `<Pill />`
- `<Chip />` — used in filter bar, quick-add detected chips, and elsewhere

State management (Zustand stores):
- `useTasksStore` — tasks, subtasks, derived status
- `useProjectsStore` — projects with lifecycle, categories, tags
- `useTimeStore` — active log, recent logs, totals per task
- `useFilterStore` — current filter values, saved views, current view name
- `useStreakStore` — streak data
- `useUiStore` — modal open/closed, focus mode, etc.

---

## Open questions

Things to decide before/during implementation:

1. **Focus mode behavior** — we put a "Focus" button on the Now Tracking banner. Should it:
   a) Just dim non-essential UI for 25 min Pomodoro?
   b) Also block notifications system-wide via Notification API?
   c) Trigger Get-it-done's existing OS-level Focus Lock feature?

2. **Quick-add ambiguity handling** — when user types `@a`, should the bar:
   a) Auto-pick the first match alphabetically? (current behavior)
   b) Show a dropdown to pick? (better UX, more code)
   c) Wait for Enter then show an error if ambiguous?

3. **Inbox project for untagged quick-adds** — if no filter active and user types `quick task` with no `@project`, where does it land? Options:
   a) Auto-create an "Inbox" project for triage
   b) Force user to pick a project (block submission)
   c) Land in the user's most-recently-used project

4. **Streak grace period** — if Komal misses a day by an hour (e.g., works until 1am), does that 1am task count for the previous day or the current day? Suggested rule: tasks completed before 4am count for the previous day.

5. **Calendar view goal-vs-tracked discrepancy** — what if user changes daily targets retroactively? Do historical days re-render with the new target, or stay "frozen" at their original target ratio? Suggested: re-render — it's about pacing, not history.

6. **Time logs across midnight** — if a timer runs from 11pm to 1am, does it count as 1h on day 1 + 1h on day 2, or 2h on day 1? Suggested: split at midnight.

7. **Mobile parity strategy** — three options for the Expo build:
   a) Replicate every web view 1:1 (slow)
   b) Build a focused mobile-first set: Today's 5, Now Tracking, Quick-add, Calendar (fast, opinionated)
   c) Web-view wrapper for non-critical screens (compromise)

---

## Acceptance checklist

Use this to verify the rebuild is complete.

**Change #1 — Status auto-derives**
- [x] Tasks with no time logs appear only in "To Do" tab (2026-04-25 — covered by Phase 1 step 3 read-path refactor; v_task_status drives effective_status)
- [x] Tasks with any time log on task or subtask appear in "In Progress" (2026-04-25 — same)
- [x] Deleting all time logs on a task moves it back to "To Do" (2026-04-25 — derivation re-runs on next fetchTasks)
- [x] Manual drag without time bounces back with toast (2026-04-25 — `KanbanView.handleDragEnd` short-circuits and calls `showToast`; logic verified by build + types but ships dormant since `KanbanView` isn't mounted in current routing — end-to-end DnD smoke test deferred to Phase 6)
- [x] "Why is this here?" line appears on every in-progress task (2026-04-25 — `whyInProgressLine` in `lib/utils.ts`, rendered in `TaskCard`)
- [x] Done is still manual (checkbox) (2026-04-25 — Done-checkbox path in `TaskCard.handleCheckbox` writes `completed_at`; no derivation involved)

**Change #2 — Project lifecycle**
- [x] Projects can be marked Active / Completed / Archived (2026-04-25)
- [x] Completed projects hidden from create-task picker by default (2026-04-25)
- [x] "Show completed" / "Show archived" toggles work in pickers (2026-04-25)
- [x] Reactivate works from manage-projects screen (2026-04-25 — via the inline status dropdown; no dedicated endpoint, PATCH covers it)
- [x] Delete confirms with project-name typing (2026-04-25 — inline confirmation row; other rows fade during the destructive prompt)
- [x] Analytics still include completed project data (no code change required — completed projects naturally pass `p.status !== 'archived'` filters)

**Change #3 — No more Done button**
- [x] All multi-select dropdowns close on outside-click + Esc (2026-04-25 — shared `useDismissOnOutside` hook)
- [x] Single-select dropdowns close on tap (2026-04-25 — priority + estimate use native `<select>`, already close on tap)
- [x] No "Done" buttons remain anywhere in UI (2026-04-25 — removed from CategoryPicker, ProjectPicker, TagPicker)
- [x] Mono "click outside or press esc" hint appears on multi-selects (2026-04-25)

**Change #4 — Filter bar + saved views**
- [x] Filter bar above Board with chip UI (2026-04-25)
- [x] "+ Add filter" button works (2026-04-25 — `FilterPicker` two-step popover; dim → values)
- [x] Saved views save current filter combo (2026-04-25 — disabled until at least one filter is active)
- [x] Saved views dropdown loads filters back (2026-04-25 — also navigates view_type if different)
- [x] Filter inheritance pre-fills new task with `↪` mark (2026-04-25 — per-value chips above the form)
- [x] Override flips to non-inherited (2026-04-25 — removing inherited value drops only that value's mark)

**Change #5 — Priority view**
- [x] New tab next to Board / List / Schedule / Calendar (2026-04-26 — added Priority tab between List and Schedule)
- [x] Three swimlanes (Urgent black, Med + Low frosted) (2026-04-26 — `high` folds into Med per the 3-lane spec)
- [x] Per-lane "+ Add" auto-stamps priority (2026-04-26 — `AddTaskForm.defaultPriority` prop + per-lane `triggerLabel`)
- [x] Filters carry over from Board (2026-04-26 — `matchesFilters` applied; FilterBar surfaces on Priority view too)

**Change #6 — Streak + analytics**
- [x] Streak ring shows current value with arc progress (2026-04-26 — `StreakRing` 56px SVG, milestones 5/10/25/50/100/250/500/1000)
- [x] Today / This week / 30-day cards populated (2026-04-26 — `DailyProgressStat` × 3; week delta computed from `completed_at` ranges)
- [x] Today so far list shows today's tasks with check/missed (2026-04-26 — filter on `planned_for_date`, status from `effective_status`)
- [x] Day picker (Today / Yesterday / Pick a day) works (2026-04-26 — segmented toggle + date input on "Pick a day")
- [x] Streak count reflects ≥1-task-from-Today's-5 rule (2026-04-26 — surfaces `user_profiles.current_streak`, which is maintained by the existing streak SQL that already implements the rule; UI doesn't recompute)

**New features**
- [ ] Now Tracking banner appears when timer active, hidden otherwise
- [ ] Live timer ticks every second
- [ ] Focus / Pause / Stop work
- [ ] Calendar shows ring-based bubbles per day
- [ ] Per-day target inputs editable
- [ ] Presets work (Weekdays only / Balanced / Hustle / Custom)
- [ ] Goal-met days render with full ring
- [ ] Exceeded days render with thick + glowing ring
- [ ] When-you-work heatmap shows hours × days
- [ ] Range toggle (7d/30d/90d) works
- [ ] Ctrl+K opens quick-add from anywhere
- [ ] All grammar (`@`, `#`, `!!!`, `~`, dates, `->`) parses correctly
- [ ] Filter inheritance works in quick-add
- [ ] Sticky behavior after Enter
- [ ] Shift+Enter creates + starts timer
- [ ] Esc closes modal

**Visual rule**
- [ ] No coral, no other colors anywhere — only black, white, greys
- [ ] Only one task is `.active-tracking` (black) at a time
- [ ] Other "in progress" tasks render on white cards
- [ ] All live indicators pulse at synced 1.4s timing
- [ ] Inter font everywhere (no italic serif fallback)

---

## Phase 6 hardening backlog

Edge cases identified during code review, not blocking initial ship.
Address before significant traffic / multi-user scenarios.

### Concurrency
- [x] start.ts — Idempotency was SELECT-then-INSERT, not transactional. Two simultaneous calls with same (task_id, subtask_id) could create duplicate sessions. **Fixed 2026-04-26** via migration `0028_active_session_uniqueness.sql` (partial unique index `uniq_open_session_per_pair` on `(user_id, task_id, COALESCE(subtask_id, '00000000-...'::uuid)) WHERE ended_at IS NULL`) + INSERT-then-on-23505-SELECT pattern in the endpoint. Coalesce handles NULL subtask_id (PostgreSQL treats NULLs as distinct in unique indexes by default).
- [x] stop.ts — UPDATE didn't predicate on ended_at IS NULL. Parallel stops both succeeded, second overwrote first. **Fixed 2026-04-26** by adding `.is('ended_at', null)` to the update chain + switching to `.maybeSingle()` + 400 on zero-rows.

### Defense-in-depth
- [x] start.ts — No validation that task_id belongs to current user pre-insert. RLS catches it but FK error is the actual surface. **Fixed 2026-04-26** by adding a pre-insert lookup `from('tasks').eq('id', taskId).eq('user_id', user.id)` returning a clean 400 'task not found' when missing.

### Edge mechanics
- [x] time-summary.ts — PostgREST or= URL length limit (~8KB) capped at ~200 subtasks. **Fixed 2026-04-26** by splitting into two parallel queries (`task_id.eq.X` and `subtask_id.in.(...)`) and JS-merging by row id (dedupes any double-matched session). Now scales to arbitrary subtask counts.
- [ ] time-summary.ts:91-95 — total_seconds is server-snapshot, not live. Live computation belongs in browser via useLiveTimer for is_active sessions. (By design — tagging only because response shape might be misread.)
- [x] by-hour-of-week.ts — Sessions crossing midnight in user's tz fell entirely into start hour. **Fixed 2026-04-26** by walking each session's `[started_at, ended_at)` window and attributing each slice's seconds to the correct (day-of-week, hour) cell in the user's tz. Stepping happens at hour boundaries computed via `Intl.DateTimeFormat` (minute + second parsing), so worst-case a 24h session walks 24 boundaries — fine. Open sessions still skipped (matches "completed work only" intent of the heatmap).

### Mobile parity migration
- [x] `get-it-done-mobile/` task store reads `tasks.status` directly — **done 2026-04-28** in Phase 6 step 16. Mobile `fetchTasks` now does the two-query merge of `tasks` + `v_task_status`, surfaces `effective_status`, and 12 read-path consumers were ported. Done-checkbox writes `completed_at` so the view stays coherent.
- [x] `lib/store.ts:1322-1343` (web) — legacy auto-promote backfill removed **2026-04-28**. The block wrote `tasks.status = 'in_progress'` for tasks whose subtasks were partially done, kept around so mobile (which still read the legacy column) saw coherent data. With mobile now reading `effective_status` from `v_task_status`, the backfill is dead weight; deleted from `fetchTasks`. Live auto-promote in `startTrackingTask` left in place — it's not backfill, it's the optimistic UI update on session start.

### Deferred features
- [x] Dashboard chrome B&W reskin — **done 2026-04-26**. Bulk swap across 33 components / 145 substitutions via Python script: solid purples (`#8b5cf6` `#7c3aed` `#5a3fd8` `#7F77DD` `#6d5bd0`) → `#1a1a2e`, purple alphas `rgba(139,92,246,X)` → `rgba(0,0,0,X)`, lavender tints (`#d5cafe` `#faf7ff` `#f5f2ff` `#f6f5ff` `#efeaff`) → `#f3f4f6` / `#e5e7eb`, page wash gradients (Dashboard + Settings `linear-gradient(...,#f8f7ff,...,#faf5ff)`) → solid `#e8e8ea` (system bg). Plus a handful of lavender-border / lavender-bg leftovers in `AiSuggestionPanel`, `DailyProgressStat`, `PomodoroTimer`, `FocusLockPicker`, `RecurringTemplatesManager`, `TodayFiveDrawer`, `TodaySoFarCard`, `WhenYouWorkCard`. New `lib/palette.ts` exports `INK` / `LINE` / `INK_TINT_X` constants for new code (existing files keep inline literals). Final grep for any of `#8b5cf6 #7c3aed #5a3fd8 #7F77DD #6d5bd0 #d5cafe #f5f2ff #faf7ff #f6f5ff #efeaff #ece9f7 #f8f7ff #f0f4ff #faf5ff #f2f0fa #7c5cff #c4b5fd #f0f0ff` in `components/` returns zero. User-chosen category/project/tag colors and semantic colors (success green, warning yellow, error red, streak orange) preserved. Note: 4 pre-existing `react-hooks/set-state-in-effect` lint errors surfaced when running `eslint components/` (whole dir) — they're in `BreakingOutModal`, `FocusLockPicker:55-61`, `RolloverPromptModal`, `TimelineView:372-374`, all pre-Phase-6 patterns and outside the chrome reskin scope.
- [x] QuickAddBar mounted at `app/layout.tsx` — **done 2026-04-26**. Ctrl+K now works on `/dashboard`, `/insights`, `/settings`. The bar self-guards on `useStore(s => s.userId)` and renders nothing + skips the keyboard listener on `/login` and `/auth/callback` where no user is set. The submit pipeline also bails on null userId. Insights and Settings pages set userId via their existing `*Init` client components, so the bar wakes up there automatically.
- [x] Streak history line chart (12 weeks, peak callout, pulsing today marker) — spec § Change #6 last card. **Done 2026-04-28.** Built as a server endpoint `/api/insights/streak-history` that replays the *actual* live streak rule (≥15-min focus-level session per day, from migration 0012 `update_focus_streak` trigger) across 84 days in the user's tz. The replayed rule is `tracked_sessions` based, not `tasks.completed_at` based as the original deferral note guessed — that was a misreading; the live `current_streak` value is driven by sessions. Component `components/insights/StreakHistoryCard.tsx` renders a pure-SVG line chart (no chart lib) appended below WhenYouWorkCard in the Daily Progress tab, with peak callout, pulsing today marker, and gap breaks on non-qualifying days. Decision: replay-on-demand instead of a `streak_days` pg_cron table — cheap enough at 84-day window scale and avoids drift between the materialized table and the trigger-maintained `user_profiles.current_streak`.

### Deferred end-to-end smoke tests
- [ ] Confirm Change #1 bounce-back end-to-end after Phase 3 Board redesign mounts `KanbanView` (or any other multi-column DnD view). The bounce-back logic in `KanbanView.handleDragEnd` (added 2026-04-25 in Phase 2 step 7) is correct, type-checked, and built but ships dormant — there's no live drag path to In Progress in the running app's current shape. Scenarios to verify when a DnD path lands: drag task with no logged time → toast fires + task stays put; drag task with task-level logged time → moves; drag task whose only logged time is on a subtask → moves; drag task with an open `activeSessions` row but `total_time_seconds = 0` → moves.

---

## Reference: prototype HTML files

The full clickable prototype is in `getitdone-bw-v9.html` (most recent). Earlier versions trace the design evolution:

- v1 (`getitdone-prototype.html`) — first sketch, kept old purple aesthetic
- v2 (`getitdone-redesign.html`) — editorial cream/coral version (rejected)
- v3 (`getitdone-mono.html`) — black + frosted glass with coral accent
- v4 (`getitdone-mono-v2.html`) — switched to Inter, dropped italic serif
- v5 (`getitdone-bw.html`) — pure B&W, ring calendar with weekly slider
- v6 (`getitdone-bw-v2.html`) — per-day editable targets, presets
- v7 (`getitdone-bw-v3.html`) — added List by project view (square cards)
- v8 (`getitdone-bw-v4.html`) — Now Tracking banner + redesigned task time displays
- v9 (`getitdone-bw-v5.html` → `v8.html`) — strict active-tracking rule, smaller heatmap then removed, Today so far card
- v10 (`getitdone-bw-v9.html`) — quick-add command bar with full grammar

Use the latest as the visual source of truth. CSS variables and component patterns can be lifted directly.

---

## End of spec

If anything's unclear during implementation, the answer is usually in the prototype HTML — open it and inspect. The visual decisions are deliberate and should be preserved.

— Built with Komal · April 2026
