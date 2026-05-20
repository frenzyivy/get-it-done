'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { SignOutButton } from './SignOutButton';
import { RecurringTemplatesManager } from './RecurringTemplatesManager';
import type { FocusMode } from '@/types';

type UserPrefsDefaultMode = FocusMode;

const RULE_LABELS: Record<string, { label: string; desc: string }> = {
  due_soon: {
    label: 'Due soon reminder',
    desc: 'Notify me 24h before a task is due.',
  },
  overdue: {
    label: 'Overdue reminder',
    desc: 'Notify me once when a task passes its due date.',
  },
  overdue_escalate: {
    label: 'Auto-escalate overdue',
    desc: "Bump priority after 48h overdue. Won't touch urgent tasks.",
  },
  recurring: {
    label: 'Recurring tasks',
    desc: 'Auto-create tasks from recurring templates on schedule.',
  },
  stale_todo: {
    label: 'Stale to-do nudge',
    desc: 'Nudge me about tasks sitting in To Do for 7+ days.',
  },
  subtask_nudge: {
    label: 'Subtask nudge',
    desc: 'Nudge me about subtasks with no progress in 3+ days.',
  },
  completion_celebrate: {
    label: 'Celebrate completions',
    desc: 'Send a little win notification when I finish a task.',
  },
};

function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1">
        <div className="text-[14px] font-semibold text-[#1a1a2e]">{label}</div>
        {desc && <div className="text-[12px] text-[#888] mt-1">{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative w-11 h-6 rounded-full transition-colors shrink-0 mt-1 cursor-pointer"
        style={{ backgroundColor: checked ? '#1a1a2e' : '#d1d5db' }}
        aria-pressed={checked}
      >
        <span
          className="absolute top-[2px] w-5 h-5 rounded-full bg-white shadow-sm transition-all"
          style={{ left: checked ? 22 : 2 }}
        />
      </button>
    </div>
  );
}

