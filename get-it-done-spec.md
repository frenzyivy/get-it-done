# Get-it-done — v2 Spec

**Owner:** Komal
**Purpose:** Evolve Get-it-done from a kanban + timer app into a **plan-vs-reality focus app** — the only productivity tool that shows users how honest they are about their own time.

**Core wedge:** Most todo apps tell you what to do. Most calendars tell you when. This app tells you **how wrong you were** — and uses that signal to make you better every week.

---

## Table of contents

1. Product positioning
2. Feature scope (v2)
3. Information architecture
4. Feature 1 — Daily goal bar + momentum signals
5. Feature 2 — Persistent "Now tracking" bar
6. Feature 3 — Segmented column switcher (board redesign)
7. Feature 4 — One-tap timer start
8. Feature 5 — Schedule view (calendar-style planner)
9. Feature 6 — Timeline view (planned vs actual)
10. Feature 7 — Weekly pattern insights (AI-powered)
11. Data model (Supabase / PostgreSQL)
12. API contracts
13. Component architecture
14. Build order & milestones
15. Design tokens
16. Edge cases & rules
17. Open questions

---

## 1. Product positioning

### Tagline options
- "Plan your day. Track reality. Learn the gap."
- "The focus app that's honest with you."
- "Kanban. Calendar. Timer. Truth."

### Differentiator vs competitors
| Tool | What it does | What it misses |
|---|---|---|
| Todoist, TickTick | Lists + reminders | No time reality check |
| Google Calendar | Time blocks | No tasks / no tracking |
| Toggl, Clockify | Time tracking | No planning layer |
| Sunsama, Motion | Plan + calendar | No honest post-hoc "what really happened" |
| **Get-it-done** | Plan + kanban + timer + **honest comparison** | — |

### Target user
Solo operators, founders, developers, content creators who:
- Already use a todo list but constantly miss estimates
- Feel "busy but not productive"
- Want data about themselves, not just a pretty UI

---

## 2. Feature scope (v2)

### Must ship
1. Daily goal bar (streak, tasks done, focus time)
2. Persistent "Now tracking" bar
3. Segmented column switcher (replaces 3-column kanban on mobile)
4. One-tap timer start on task cards
5. Schedule view (drag tasks onto time slots)
6. Timeline view (planned vs actual bars)
7. Est vs Actual display on task cards
8. Pomodoro mode toggle (Free timer vs 25/5 vs 50/10)

### Deferred to v2.1
- Weekly pattern insights (AI-powered)
- Calendar sync (Google Calendar two-way)
- Team sharing

### Explicitly out of scope
- Native mobile apps (PWA only for v2)
- Subtask dependencies
- Recurring tasks (add in v2.1)
- Notifications (add in v2.1)

---

## 3. Information architecture

### Three primary views, one toggle

```
┌─────────────────────────────────────┐
│  Header: logo · date picker · bell  │
├─────────────────────────────────────┤
│  Daily goal bar (always visible)    │
├─────────────────────────────────────┤
│  Now tracking bar (if timer active) │
├─────────────────────────────────────┤
│  [ Board | Schedule | Timeline ]    │ ← segmented control
├─────────────────────────────────────┤
│                                     │
│         Active view                 │
│                                     │
├─────────────────────────────────────┤
│   Board · Stats · Settings          │ ← bottom nav
└─────────────────────────────────────┘
```

### Navigation rules
- Board, Schedule, Timeline are the three modes of the main work screen
- Stats and Settings are separate destinations
- Sign out moves to Settings (not header)
- Header becomes: compact logo, date picker, notifications

---

## 4. Feature 1 — Daily goal bar

### Purpose
Replace the cramped "1 tasks · 0% · 8s" status line with a momentum engine.

### Spec
- **Top row:** "Today's goal · 2 / 3 tasks" with a filled progress bar
- **Bottom row:** Streak counter + total focused time
- Always visible across Board, Schedule, Timeline views
- Tapping the bar opens a "Set today's goal" modal

### Behavior
- Default goal = 3 tasks (user-adjustable in Settings)
- Streak = consecutive days with at least 1 task completed
- Focus time = sum of `tracked_sessions.duration_seconds` for today
- Streak breaks at midnight local time if goal not met
- "Goal met" state: bar turns green with checkmark; streak +1 animation

