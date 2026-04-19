# Get-it-done — Feature Spec
**Scope:** Timeline visualization + Task/Subtask enhancements
**Target stack:** Next.js + Supabase (assumed from existing app)

---

## Feature 1 — Timeline Dashboard: Visual Day View

### Problem
The Timeline tab currently shows metrics (On Plan %, Saved, Drifted) and a flat list of Off-Plan items with durations. There's **no visual timeline** showing *when* during the day work happened, or planned vs actual distribution.

The empty-state message ("No data for this day. Start tracking to see your plan vs reality.") is also **misleading** — there IS data (41m of off-plan tracking in the screenshot), it's just not being visualized.

### Solution
Replace the empty chart area with a **Gantt-style horizontal timeline**.

**Layout:**
- **X-axis:** time of day
  - Auto-bounded: start 1 hr before first entry, end at current time (or last entry + 1 hr)
  - Minimum 8-hour window so the bar isn't cramped
  - Tick marks every hour
- **Two horizontal tracks:**
  - **Planned** (top, lighter): blocks from Schedule view for the selected day
  - **Actual** (bottom, solid): `time_entries` for the selected day
- **Color coding:**
  - Planned block uses task's tag color at low opacity
  - Actual block filled solid:
    - Green if it overlaps a matching planned block (on-plan)
    - Purple if off-plan / drifted
    - Red outline if actual ran past its planned end
- **Interaction:**
  - Hover/tap → tooltip with task name, subtask name (if any), start–end time, duration
  - Click a block → opens the task card in a side drawer

**Empty state:**
Only show "No data for this day" when BOTH planned and actual arrays are empty. If off-plan entries exist (like the 41m case), render them on the Actual track.

**Below the timeline:**
Keep the existing "Off Plan · 41m total" list — it's a useful chronological log. Make each row clickable so it highlights / scrolls-to the corresponding block on the timeline above.

### Data requirements
- `time_entries` for selected day, ordered by `started_at`
- `scheduled_blocks` (or equivalent planned data) for selected day
- Join with `tasks` + `subtasks` for display names and tag colors

### Acceptance criteria
- [ ] Days with tracked entries show a visual timeline, not the "No data" message
- [ ] Planned and Actual tracks are visually distinct
- [ ] Blocks are hoverable with full task/subtask details
- [ ] Off-Plan list below remains functional and cross-links to the timeline
- [ ] Mobile: horizontal scroll is acceptable; minimum block width 32px

---

## Feature 2 — Task & Subtask Improvements

Three independent sub-features. Recommend shipping in the order listed.

### 2a. Subtask-level timer tracking

#### Problem
Currently the timer can only start on a parent task. When work happens on a specific subtask, there's no way to associate time with it — granularity is lost.

#### Solution
- Add a **play/timer icon on every subtask row** (same styling as the parent task's timer icon)
- Clicking a subtask's timer starts tracking with:
  - `time_entries.task_id` = parent task id
  - `time_entries.subtask_id` = the subtask id
- Clicking the parent task's timer behaves as today: tracks at task level with `subtask_id = null` (for work that doesn't fit a specific subtask)
- **"Now Tracking" banner** shows `{Task name} → {Subtask name}` when a subtask is being tracked
- Concurrency behavior is defined in Feature 4 (multiple timers can run at once)

#### Schema change
```sql
alter table time_entries
  add column subtask_id uuid null references subtasks(id) on delete set null;

create index idx_time_entries_subtask_id on time_entries(subtask_id);
```
Nullable → preserves existing task-level entries.

#### Acceptance criteria
- [ ] Every subtask row has a visible timer icon
- [ ] Starting a subtask timer writes `subtask_id` correctly
- [ ] "Now Tracking" banner shows both task + subtask names
- [ ] Stopping the timer persists the entry with correct `subtask_id`
- [ ] Switching timers between task and subtask stops the previous one cleanly

---

### 2b. Task-level time investment display

