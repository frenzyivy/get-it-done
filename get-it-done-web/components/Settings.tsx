'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { SignOutButton } from './SignOutButton';

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
        style={{ backgroundColor: checked ? '#8b5cf6' : '#d1d5db' }}
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
  const fetchPrefs = useStore((s) => s.fetchPrefs);
  const fetchRules = useStore((s) => s.fetchRules);
  const updatePrefs = useStore((s) => s.updatePrefs);
  const toggleRule = useStore((s) => s.toggleRule);

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
        background: 'linear-gradient(145deg, #f8f7ff 0%, #f0f4ff 50%, #faf5ff 100%)',
      }}
    >
      <div className="max-w-[720px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[26px] font-extrabold text-[#1a1a2e] tracking-[-0.5px]">
            Settings
          </h1>
          <Link
            href="/dashboard"
            className="text-xs text-[#888] hover:text-[#8b5cf6] font-semibold"
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