### Data needed
- `users.daily_task_goal` (int, default 3)
- `users.current_streak` (int)
- `users.longest_streak` (int)
- `users.last_goal_met_date` (date)

---

## 5. Feature 2 — Persistent "Now tracking" bar

### Purpose
The timer should never be more than 1 tap away. This is the single biggest UX upgrade.

### Spec
- Appears below daily goal bar whenever `tracked_sessions` has a row with `ended_at IS NULL`
- Shows: task name · subtask name (if any) · live timer · pause button · stop button
- Purple fill (`#7F77DD`) to distinguish from everything else
- Tapping the bar jumps to the task detail view
- Pause and stop buttons don't require opening the task

### Behavior
- Timer increments every second via `setInterval` on client; persisted to DB every 30 seconds
- If user closes the app, timer keeps running based on `started_at` + current time
- Only one session can be active at a time — starting a new timer auto-stops the active one
- After stopping, a 2-second "Saved · 1h 24m" toast appears

### States
| State | Bar shows |
|---|---|
| No active session | Hidden |
| Running | Task name, elapsed time (mono), pause + stop |
| Paused | Task name, elapsed time (dimmed), resume + stop |

---

## 6. Feature 3 — Segmented column switcher

### Purpose
The 3-column kanban wastes mobile screen space. Switch to one full-width column at a time.

### Spec
- Three-segment control: "To do · N | In progress · N | Done · N"
- Active segment: purple fill, white text
- Inactive: transparent, muted text
- Tapping a segment filters the task list below
- Numbers update live as tasks move between states

### Behavior
- Default view: "In progress" if any tasks exist there, else "To do"
- Swipe left/right on the task list to switch columns (bonus)
- Long-press on a card reveals "Move to..." options
- Drag-and-drop still works on desktop / tablet
- Remember last-selected column per user (session storage)

### Copy rules
- Use sentence case: "To do" not "TO DO"
- Counts always visible: "To do · 3" not just "To do"
- Zero state per column: "No tasks yet · Tap + to add"

---

## 7. Feature 4 — One-tap timer start

### Purpose
Starting a timer currently requires: expand card → scroll → find Start button → tap. That's 3 taps too many.

### Spec
- Every task card in Board view has a 24×24 circular play button in the top-right
- Tap once → timer starts, card shows "● Tracking" indicator
- If another timer is running, show confirmation: "Stop 'Deep work' and start 'Outreach'?"
- Card in "Tracking" state gets a thin purple left border

### Visual
```
┌────────────────────────────────────┐
│ Deep work: KomalFi           [▶]  │
│ [HIGH] [Alainza]   Est 25m · 0s   │
└────────────────────────────────────┘
```

When tracking:
```
│┃Deep work: KomalFi           [⏸]  │
│┃[HIGH] [Alainza]   Est 25m · 12m  │
```

---

## 8. Feature 5 — Schedule view

### Purpose
Plan the day as time blocks. Drag tasks from the board onto specific slots. Calendar-style.

### Spec
- Vertical time grid, default 6 AM to 11 PM (user-configurable)
- Each hour is a row (42px min-height, expands if blocks overlap)
- Half-hour gridlines shown as dashed
- Red horizontal "NOW" line moves through the day, updates every minute
- Time blocks are colored rectangles with 3px colored left border matching the task tag
- Drag a task from the board onto a time slot to create a block
- Drag existing blocks to reschedule
- Resize blocks by dragging the bottom edge
- Tap a block to edit: task, start, duration, notes

### Block visual
```
┌────────────────────────────────┐
│┃Deep work: KomalFi            │ ← task title
│┃9:00 – 10:30                  │ ← planned time
└────────────────────────────────┘
```

### States
- **Future block (planned):** light fill, solid border, no timer
- **Current block (now inside it):** slightly brighter, shows "▶ Start" button if timer not running
- **Past block (not tracked):** dimmed, shows "Didn't track" label
- **Past block (tracked):** shows actual duration below planned

### Summary strip (above grid)
- "Planned: 6h 30m · Tracked: 2h 15m · On track ✓"
- Updates live as blocks are added/modified