#### Problem
You can't see total time invested in a task without mentally summing entries.

#### Solution
On each task card (Board / List view), show a **"Time invested" chip**:
- Format: `⏱ 1h 23m` (or `45m`, `12s` for shorter durations)
- Calculation: sum of `duration` across all `time_entries` where `task_id = task.id`
  - Includes both task-level (`subtask_id = null`) and subtask-level entries
- Placement: next to the existing `Est 1h` chip → reads as `Est 1h · Invested 23m`
- **Visual state:**
  - Normal: neutral gray
  - If `invested > estimate`: amber background
  - If `invested > 1.5× estimate`: red background

#### Acceptance criteria
- [ ] Every task card shows invested time (default `0m`)
- [ ] Value updates live while a timer for that task/subtask is running
- [ ] Calculation includes both task-level and subtask-level entries
- [ ] Over-estimate visual states render correctly

---

### 2c. Always-visible task completion checkbox

#### Problem
- Subtasks have a checkbox ✅
- But the **task-level checkbox disappears when there's 0 or 1 subtask**
- Can't mark the whole task done as a single action → inconsistent UX

#### Solution
- **Always render a checkbox** in front of the task title, regardless of subtask count
- Clicking it toggles `task.status` between `to_do`/`in_progress` ↔ `done`
- Marking a task as done does **NOT** auto-complete subtasks (intentional — some may have been skipped on purpose)
- If the task is marked done while subtasks are still incomplete, show a small warning icon on the card: `⚠ 2 subtasks not done` (tooltip on hover)
- **Drag-and-drop** between columns (To do → In progress → Done) should have the same effect as toggling the checkbox

#### Acceptance criteria
- [ ] Task checkbox is ALWAYS visible on every task card
- [ ] Clicking the checkbox toggles the task between Done and its previous column
- [ ] Subtasks retain their individual state when the task is marked done
- [ ] Warning badge shows when task is done with incomplete subtasks
- [ ] Drag-and-drop to Done column mirrors the checkbox behavior

---

## Feature 3 — Edit Tasks and Subtasks (any field, any time)

### Problem
Once a task or subtask is created, **none of its fields can be edited**. Forgot to add a tag? Wrong due date? Missed the estimate? → current workflow forces deleting and recreating from scratch. This is a significant daily friction point.

### Solution
Make **every field** on both tasks and subtasks editable post-creation, with two interaction patterns:

**Pattern A — Inline edit (for quick changes):**
- Click directly on a field chip (tag, due date, estimate, priority, assignee) → it becomes an editable control in place
- Click outside or press Enter → saves
- Press Esc → cancels
- Click on the task/subtask title → title becomes an inline text input

**Pattern B — Edit drawer (for full edits):**
- Click a pencil/edit icon on the task card (or right-click / long-press for context menu with Edit option)
- Opens a side drawer with all fields editable in one place:
  - Title
  - Description (if not already supported, add it)
  - Tag(s)
  - Due date
  - Estimate
  - Priority (High / Medium / Low)
  - Assignee
  - Subtasks list (reorder, rename, delete, add)
- Save / Cancel buttons at bottom
- Drawer is the same one that opens when clicking a timeline block (reuse component from Feature 1)

**Subtask editing:**
- Click subtask title → inline text edit
- Optional: give subtasks their own mini edit drawer if they have more than just a title (e.g., if you add subtask-level estimates later)
- Allow **deleting** subtasks (trash icon on hover)
- Allow **reordering** subtasks (drag handle)

### Edge cases
- **Editing estimate while a timer is running:** allow it — the new estimate just updates the "Est" display; doesn't affect already-logged time
- **Editing due date to a past date:** allow it, but show a subtle warning chip ("Overdue")
- **Renaming a task/subtask that has time entries:** time entries stay linked by ID, so historical timeline entries update to show the new name automatically (desired behavior)
- **Deleting a subtask that has time entries:** prompt "This subtask has 23m of tracked time. Delete anyway? Time entries will be kept but unlinked from the subtask." (set `subtask_id` to null, preserve the entry)

