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
- Only one timer can run globally (keep existing constraint)
- **"Now Tracking" banner** shows `{Task name} → {Subtask name}` when a subtask is being tracked

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

## Suggested implementation order
1. **Feature 3** (edit) — highest daily friction; blocks every other workflow when something is mistyped
2. **2c** (task checkbox) — smallest, independent, quick UX win
3. **2a** (subtask timer) — schema migration + UI; foundational for 2b and Feature 1's richness
4. **2b** (invested time chip) — depends on 2a landing first for accurate totals
5. **Feature 1** (timeline viz) — largest; benefits from 2a's subtask-level data and Feature 3's edit drawer (reusable component)

---

## Assumptions (flag if any of these are wrong)
- Marking a parent task "done" does NOT auto-complete its subtasks
- Subtask-level time rolls up into the parent task's "time invested" total
- Timeline view defaults to today; existing date picker handles other days
- Only one active timer globally — starting a new one stops the current one
- "Planned" data source exists (from your Schedule view); if not, Feature 1's Planned track becomes a phase-2 addition

---

## Out of scope (but worth noting for later)
- Weekly / monthly timeline rollup views
- Export timeline as image for daily review / journaling
- Compare yesterday's planned vs actual alongside today's
- Subtask-level estimates (currently only task-level `Est 1h`)