### Rules
- Blocks can't overlap — dragging onto an occupied slot either snaps next to it or shifts others
- Blocks can span multiple hours (e.g., 9:00–11:30)
- Unplanned time is shown as empty white space
- Lunch, breaks = special "non-work" block type (gray, italic)

---

## 9. Feature 6 — Timeline view (planned vs actual)

### Purpose
The honest mirror. Show every planned block vs what actually happened.

### Spec

**Top — honest score card**
Three metrics in a row:
- **On plan %** — % of planned time that was actually tracked to that task
- **Saved** — net minutes finished under estimate (green)
- **Drifted** — net minutes over estimate or on unplanned work (amber/red)

**Middle — legend**
- Thin light bar = Planned
- Thick colored bar = Actual

**Main — per-task comparison**
For each task today (or selected date range):

```
Deep work: KomalFi                        ✓ On time
████████████████████████░░                ← planned (thin)
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░                ← actual (thick)
Planned 1h 30m · Actual 1h 26m
```

### Status badges
| Condition | Badge | Color |
|---|---|---|
| Actual within ±10% of planned | ✓ On time | Green |
| Actual > 110% of planned | +Xm over | Coral |
| Actual < 90% of planned | −Xm under | Green |
| Currently tracking | ● Tracking | Purple |
| Actual > 0 but no plan | Unplanned | Amber |
| Plan > 0, actual = 0 | Skipped | Red (struck-through task name) |

### Date range selector
- Today (default)
- Yesterday
- This week
- Last 7 days
- Custom range

### Export
- "Export CSV" button — generates `planned_vs_actual_YYYY-MM-DD.csv`

---

## 10. Feature 7 — Weekly pattern insights (deferred to v2.1, spec here for continuity)

### Purpose
Turn tracking data into actionable self-knowledge.

### Spec
After 7 days of tracking data, show insight cards:

- "You underestimate outreach tasks by ~20%. Try blocking 1h 15m next time."
- "Your most productive hour is 10 AM — 14% more focus time than your daily average."
- "You skip 30% of Friday afternoon blocks. Plan lighter or reschedule to mornings."

### How it works
1. Nightly cron aggregates last 7 days of `planned_blocks` + `tracked_sessions`
2. Calls Claude API with structured prompt: "Given this user's planned vs actual data, surface 1-3 specific, actionable patterns."
3. Insights stored in `user_insights` table with `generated_at` timestamp
4. Shown as dismissible cards on Timeline view top

### Claude API prompt skeleton
```
You are analyzing a user's time tracking data. Given the following planned-vs-actual data for the last 7 days, identify 1-3 specific patterns worth calling out.

Rules:
- Only surface patterns with at least 3 data points
- Each insight must be ONE sentence + one actionable suggestion
- Prefer specifics (task types, times of day) over generalities
- Ignore days with < 2 hours of tracked time

Data:
{json_dump_of_blocks_and_sessions}

Return JSON: { "insights": [{"title": "...", "suggestion": "..."}] }
```

---

## 11. Data model

### Schema (Supabase / PostgreSQL)

```sql
-- existing, extended
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  description text,
  column_state text check (column_state in ('todo', 'in_progress', 'done')) default 'todo',
  priority text check (priority in ('low', 'med', 'high')) default 'med',
  tag text,
  estimated_seconds int,  -- NEW: user's estimate
  order_index int,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks on delete cascade not null,
  title text not null,
  is_done boolean default false,
  order_index int
);

-- NEW: planned time blocks (what user intended)
create table planned_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  task_id uuid references tasks on delete cascade,
  subtask_id uuid references subtasks on delete set null,
  start_at timestamptz not null,
  duration_seconds int not null,
  block_type text check (block_type in ('work', 'break', 'lunch', 'meeting')) default 'work',
  notes text,
  created_at timestamptz default now()
);

-- NEW: tracked sessions (what actually happened)
create table tracked_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  task_id uuid references tasks on delete cascade,
  subtask_id uuid references subtasks on delete set null,
  planned_block_id uuid references planned_blocks on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds int,  -- computed on end, or live-computed client-side
  mode text check (mode in ('free', 'pomodoro_25_5', 'pomodoro_50_10')) default 'free',
  was_paused boolean default false,
  notes text
);

-- NEW: user settings + streak
create table user_profiles (
  user_id uuid references auth.users primary key,
  daily_task_goal int default 3,
  current_streak int default 0,
  longest_streak int default 0,
  last_goal_met_date date,
  work_day_start time default '09:00',
  work_day_end time default '18:00',
  pomodoro_work_minutes int default 25,
  pomodoro_break_minutes int default 5
);

-- NEW: AI insights (v2.1)
create table user_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  suggestion text not null,
  insight_type text,
  data_range_start date,
  data_range_end date,
  generated_at timestamptz default now(),
  dismissed_at timestamptz
);
```