### Acceptance criteria
- [ ] Every visible field on a task card can be edited without deleting the task
- [ ] Inline edit works for tag, date, estimate, priority, assignee, title
- [ ] Edit drawer opens via pencil icon and exposes all fields including description and subtasks
- [ ] Subtask titles editable inline; subtasks can be renamed, reordered, and deleted
- [ ] Deleting a subtask with tracked time prompts and preserves time entries
- [ ] Changes save immediately (inline) or on Save click (drawer) with optimistic UI update
- [ ] Esc cancels inline edits without saving

---

## Feature 4 — Concurrent task tracking (two or more timers at once)

> **Interpretation note:** Reading your brief as *"I want to run two timers at the same time, and when they overlap the timeline should still look clean (not messy / doubled up in a bad way)."* If you actually meant "collapse both into one block" or something else, flag it — the spec below assumes **both entries stay visible in the timeline** but use smart lane-stacking so it doesn't look cluttered.

### Problem
Today only one timer can run at a time. Real work is rarely that linear — e.g., a lead-generation script runs in the background on one task while you're actively writing content for another. You need both to clock time independently.

### Solution — Tracker behavior
- **Allow multiple active timers** (default: unlimited; soft-warn after 3 active: "Tracking 3 tasks at once — are you sure?")
- Each active timer writes its own row to `time_entries` independently
- **"Now Tracking" banner becomes stackable:**
  - Single active timer → banner looks as it does today
  - 2+ active timers → banner becomes a compact vertical stack of cards, each with:
    - Task (→ subtask) name
    - Elapsed time
    - Individual Pause / Stop buttons
  - Each elapsed timer updates independently
- Starting a new timer **never** auto-stops existing ones (existing behavior changes: previously starting a new timer stopped the old one)
- Stopping one timer leaves the others running

### Solution — Timeline visualization (ties into Feature 1)
- The Actual track on the timeline uses **automatic lane-stacking**:
  - Non-overlapping entries → single lane (visually clean)
  - Overlapping entries → auto-expand into 2 (or more) horizontal sub-lanes just for the overlap window, then collapse back
  - Each sub-lane is half-height so the total Actual track height stays constant
- Overlap regions get a subtle visual cue (e.g., dotted vertical separator or a small "2×" badge) so it's immediately clear you were multi-tasking during that window
- Color still follows task/tag color per entry

### Schema change
No new tables needed — `time_entries` already supports multiple rows with overlapping `started_at` / `ended_at`. Changes are at the application state level:
- The "currently running timer" state should become an **array** of active timers, not a single object
- Ensure any UI that assumes one active timer (e.g., a global "stop all" action) is updated

### Edge cases
- **Marking a task done while its timer is running** → auto-stop that task's timer only; other timers keep running
- **Pausing one of several timers** → that timer's entry is saved/paused; others keep ticking
- **Page refresh / reconnect** → all active timers should restore their running state (timestamps in DB)
- **Timezone / clock drift** → use server-issued `started_at` timestamps, not client clock
- **Mobile** → "Now Tracking" stack collapses to a single-line summary "3 timers running · tap to expand"

### Acceptance criteria
- [ ] Starting a new timer while another is running does NOT stop the existing one
- [ ] The "Now Tracking" banner cleanly shows 1, 2, or 3+ active timers with individual controls
- [ ] Each timer's elapsed time updates independently
- [ ] Stopping one timer leaves others running; their entries save correctly
- [ ] Timeline Actual track auto-stacks overlapping entries into sub-lanes, single lane when no overlap
- [ ] Refreshing the page restores all running timers
- [ ] Marking a task done auto-stops only its own timer

---

## Feature 5 — Full-screen timer view with focus modes

