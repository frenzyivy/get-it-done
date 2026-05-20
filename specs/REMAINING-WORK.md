# Get-it-done — Remaining Upgrade Work

**Generated from audit on 2026-05-20. Source of truth for remaining Get-it-done upgrade work.**

Out of the 17 features in the original upgrade brief, 15 are fully shipped. Only two items remain — both are **enhancements** on top of features that already work end-to-end:

| # | Feature | Status | Phase |
|---|---|---|---|
| 7 | Search + **drag-from-results** | 🟡 PARTIAL | Phase 1 (quick wins) |
| 15 | Sticky desktop timer — **true always-on-top** + mobile widgets | 🟡 PARTIAL | Phase 7 |

There are also two minor schema deltas worth deciding on (see §3 below).

---

## 1. Feature 7 — Search + drag-from-results (P1, size S)

### What already exists (do not rebuild)

- Global task search input (`components/TaskSearchInput.tsx`) with 80 ms debounce, stored in the Zustand store and reflected in the URL.
- Search filter applied across **Board / List / Priority / Today / Matrix / Project list** views via `lib/matchers.ts::matchesSearch`.
- Unsorted-tray search + project filter on the Matrix view (this part is fully working).

### Delta still needed

The current search **filters tasks in place** inside each view. The brief asks for one additional affordance: the user can drag a result from the search dropdown into a target lane (Board column, Matrix quadrant, Today list, Priority swimlane) to set that task's state in one drop.

Concrete work:

1. **Searchable results panel** that opens beneath the global search input when the user types ≥ 1 character.
   - Show up to ~15 matches with title, priority pill, project chip, estimate.
   - Each row is `draggable="true"`.
   - Keyboard: ↑ / ↓ navigates, Enter opens the task drawer.
2. **Drag sources & drop targets**
   - Drag source: a result row.
   - Drop targets (already use `@dnd-kit`): Board columns (`status`), Matrix quadrants (`matrix_quadrant`), Today list (`planned_for_date = today` + `today_sequence`), Priority swimlanes (`priority`).
   - On drop, call the **existing** mutators in `lib/store.ts` (`updateTask`, `setMatrixQuadrant`, `addTaskToToday`, `reorderToday`). No new API endpoints needed.
3. **Visual affordance** in the search input header: a small `<span class="new-badge">Drag results to columns</span>` so the user knows the behaviour exists.
4. **Mobile**: skip — drag-from-results is desktop-only. On mobile, tapping a search result should open the task drawer (current behaviour).

### Acceptance

- ✅ Typing in the global search input opens a results panel.
- ✅ Dragging a result onto a Board column changes the task's status and the result disappears from the open panel.
- ✅ Dragging onto a Matrix quadrant sets `matrix_quadrant`.
- ✅ Dragging onto the Today list appends to today's sequence with the next available `today_sequence`.
- ✅ Search input shows a "Drag results to columns" badge so the affordance is discoverable.
- ✅ Existing in-place search filtering on each view remains unchanged.

---

## 2. Feature 15 — Sticky desktop timer: true always-on-top (P2, size M)

### What already exists (do not rebuild)

- `components/FloatingTimerPill.tsx` — in-browser fixed-position pill, 4 corners, minimize-to-pill, Esc toggle.
- `user_preferences` columns `sticky_timer_enabled` and `sticky_timer_position` (migration `0035_sticky_timer.sql`).
- Settings UI toggle for sticky timer.
- Suppressed on `/dashboard` to avoid duplication with the `NowTrackingBar`.
- Live timer integration via `useLiveTimers()`.

### Delta still needed

The current pill is **only visible while the Get-it-done browser tab is in the foreground**. The brief's Path B (recommended) asks for a real always-on-top OS window, plus mobile lock-screen equivalents. Three sub-tracks:

#### 2a. Desktop always-on-top shell

Choose between Tauri (recommended — Rust + web frontend, ~3 MB binary) and Electron.

- Wrap the existing Next.js app in the chosen shell.
- Spawn a second, **decorationless** window (~280 × 80 px) that renders the same React component as `FloatingTimerPill.tsx`, configured with:
  - `always_on_top: true`
  - `decorations: false`
  - `skip_taskbar: true`
  - draggable handle
- Both windows share state via the existing Zustand store (sync via Supabase Realtime — already wired for timers).
- Pause / stop buttons in the floating window call the same `pauseActiveTimer` / `stopActiveTimer` store actions.

#### 2b. Mobile lock-screen widgets

- **Android** (`get-it-done-mobile/`): Foreground `Service` + `AppWidget` showing active timer task + duration. Tap → opens app to that task.
- **iOS**: Live Activity via `ActivityKit` — appears in Dynamic Island and on the lock screen for the duration of the active session.
- Both push live updates from the existing `useLiveTimers()` source.

#### 2c. Settings additions

Already in `user_preferences`: `sticky_timer_enabled`, `sticky_timer_position`. **Add**:

- `sticky_timer_auto_hide BOOLEAN DEFAULT TRUE` — hide widget when no active timer.
- `lockscreen_widget_enabled BOOLEAN DEFAULT FALSE` — mobile-only toggle (no-op on web).

### Acceptance

- ✅ When a timer is active and the user is on another app, the desktop floating window is still visible on top of everything.
- ✅ Click pause / stop on the floating window controls the timer in the main app within 500 ms.
- ✅ Widget can be minimized to a tiny pill (just the time).
- ✅ Android lock-screen widget shows active task + duration; updates at least every 30 s.
- ✅ iOS Live Activity appears in Dynamic Island for the duration of a tracked session and clears when the session ends.
- ✅ Auto-hide toggle works: with no active timer, no surface is shown.

---

## 3. Schema delta (optional)

The `tracked_sessions` table is missing two columns that appear in the brief's `time_blocks` definition. The current code derives both via joins through `task_id`, so this is **only** a delta if you want denormalized reads:

- `tracked_sessions.category_id UUID NULL REFERENCES categories(id)`
- `tracked_sessions.project_id UUID NULL REFERENCES projects(id)`

**Recommendation:** leave as-is unless Insights / heatmap queries become slow. The join path already works.

If you decide to add them, the migration is one-line each plus a backfill from the task's category/project at session creation.

---

## 4. Ship order

| Order | Item | Why this order |
|---|---|---|
| 1 | Feature 7 (drag-from-results) | Pure UI, no new API, no schema. Quick win. |
| 2 | Feature 15a (desktop Tauri shell) | The biggest UX upgrade; needs its own dedicated chunk of time. |
| 3 | Feature 15b (mobile widgets) | Can be parallelized with 15a but lives in a different repo (`get-it-done-mobile`). |
| 4 | Schema delta (§3) | Only if §3 is actually decided to be needed — defer. |

---

## 5. Reference

- Visual reference: `specs/remaining-features-demo.html` (only the unbuilt parts).
- The 15 already-shipped features and the original brief are no longer needed — they have been superseded.