### Key view: planned vs actual join

```sql
create view v_planned_vs_actual as
select
  pb.id as block_id,
  pb.user_id,
  pb.task_id,
  t.title as task_title,
  t.tag,
  pb.start_at as planned_start,
  pb.duration_seconds as planned_seconds,
  coalesce(sum(ts.duration_seconds), 0) as actual_seconds,
  count(ts.id) as session_count,
  case
    when coalesce(sum(ts.duration_seconds), 0) = 0 then 'skipped'
    when coalesce(sum(ts.duration_seconds), 0) between pb.duration_seconds * 0.9 and pb.duration_seconds * 1.1 then 'on_time'
    when coalesce(sum(ts.duration_seconds), 0) > pb.duration_seconds * 1.1 then 'over'
    else 'under'
  end as status
from planned_blocks pb
left join tasks t on t.id = pb.task_id
left join tracked_sessions ts on ts.planned_block_id = pb.id and ts.ended_at is not null
group by pb.id, t.title, t.tag;
```

### Unplanned sessions (tracked without a block)

```sql
create view v_unplanned_sessions as
select
  ts.*,
  t.title as task_title
from tracked_sessions ts
left join tasks t on t.id = ts.task_id
where ts.planned_block_id is null and ts.ended_at is not null;
```

---

## 12. API contracts

All endpoints authenticated via Supabase RLS; user_id filtered server-side.

### Planned blocks

```
GET    /api/blocks?date=2026-04-17
POST   /api/blocks                      { task_id, start_at, duration_seconds, block_type }
PATCH  /api/blocks/:id                  { start_at?, duration_seconds? }
DELETE /api/blocks/:id
```

### Tracked sessions

```
POST   /api/sessions/start              { task_id, subtask_id?, planned_block_id?, mode }
PATCH  /api/sessions/:id/pause
PATCH  /api/sessions/:id/resume
PATCH  /api/sessions/:id/stop
GET    /api/sessions/active             → returns current running session or null
GET    /api/sessions?date=2026-04-17
```

### Stats

```
GET    /api/stats/daily?date=2026-04-17
       → { planned_seconds, tracked_seconds, on_plan_percent, saved_seconds, drifted_seconds, streak }

GET    /api/stats/timeline?from=&to=
       → array of v_planned_vs_actual rows + unplanned sessions
```

### Goal

```
GET    /api/goal/today
PATCH  /api/goal/today                  { daily_task_goal }
```

---

## 13. Component architecture (Next.js + React)