### Problem
Clicking the clock icon today just starts a timer and shows a thin banner at the top of the board view. That keeps the rest of the app (and all your bookmarks / tabs / notifications) in full reach — too easy to drift. You want the clock icon to open a **dedicated full-screen "deep work" surface** with the task/subtask front and center, big timer display, big controls, and a selectable focus mode that gates distractions.

### Solution — Full-screen layout
Clicking the clock icon on any task or subtask opens a full-screen view with this layout (reference: your whiteboard sketch):

```
┌─────────────────────────────────────────┐
│                                         │
│         ┌──────────────────┐            │
│         │  Task / Subtask  │   ← pill at top, tappable
│         └──────────────────┘            │   to switch between active timers
│                                         │
│             11 : 05                     │   ← big time display, centered
│                                         │      (HH:MM format, or MM:SS < 1hr)
│           ⏸   ▶   ⏹                     │   ← 3 large controls
│                                         │
│                                         │
│       ┌──────────────────┐              │
│       │  Mode of Timer ▾  │   ← mode selector at bottom
│       └──────────────────┘              │
│                                         │
│                    [Minimize]           │   ← returns to board, timer continues
└─────────────────────────────────────────┘
```

**Interactions:**
- **Task/subtask pill** → tap to switch between active timers (if Feature 4 has multiple running)
- **Pause** → pauses this timer, stays in full-screen
- **Play** → resumes (disabled if already running)
- **Stop** → ends the timer and returns to board view
- **Minimize** → exits full-screen, timer continues, banner returns to board view
- **Mode of Timer** → opens the focus mode picker (see below)

### Solution — Timer Modes (focus levels)
Three modes, aligned with your whiteboard notes:

| Mode | Calls / Notifications | App / Tab switching | Use case |
|------|----------------------|---------------------|----------|
| **Open** | ✅ Allowed | ✅ Allowed | Light tracking, no restriction |
| **Call Focus** | 🚫 App notification sounds muted | ✅ Allowed | Quiet work, still need to research across apps |
| **App Focus** | ✅ Allowed | 🚫 Tab/app switching is flagged as drift | Deep focus on one task, but expecting a call |
| **Strict Zone** | 🚫 Muted | 🚫 Flagged as drift + confirmation to exit | Full deep work, no compromises |

**Web implementation notes** (since your app is web-based):
- Use the Fullscreen API (`element.requestFullscreen()`) for App Focus and Strict modes
- Use `document.visibilitychange` + `blur` events to detect tab/app switching
  - On detection in App Focus or Strict → log the switch as a **drift event** on the current time entry, show a banner when returning: "You drifted for 2m 14s — logged."
  - In Strict → additionally show a confirmation modal before allowing exit ("Are you sure? This will be recorded as a drift.")
- For notification muting: mute the app's own notification sounds; can't control OS/browser notifications, so make this clear in copy ("Your phone's calls still come through — enable Do Not Disturb on your phone for full silence").

### Solution — Sound cues (from whiteboard top-note: "Sound like = 'You have a meeting'")
- On entering a focus mode, optionally play a TTS or short audio cue: **"You have a meeting"** — frames the deep-work session as a self-meeting, raising the psychological stakes
- Toggle in settings: `Announce focus sessions` (default on) + option to customize the phrase
- **Alarm-allowed tasks**: add a per-task toggle `Allow alarms during focus` — if on, that task's scheduled alerts / reminders still ring even during Strict Zone (useful for things like "stop at 4pm for school pickup")

### Data model changes
Add to `tasks`:
```sql
alter table tasks add column allow_alarms boolean default false;
```

Add to `time_entries`:
```sql
alter table time_entries add column mode text default 'open'
  check (mode in ('open', 'call_focus', 'app_focus', 'strict'));
alter table time_entries add column drift_events jsonb default '[]';
-- drift_events: [{ started_at, ended_at, duration_seconds }]
```