export function Settings() {
  const prefs = useStore((s) => s.prefs);
  const rules = useStore((s) => s.rules);
  const userId = useStore((s) => s.userId);
  const tasks = useStore((s) => s.tasks);
  const fetchPrefs = useStore((s) => s.fetchPrefs);
  const fetchRules = useStore((s) => s.fetchRules);
  const updatePrefs = useStore((s) => s.updatePrefs);
  const toggleRule = useStore((s) => s.toggleRule);
  const openFocusLockPicker = useStore((s) => s.openFocusLockPicker);

  const handleStartFocus = () => {
    const today = new Date().toISOString().slice(0, 10);
    const pick =
      tasks.find((t) => t.planned_for_date === today && t.effective_status !== 'done') ??
      tasks.find((t) => t.effective_status === 'in_progress') ??
      tasks.find((t) => t.effective_status === 'todo');
    if (pick) openFocusLockPicker(pick.id);
  };

  useEffect(() => {
    if (!userId) return;
    void fetchPrefs();
    void fetchRules();
  }, [userId, fetchPrefs, fetchRules]);

  if (!prefs) {
    return (
      <div className="text-center py-20 text-[#aaa] text-sm">Loading settings…</div>
    );
  }

  return (
    <div
      className="min-h-screen px-4 py-6"
      style={{
        background: '#e8e8ea',
      }}
    >
      <div className="max-w-[720px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[26px] font-extrabold text-[#1a1a2e] tracking-[-0.5px]">
            Settings
          </h1>
          <Link
            href="/dashboard"
            className="text-xs text-[#888] hover:text-[#1a1a2e] font-semibold"
          >
            ← Back
          </Link>
        </div>

        <section className="bg-white rounded-[14px] p-5 mb-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
          <h2 className="text-[13px] font-extrabold text-[#1a1a2e] uppercase tracking-[0.5px] mb-2">
            Notifications
          </h2>
          <Toggle
            label="In-app notifications"
            desc="Show the 🔔 bell in the header with realtime updates."
            checked={prefs.notify_in_app}
            onChange={(v) => updatePrefs({ notify_in_app: v })}
          />
          <Toggle
            label="Push notifications"
            desc="Deliver to your mobile device when the app is closed. (Requires opening the mobile app at least once.)"
            checked={prefs.notify_push}
            onChange={(v) => updatePrefs({ notify_push: v })}
          />
          <Toggle
            label="Email notifications"
            desc="Email the same updates to your account address."
            checked={prefs.notify_email}
            onChange={(v) => updatePrefs({ notify_email: v })}
          />
          <TestNotificationButton />
        </section>

        <section className="bg-white rounded-[14px] p-5 mb-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
          <h2 className="text-[13px] font-extrabold text-[#1a1a2e] uppercase tracking-[0.5px] mb-2">
            Daily summary
          </h2>
          <Toggle
            label="Send me a morning briefing"
            desc="A Claude-written recap of yesterday + today's priorities."
            checked={prefs.daily_summary_enabled}
            onChange={(v) => updatePrefs({ daily_summary_enabled: v })}
          />
          {prefs.daily_summary_enabled && (
            <div className="flex items-center gap-3 pt-3 border-t border-[#eee] mt-3">
              <label className="text-[13px] text-[#555] flex-1">
                Deliver at (your local time)
              </label>
              <select
                value={prefs.daily_summary_hour}
                onChange={(e) => updatePrefs({ daily_summary_hour: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg border-[1.5px] border-[#e5e7eb] text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-3 pt-3 border-t border-[#eee] mt-3">
            <label className="text-[13px] text-[#555] flex-1">Timezone</label>
            <input
              value={prefs.timezone}
              onChange={(e) => updatePrefs({ timezone: e.target.value })}
              placeholder="e.g. Asia/Kolkata"
              className="px-3 py-2 rounded-lg border-[1.5px] border-[#e5e7eb] text-sm w-[180px]"
            />
          </div>
        </section>

        <section className="bg-white rounded-[14px] p-5 mb-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
          <h2 className="text-[13px] font-extrabold text-[#1a1a2e] uppercase tracking-[0.5px] mb-2">
            Automations
          </h2>
          {rules.length === 0 ? (
            <div className="text-[13px] text-[#888]">Loading rules…</div>
          ) : (
            rules
              .filter((r) => RULE_LABELS[r.rule_key])
              .map((r) => {
                const meta = RULE_LABELS[r.rule_key];
                return (
                  <Toggle
                    key={r.rule_key}
                    label={meta.label}
                    desc={meta.desc}
                    checked={r.is_enabled}
                    onChange={(v) => toggleRule(r.rule_key, v)}
                  />
                );
              })
          )}
        </section>

        <section className="bg-white rounded-[14px] p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
          <h2 className="text-[13px] font-extrabold text-[#1a1a2e] uppercase tracking-[0.5px] mb-2">
            AI suggestions
          </h2>
          <Toggle
            label="Auto-generate subtasks"
            desc="When I create a task, suggest subtasks automatically (still requires my approval)."
            checked={prefs.ai_auto_subtasks}
            onChange={(v) => updatePrefs({ ai_auto_subtasks: v })}
          />
          <Toggle
            label="Auto-suggest tags"
            desc="Match my task title against my existing tags."
            checked={prefs.ai_auto_tags}
            onChange={(v) => updatePrefs({ ai_auto_tags: v })}
          />
          <Toggle
            label="Auto-suggest priority"
            desc="Infer priority from task content."
            checked={prefs.ai_auto_priority}
            onChange={(v) => updatePrefs({ ai_auto_priority: v })}
          />
        </section>

        <section className="bg-white rounded-[14px] p-5 mb-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
          <h2 className="text-[13px] font-extrabold text-[#1a1a2e] uppercase tracking-[0.5px] mb-2">
            Focus sessions
          </h2>
          <div className="flex items-center justify-between py-3 border-b border-[#eee]">
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-[#1a1a2e]">
                Start a focus session
              </div>
              <div className="text-[12px] text-[#888] mt-1">
                {tasks.length === 0
                  ? 'Add a task first to start a focus session.'
                  : 'Pick a task, a lock level (Just track / Focus / No mercy), and a duration.'}
              </div>
            </div>
            <button
              onClick={handleStartFocus}
              disabled={tasks.length === 0}
              className="shrink-0 ml-3 px-4 py-2 rounded-lg bg-[#1a1a2e] text-white text-sm font-bold hover:bg-[#1a1a2e] disabled:opacity-50"
            >
              Start
            </button>
          </div>
          <Toggle
            label="Announce focus sessions"
            desc="Play a spoken cue when entering Call Focus, App Focus, or Strict Zone."
            checked={prefs.announce_focus_sessions ?? true}
            onChange={(v) => updatePrefs({ announce_focus_sessions: v })}
          />
          <div className="flex items-center justify-between py-2 border-t border-[#eee]">
            <div>
              <div className="text-[13px] font-bold text-[#1a1a2e]">
                Focus cue phrase
              </div>
              <div className="text-[11px] text-[#888]">
                Spoken when a focus mode starts. Default: &quot;You have a meeting&quot;.
              </div>
            </div>
            <input
              value={prefs.focus_announce_phrase ?? 'You have a meeting'}
              onChange={(e) => updatePrefs({ focus_announce_phrase: e.target.value })}
              className="border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-1 text-[13px] w-[220px]"
            />
          </div>
          <div className="flex items-center justify-between py-2 border-t border-[#eee]">
            <div>
              <div className="text-[13px] font-bold text-[#1a1a2e]">
                Default timer mode
              </div>
              <div className="text-[11px] text-[#888]">
                Mode applied when you start a timer from a task card.
              </div>
            </div>
            <select
              value={prefs.default_timer_mode ?? 'open'}
              onChange={(e) =>
                updatePrefs({
                  default_timer_mode: e.target.value as UserPrefsDefaultMode,
                })
              }
              className="border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-1 text-[13px]"
            >
              <option value="open">Open</option>
              <option value="call_focus">Call focus</option>
              <option value="app_focus">App focus</option>
              <option value="strict">Strict zone</option>
            </select>
          </div>
        </section>

        <section className="bg-white rounded-[14px] p-5 mb-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
          <h2 className="text-[13px] font-extrabold text-[#1a1a2e] uppercase tracking-[0.5px] mb-2">
            Workflow
          </h2>
          {/* Phase 1.1 — hide-completed default */}
          <Toggle
            label="Hide completed tasks by default"
            desc="Done tasks disappear from active boards. The toggle in the dashboard header reveals them dimmed with strikethrough."
            checked={prefs.hide_completed_default ?? true}
            onChange={(v) => updatePrefs({ hide_completed_default: v })}
          />
          {/* Phase 1.2 — warning threshold */}
          <div className="flex items-center justify-between py-3 border-t border-[#eee]">
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-[#1a1a2e]">
                Warn when no time logged
              </div>
              <div className="text-[12px] text-[#888] mt-1">
                Show an amber warning on in-progress tasks with no recent
                tracked time. Re-checked once a minute.
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 mt-1">
              <input
                type="number"
                min={1}
                max={120}
                value={prefs.warning_threshold_min ?? 20}
                onChange={(e) => {
                  const n = Math.min(120, Math.max(1, Number(e.target.value) || 20));
                  updatePrefs({ warning_threshold_min: n });
                }}
                className="border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-1 text-[13px] w-[68px] text-right"
              />
              <span className="text-[12px] text-[#666]">min</span>
            </div>
          </div>
          {/* Phase 1.3 — edits reset status */}
          <Toggle
            label="Reset task to To Do when edited"
            desc="If you rename or re-estimate an in-progress task, drop it back to To Do with an undo toast. Priority, due date, and tag changes never trigger reset."
            checked={prefs.edit_resets_status ?? true}
            onChange={(v) => updatePrefs({ edit_resets_status: v })}
          />
          {/* Phase 1.4 — stale-project threshold */}
          <div className="flex items-center justify-between py-3 border-t border-[#eee]">
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-[#1a1a2e]">
                Flag stale projects after
              </div>
              <div className="text-[12px] text-[#888] mt-1">
                Active projects with no tracked time for this many days show
                an amber nudge banner on the List view with Drop / Schedule /
                Archive shortcuts.
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 mt-1">
              <input
                type="number"
                min={1}
                max={90}
                value={prefs.stale_project_days ?? 7}
                onChange={(e) => {
                  const n = Math.min(90, Math.max(1, Number(e.target.value) || 7));
                  updatePrefs({ stale_project_days: n });
                }}
                className="border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-1 text-[13px] w-[68px] text-right"
              />
              <span className="text-[12px] text-[#666]">days</span>
            </div>
          </div>
          {/* Phase 5 — break block detection */}
          <Toggle
            label="Show break blocks on Timeline"
            desc="Auto-detect unrecorded gaps between tracked sessions and paint them as striped blocks. Click to label them."
            checked={prefs.show_break_blocks ?? true}
            onChange={(v) => updatePrefs({ show_break_blocks: v })}
          />
          <div className="flex items-center justify-between py-3 border-t border-[#eee]">
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-[#1a1a2e]">
                Ignore gaps shorter than
              </div>
              <div className="text-[12px] text-[#888] mt-1">
                Transition time between sessions doesn&apos;t count. Gaps
                below this threshold are hidden from the Timeline.
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 mt-1">
              <input
                type="number"
                min={1}
                max={30}
                value={prefs.break_min_gap_minutes ?? 5}
                onChange={(e) => {
                  const n = Math.min(30, Math.max(1, Number(e.target.value) || 5));
                  updatePrefs({ break_min_gap_minutes: n });
                }}
                className="border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-1 text-[13px] w-[68px] text-right"
              />
              <span className="text-[12px] text-[#666]">min</span>
            </div>
          </div>
        </section>

        {/* Phase 8 — Sticky timer */}
        <section className="bg-white rounded-[14px] p-5 mb-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
          <h2 className="text-[13px] font-extrabold text-[#1a1a2e] uppercase tracking-[0.5px] mb-2">
            Sticky timer
          </h2>
          <Toggle
            label="Show floating timer pill"
            desc="Pinned to a corner of the screen when a session is live. Visible on Insights, Settings, and any other page. Suppresses on the Dashboard where the Now Tracking banner already lives at the top."
            checked={prefs.sticky_timer_enabled ?? true}
            onChange={(v) => updatePrefs({ sticky_timer_enabled: v })}
          />
          {prefs.sticky_timer_enabled !== false && (
            <div className="flex items-center justify-between py-3 border-t border-[#eee]">
              <div className="flex-1">
                <div className="text-[14px] font-semibold text-[#1a1a2e]">
                  Pill position
                </div>
                <div className="text-[12px] text-[#888] mt-1">
                  Where the timer pill anchors on screen.
                </div>
              </div>
              <select
                value={prefs.sticky_timer_position ?? 'bottom_right'}
                onChange={(e) =>
                  updatePrefs({
                    sticky_timer_position: e.target.value as
                      | 'bottom_right'
                      | 'bottom_left'
                      | 'top_right'
                      | 'top_left',
                  })
                }
                className="border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-1 text-[13px] shrink-0 mt-1"
              >
                <option value="bottom_right">Bottom right</option>
                <option value="bottom_left">Bottom left</option>
                <option value="top_right">Top right</option>
                <option value="top_left">Top left</option>
              </select>
            </div>
          )}
          <div className="pt-3 border-t border-[#eee] mt-3 text-[12px] text-[#9ca3af] italic leading-[1.5]">
            For a true always-on-top widget (visible even when another app is
            focused), wrap Get-it-done with{' '}
            <a
              href="https://tauri.app"
              target="_blank"
              rel="noreferrer noopener"
              className="text-[#1a1a2e] underline"
            >
              Tauri
            </a>{' '}
            or Electron — the in-app pill only shows while the browser tab is
            focused.
          </div>
        </section>

        {/* Phase 9 — Presence detection */}
        <section className="bg-white rounded-[14px] p-5 mb-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
          <h2 className="text-[13px] font-extrabold text-[#1a1a2e] uppercase tracking-[0.5px] mb-2">
            Presence detection
          </h2>
          <Toggle
            label="Auto-detect when I'm away"
            desc="If you stop interacting with the app, pause the timer as a break. If you stay away longer, stop the timer entirely. Off by default."
            checked={prefs.presence_detection_enabled ?? false}
            onChange={(v) => updatePrefs({ presence_detection_enabled: v })}
          />
          {prefs.presence_detection_enabled && (
            <>
              <div
                className="mt-3 mb-3 p-3 rounded-lg text-[12px] leading-[1.5]"
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                }}
              >
                <b>Privacy:</b> Detection happens entirely on this device. No
                camera frames, screen content, or audio are stored or
                transmitted. Only timestamps of &quot;active&quot; /
                &quot;absent&quot; events are kept locally. Switch this off
                any time — derived state is deletable.
              </div>

              <div className="flex items-center justify-between py-3 border-t border-[#eee]">
                <div className="flex-1">
                  <div className="text-[14px] font-semibold text-[#1a1a2e]">
                    Detection method
                  </div>
                  <div className="text-[12px] text-[#888] mt-1">
                    How to tell whether you&apos;re at your desk.
                  </div>
                </div>
                <select
                  value={prefs.presence_method ?? 'mouse_keyboard'}
                  onChange={(e) =>
                    updatePrefs({
                      presence_method: e.target.value as
                        | 'mouse_keyboard'
                        | 'webcam'
                        | 'mobile_motion',
                    })
                  }
                  className="border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-1 text-[13px] shrink-0 mt-1"
                >
                  <option value="mouse_keyboard">
                    Mouse + keyboard (web)
                  </option>
                  <option value="webcam">
                    Webcam (on-device face detection)
                  </option>
                  <option value="mobile_motion">
                    Mobile motion (Expo app only)
                  </option>
                </select>
              </div>
              <div className="flex items-center justify-between py-3 border-t border-[#eee]">
                <div className="flex-1">
                  <div className="text-[14px] font-semibold text-[#1a1a2e]">
                    Mark as break after
                  </div>
                  <div className="text-[12px] text-[#888] mt-1">
                    Inactivity threshold to split the session and start a
                    break automatically.
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 mt-1">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={prefs.presence_break_after_min ?? 5}
                    onChange={(e) => {
                      const n = Math.min(
                        60,
                        Math.max(1, Number(e.target.value) || 5),
                      );
                      updatePrefs({ presence_break_after_min: n });
                    }}
                    className="border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-1 text-[13px] w-[68px] text-right"
                  />
                  <span className="text-[12px] text-[#666]">min</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-3 border-t border-[#eee]">
                <div className="flex-1">
                  <div className="text-[14px] font-semibold text-[#1a1a2e]">
                    Auto-stop after
                  </div>
                  <div className="text-[12px] text-[#888] mt-1">
                    Longer inactivity ends the timer completely.
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 mt-1">
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={prefs.presence_stop_after_min ?? 20}
                    onChange={(e) => {
                      const n = Math.min(
                        240,
                        Math.max(1, Number(e.target.value) || 20),
                      );
                      updatePrefs({ presence_stop_after_min: n });
                    }}
                    className="border-[1.5px] border-[#e5e7eb] rounded-lg px-2 py-1 text-[13px] w-[68px] text-right"
                  />
                  <span className="text-[12px] text-[#666]">min</span>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="bg-white rounded-[14px] p-5 mb-4 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
          <h2 className="text-[13px] font-extrabold text-[#1a1a2e] uppercase tracking-[0.5px] mb-2">
            Recurring templates
          </h2>
          <RecurringTemplatesManager />
        </section>

        <section className="bg-white rounded-[14px] p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
          <h2 className="text-[13px] font-extrabold text-[#1a1a2e] uppercase tracking-[0.5px] mb-3">
            Account
          </h2>
          <SignOutButton />
        </section>
      </div>
    </div>
  );
}

function TestNotificationButton() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const send = async () => {
    setStatus('sending');
    setMessage(null);
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      setStatus('sent');
      setMessage('Sent — watch the 🔔 bell. Push and email arrive on the next cron tick (within 2 min).');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to send');
    }
  };

  return (
    <div className="pt-3 border-t border-[#eee] mt-3">
      <button
        onClick={send}
        disabled={status === 'sending'}
        className="text-[13px] font-semibold text-[#1a1a2e] hover:underline disabled:opacity-50"
      >
        {status === 'sending' ? 'Sending…' : 'Send test notification'}
      </button>
      {message && (
        <p
          className={`mt-2 text-[12px] ${
            status === 'error' ? 'text-red-600' : 'text-[#6b7280]'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