```
src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx                 # includes <DailyGoalBar/> and <NowTrackingBar/>
│   │   ├── page.tsx                   # redirects to /board or last view
│   │   ├── board/page.tsx
│   │   ├── schedule/page.tsx
│   │   ├── timeline/page.tsx
│   │   ├── stats/page.tsx
│   │   └── settings/page.tsx
│   └── api/
│       ├── blocks/route.ts
│       ├── sessions/
│       │   ├── start/route.ts
│       │   ├── [id]/pause/route.ts
│       │   ├── [id]/stop/route.ts
│       │   └── active/route.ts
│       └── stats/
│           ├── daily/route.ts
│           └── timeline/route.ts
├── components/
│   ├── layout/
│   │   ├── DailyGoalBar.tsx
│   │   ├── NowTrackingBar.tsx
│   │   ├── ViewSwitcher.tsx
│   │   └── BottomNav.tsx
│   ├── board/
│   │   ├── ColumnSwitcher.tsx         # segmented 3-tab
│   │   ├── TaskCard.tsx               # with 1-tap play button
│   │   └── NewTaskSheet.tsx
│   ├── schedule/
│   │   ├── TimeGrid.tsx
│   │   ├── TimeBlock.tsx
│   │   ├── NowLine.tsx
│   │   ├── DragDropProvider.tsx       # dnd-kit wrapper
│   │   └── PlannedSummary.tsx
│   ├── timeline/
│   │   ├── HonestScoreCard.tsx
│   │   ├── PlannedVsActualBar.tsx
│   │   ├── DateRangePicker.tsx
│   │   └── InsightCard.tsx            # v2.1
│   └── shared/
│       ├── PriorityBadge.tsx
│       ├── TagPill.tsx
│       └── Timer.tsx                  # display only, takes elapsed seconds
├── hooks/
│   ├── useActiveSession.ts            # subscribes to session state
│   ├── useTimer.ts                    # interval + persist every 30s
│   ├── useTasks.ts
│   ├── useBlocks.ts
│   └── useDailyStats.ts
├── lib/
│   ├── supabase.ts
│   ├── time.ts                        # format duration, now line math
│   └── constants.ts                   # view start/end hours, colors
└── types/
    └── db.ts                          # Supabase generated types
```

### Key hook: useActiveSession

```ts
export function useActiveSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // subscribe to supabase realtime for the user's sessions
  // tick every second when session is running
  // persist duration every 30s via PATCH /sessions/:id

  const start = async (taskId: string, plannedBlockId?: string) => { ... };
  const pause = async () => { ... };
  const stop = async () => { ... };

  return { session, elapsed, start, pause, stop };
}
```

### Drag and drop
Use `@dnd-kit/core`. `TaskCard` is draggable, `TimeBlockSlot` is droppable. On drop, POST `/api/blocks` with start_at snapped to nearest 15min.

---

## 14. Build order & milestones

### Milestone 1 — Foundation (week 1)
- [ ] Schema migration (planned_blocks, tracked_sessions, user_profiles)
- [ ] Supabase RLS policies
- [ ] DailyGoalBar component (static data)
- [ ] NowTrackingBar component (static data)
- [ ] ColumnSwitcher replacing 3-column layout
- [ ] Move Sign out to Settings

### Milestone 2 — Live timer (week 2)
- [ ] useActiveSession hook with real DB
- [ ] One-tap play button on TaskCard
- [ ] Pause/resume/stop from NowTrackingBar
- [ ] "Saved · Xm" toast
- [ ] DailyGoalBar reads real stats

### Milestone 3 — Schedule view (week 3)
- [ ] TimeGrid with hour rows
- [ ] NowLine that ticks
- [ ] TimeBlock rendering with colors from task tag
- [ ] Drag from board onto grid → POST /blocks
- [ ] Drag existing blocks to reschedule
- [ ] PlannedSummary strip

### Milestone 4 — Timeline view (week 4)
- [ ] v_planned_vs_actual DB view
- [ ] HonestScoreCard component
- [ ] PlannedVsActualBar component
- [ ] Date range picker
- [ ] Skipped / unplanned / over / under status logic
- [ ] CSV export

### Milestone 5 — Polish (week 5)
- [ ] Pomodoro mode (timer auto-stops at 25m, break prompt)
- [ ] Swipe gestures between columns
- [ ] Est vs Actual on every card
- [ ] Empty states everywhere
- [ ] Keyboard shortcuts (desktop)

### Milestone 6 — Insights (v2.1)
- [ ] user_insights table + nightly cron
- [ ] Claude API integration for pattern generation
- [ ] InsightCard component on Timeline view

---

## 15. Design tokens

Match the existing mockup palette.

### Colors
```ts
export const colors = {
  // brand
  primary: '#7F77DD',       // purple
  primaryDark: '#534AB7',
  primaryLight: '#EEEDFE',
  bgPrimary: '#F4F2FB',     // soft purple-grey screen bg

  // semantic
  success: '#1D9E75',
  successLight: '#E1F5EE',
  warning: '#EF9F27',
  warningLight: '#FAEEDA',
  danger: '#E24B4A',
  dangerLight: '#FCEBEB',

  // tag colors (task.tag → color)
  tagAiAgency: '#7F77DD',
  tagAlainza: '#1D9E75',
  tagContent: '#D4537E',
  tagPersonal: '#EF9F27',
};
```