Add to user settings (or a new `user_preferences` table if not already present):
```sql
announce_focus_sessions boolean default true
focus_announce_phrase text default 'You have a meeting'
default_timer_mode text default 'open'
```

### Edge cases
- **Multiple active timers (Feature 4) + full-screen**: full-screen shows one timer at a time; pill at top tappable to switch. Other timers keep running in background.
- **Starting a timer while in full-screen for another timer**: opens as a new background timer, pill shows "2 running — tap to switch"
- **Browser doesn't support Fullscreen API** (rare): degrade to a max-viewport overlay with the same UI; visibility detection still works
- **User force-closes browser during Strict mode**: on reload, show a "You left during a strict session — 12m drift logged" recap
- **Screen lock / idle**: after 10 min of no interaction with the full-screen, show a "still there?" ping; if no response in 1 min, pause the timer automatically
- **Mobile**: full-screen view is the default everywhere; minimize behaves as on desktop

### Acceptance criteria
- [ ] Clicking the clock icon on task or subtask opens a full-screen view (not just a banner)
- [ ] Full-screen shows task/subtask pill, large timer, pause/play/stop, mode selector
- [ ] Minimize returns to board view with timer still running
- [ ] Stop ends the timer and returns to board view
- [ ] All four timer modes selectable; mode is saved per time entry
- [ ] In App Focus and Strict, tab/app switching logs a drift event
- [ ] In Strict, exiting full-screen requires confirmation
- [ ] Voice cue plays on entering focus mode (respects settings toggle)
- [ ] Alarm-allowed tasks trigger alerts even during Strict mode
- [ ] Drift events visible on timeline (Feature 1) as small markers inside the actual block

---

## Noted for later (from whiteboard, not specced here)
- **Notepad feature for supported [tasks]** — mentioned at bottom of whiteboard sketch, out of scope for this round. Likely means: attach a notepad / scratchpad to each task for jotting during work sessions. Flag when you're ready to spec it.

---

## Suggested implementation order
1. **Feature 3** (edit) — highest daily friction; blocks every other workflow when something is mistyped
2. **2c** (task checkbox) — smallest, independent, quick UX win
3. **2a** (subtask timer) — schema migration + UI; foundational for 2b, Feature 1, Feature 4, and Feature 5
4. **Feature 4** (concurrent timers) — state-level change, depends on 2a being in place
5. **Feature 5** (full-screen timer + focus modes) — depends on 2a for task/subtask label, Feature 4 for multi-timer switcher
6. **2b** (invested time chip) — depends on 2a; naturally handles concurrent entries from Feature 4
7. **Feature 1** (timeline viz) — largest; benefits from 2a's subtask data, Feature 3's reusable edit drawer, Feature 4's lane-stacking, and Feature 5's drift events to plot
1. **Feature 3** (edit) — highest daily friction; blocks every other workflow when something is mistyped
2. **2c** (task checkbox) — smallest, independent, quick UX win
3. **2a** (subtask timer) — schema migration + UI; foundational for 2b, Feature 1, and Feature 4
4. **Feature 4** (concurrent timers) — state-level change, depends on 2a being in place
5. **2b** (invested time chip) — depends on 2a; naturally handles concurrent entries from Feature 4
6. **Feature 1** (timeline viz) — largest; benefits from 2a's subtask-level data, Feature 3's reusable edit drawer, and Feature 4's lane-stacking requirements

---

## Assumptions (flag if any of these are wrong)
- Marking a parent task "done" does NOT auto-complete its subtasks
- Subtask-level time rolls up into the parent task's "time invested" total
- Timeline view defaults to today; existing date picker handles other days
- "Planned" data source exists (from your Schedule view); if not, Feature 1's Planned track becomes a phase-2 addition

---

## Out of scope (but worth noting for later)
- Weekly / monthly timeline rollup views
- Export timeline as image for daily review / journaling
- Compare yesterday's planned vs actual alongside today's
- Subtask-level estimates (currently only task-level `Est 1h`)