### Spacing
- Card padding: 10px 12px (mobile), 12px 16px (desktop)
- Card border-radius: 10px
- Vertical rhythm: 8px between cards, 16px between sections

### Typography
- Font: Inter (matches existing)
- Task title: 12px mobile, 14px desktop, weight 500
- Meta text: 9-10px, weight 400, text-secondary
- Timer: font-mono, 13-16px

---

## 16. Edge cases & rules

### Timer
- Only one active session at a time per user
- If app is closed mid-session, on reopen: compute elapsed from `started_at` + show "Still tracking?" toast
- If system clock is weird (backwards), fall back to `now() - started_at` as measured server-side
- Stop always required before switching tasks — no silent overlap

### Planned blocks
- Cannot overlap — on drop, if collision, shift subsequent blocks down by the overlap
- Cannot be created in the past (configurable)
- Multi-hour blocks are single rows spanning multiple grid cells
- Deleting a task does not delete its blocks by default — blocks become "orphaned" and render grey. User prompted: "Delete 3 scheduled blocks too?"

### Timeline
- "Skipped" only applies if block's end time is in the past AND no sessions attached
- "Tracking" status only for blocks where `now()` is between start_at and (start_at + duration_seconds)
- Unplanned sessions appear below planned tasks, grouped under "Off plan · 42m total"

### Streak logic
- Streak increments at end of day (23:59 local) if daily_task_goal met
- Streak resets to 0 if a day passes without meeting goal
- Grace day: user can mark "vacation" day in Settings — doesn't break streak but doesn't increment either

### Pomodoro mode
- Work interval ends → gentle sound (configurable), prompt: "Start break?"
- Break ends → prompt: "Start next pomodoro on same task?" with "Different task" option
- Pomodoro sessions are still tracked as `tracked_sessions` rows, just with `mode = 'pomodoro_25_5'`

### Empty states
- Board empty: "No tasks yet. Your day is a blank canvas. [+ Add first task]"
- Schedule empty: "Nothing planned yet. Drag tasks here or [+ Add block]"
- Timeline empty: "No data for this day. Start tracking to see your plan vs reality."

---

## 17. Open questions

1. **Overlapping blocks — shift or reject?**
   Current spec says shift. Alternative: show collision warning, require manual resolution. Pick one.

2. **Time zones**
   Store all timestamps as UTC, render in user's local time. What if user travels? Default: server-detected; override in Settings.

3. **Week start day**
   Monday vs Sunday. Default Monday; Settings override.

4. **What counts as "completion" for streak?**
   Moving a task to Done column, OR spending ≥ 15min tracked time on it? Current spec: Done column. Revisit after 2 weeks of usage.

5. **Should Pomodoro breaks auto-create "break" blocks on the schedule?**
   Probably yes — keeps planned vs actual honest. Flag for v2.1.

6. **Offline support**
   PWA with service worker + IndexedDB queue for mutations? Nice-to-have, not required for v2.

7. **Pricing**
   Free up to 30 tracked sessions/month? Pro at $5/mo for unlimited + insights + export? Model this after Toggl / Sunsama pricing.

---

## Appendix A — Screenshots

- See conversation for reference mockups:
  - Schedule view (left side of `getitdone_timeblock_planned_vs_actual`)
  - Timeline view (right side of `getitdone_timeblock_planned_vs_actual`)
  - Improved board view (`getitdone_improved_mockup`)

## Appendix B — Copy library

| Where | Current | New |
|---|---|---|
| Header | "Get-it-done · 1 tasks · 0% · 8s" | "Get-it-done" + separate goal bar |
| Column header | "TO DO", "IN PROGRESS", "DONE" | "To do · 3", "In progress · 1", "Done · 2" |
| Empty board | n/a | "No tasks yet. Your day is a blank canvas." |
| Timer button on card | (hidden in detail) | ▶ play icon, top-right |
| Now tracking | (none) | "Now tracking · {task} · {time}" |
| Timeline summary | (none) | "{%} on plan · {time} saved · {time} drifted" |
| Skipped block | (none) | "Didn't track · Reschedule?" |

---

**End of spec.**
