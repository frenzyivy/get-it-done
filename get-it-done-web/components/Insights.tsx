'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { DailyProgressTab } from './insights/DailyProgressTab';
import type {
  InsightsBucket,
  InsightsTagBucket,
  InsightsRange,
} from '@/types';

// Phase 6 step 18 — B&W reskin. Chrome and structure are strict black-on-grey
// per the redesign palette. Category/project tint accents (`tintFromHex`) keep
// the user-chosen hue because color is explicitly part of those data types
// (matches the redesigned Board view's CategoryPill / ProjectBadge usage).
const INK = '#1a1a2e';
const INK_SOFT = '#5b5674';
const INK_MUTE = '#9ca3af';
const LINE = '#e5e7eb';
const LINE_SOFT = '#f3f4f6';
const CARD = '#ffffff';
const PRIMARY = '#1a1a2e';      // black accent replaces purple
const PRIMARY_SOFT = '#f3f4f6'; // neutral soft replaces purple-soft
const PRIMARY_DEEP = '#1a1a2e'; // collapses to black

function fmtHM(secs: number): string {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// Boost HSL lightness to ~92% to derive a tint background from any hex.
function tintFromHex(hex: string, lightness = 92): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return LINE_SOFT;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  // RGB → HSL
  const rN = r / 255, gN = g / 255, bN = b / 255;
  const max = Math.max(rN, gN, bN), min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rN: h = ((gN - bN) / d + (gN < bN ? 6 : 0)); break;
      case gN: h = ((bN - rN) / d + 2); break;
      default: h = ((rN - gN) / d + 4);
    }
    h /= 6;
  }
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${lightness}%)`;
}

function formatDateLong(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function rangeSubtitle(
  range: InsightsRange,
  start: string | null,
  end: string,
  taskCount: number,
): string {
  const prefix =
    range === 'week' ? 'This week'
    : range === 'month' ? 'This month'
    : 'All time';
  if (!start) return `${prefix} · based on ${taskCount} tracked tasks`;
  const s = new Date(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const e = new Date(new Date(end).getTime() - 1000).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short',
  });
  return `${prefix} — ${s}–${e} · based on ${taskCount} tracked tasks`;
}

// -------- primitive bits --------

function BarRow({ bucket, max, totalForPct }: {
  bucket: InsightsBucket;
  max: number;
  totalForPct: number;
}) {
  const width = max > 0 ? Math.max(3, Math.round((bucket.total_seconds / max) * 100)) : 0;
  const pct = totalForPct > 0
    ? Math.round((bucket.total_seconds / totalForPct) * 100)
    : 0;
  return (
    <div className="grid items-center gap-3 py-2" style={{ gridTemplateColumns: '160px 1fr 80px' }}>
      <div className="text-[13px] font-semibold inline-flex items-center gap-2" style={{ color: INK }}>
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: bucket.color }}
        />
        <span className="truncate">{bucket.name}</span>
      </div>
      <div
        className="h-[22px] rounded-md overflow-hidden relative"
        style={{ background: LINE_SOFT }}
      >
        <div
          className="h-full rounded-md flex items-center justify-end px-2 text-white text-[11px] font-semibold transition-[width] duration-300"
          style={{ width: `${width}%`, background: bucket.color }}
        >
          {pct >= 6 ? `${pct}%` : ''}
        </div>
      </div>
      <div className="text-[12px] text-right tabular-nums" style={{ color: INK_SOFT }}>
        {fmtHM(bucket.total_seconds)}
      </div>
    </div>
  );
}

function Section({ title, sub, children }: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[14px] p-[22px_24px] mb-[18px]"
      style={{ background: CARD, border: `1px solid ${LINE}` }}
    >
      <div className="flex justify-between items-start mb-[18px]">
        <div>
          <div className="text-[15px] font-bold" style={{ color: INK }}>{title}</div>
          {sub && <div className="text-[12px] mt-[3px]" style={{ color: INK_MUTE }}>{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] py-4 text-center" style={{ color: INK_MUTE }}>
      {children}
    </div>
  );
}

function LegendNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] mt-3 px-3 py-[10px] rounded-lg leading-[1.6]"
      style={{ color: INK_MUTE, background: LINE_SOFT }}
    >
      {children}
    </div>
  );
}

// ---- Sections ------------------------------------------------------------

// Phase 7 — Honest Score hero card. Always-on, always shows "yesterday" by
// default. Pure-derived from planned_blocks + tracked_sessions on a single
// day (see /api/insights/honest-score). Sits at the very top of the "Where
// your time went" tab.
function HonestScoreCard() {
  const score = useStore((s) => s.honestScore);
  const loading = useStore((s) => s.honestScoreLoading);
  const err = useStore((s) => s.honestScoreError);
  const fetchHonestScore = useStore((s) => s.fetchHonestScore);
  const userId = useStore((s) => s.userId);

  useEffect(() => {
    if (!userId) return;
    void fetchHonestScore();
  }, [userId, fetchHonestScore]);

  if (err) {
    return (
      <div
        className="rounded-[14px] p-4 mb-4 text-[13px]"
        style={{
          background: '#fde8e8',
          color: '#991b1b',
          border: '1px solid #fca5a5',
        }}
      >
        Couldn’t load Honest Score: {err}
      </div>
    );
  }

  if (loading && !score) {
    return (
      <div
        className="rounded-[14px] p-5 mb-4 text-[13px]"
        style={{ background: PRIMARY, color: '#fff' }}
      >
        Computing Honest Score…
      </div>
    );
  }

  if (!score) return null;

  const planned = score.planned_seconds;
  const tracked = score.tracked_seconds;
  const offPlan = score.off_plan_seconds;
  const breakSec = score.break_seconds;
  const denomSec = Math.max(planned, tracked);
  const offPlanPct =
    denomSec > 0 ? Math.round((offPlan / denomSec) * 100) : 0;
  const breakPct =
    denomSec > 0 ? Math.round((breakSec / denomSec) * 100) : 0;

  const noData = denomSec === 0;

  // Big ring math — single arc representing honest_score_pct on a 100-unit
  // circle. Matches the demo's hero card.
  const R = 36;
  const C = 2 * Math.PI * R;
  const dashOffset = C * (1 - score.honest_score_pct / 100);

  const dateLabel = new Date(score.date + 'T12:00:00Z').toLocaleDateString(
    undefined,
    { weekday: 'long', month: 'short', day: 'numeric' },
  );

  return (
    <div
      className="rounded-[16px] p-5 mb-5 text-white"
      style={{
        background:
          'linear-gradient(110deg, #11142A 0%, #1A1F44 40%, #2A2350 60%, #15172E 100%)',
        boxShadow:
          '0 14px 36px -16px rgba(20, 14, 60, 0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[1.5px] opacity-60">
            Honest score · {dateLabel}
          </div>
          <div className="text-[20px] font-extrabold mt-[2px]">
            {noData
              ? 'No planned or tracked time'
              : `${score.honest_score_pct}% on plan`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!noData && (
            <svg viewBox="0 0 100 100" className="w-[68px] h-[68px]">
              <circle
                cx={50}
                cy={50}
                r={R}
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={6}
              />
              <circle
                cx={50}
                cy={50}
                r={R}
                fill="none"
                stroke="#fff"
                strokeWidth={6}
                strokeDasharray={C}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
              />
            </svg>
          )}
          <div className="text-right">
            <div className="text-[34px] font-extrabold tabular-nums leading-none">
              {noData ? '—' : `${score.honest_score_pct}%`}
            </div>
            <div className="text-[10px] opacity-60 uppercase tracking-[1px] mt-1">
              On plan
            </div>
          </div>
        </div>
      </div>

      {!noData && (
        <div className="text-[12px] opacity-85 leading-[1.5] mb-3">
          You planned <b>{fmtHM(planned)}</b>. You tracked{' '}
          <b>{fmtHM(tracked)}</b>. {offPlanPct}% off plan, {breakPct}% on
          breaks.
        </div>
      )}

      {!noData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-[6px] mt-2">
          <MiniStat label="Planned" value={fmtHM(planned)} />
          <MiniStat label="Tracked" value={fmtHM(tracked)} />
          <MiniStat label="Off plan" value={fmtHM(offPlan)} />
          <MiniStat label="Breaks" value={fmtHM(breakSec)} />
        </div>
      )}

      {score.manual_caveat && (
        <div
          className="rounded-[8px] mt-3 px-3 py-2 text-[11px] flex items-start gap-2"
          style={{ background: 'rgba(252,211,77,0.18)', color: '#fcd34d' }}
        >
          <span aria-hidden>⚠</span>
          <span>
            Score based on {score.manual_share_pct}% manual entries — verify
            with the auto-tracked baseline.
          </span>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[8px] px-3 py-2"
      style={{ background: 'rgba(255,255,255,0.06)' }}
    >
      <div className="text-[9px] font-mono uppercase tracking-[1px] opacity-55">
        {label}
      </div>
      <div className="text-[14px] font-extrabold tabular-nums mt-[2px]">
        {value}
      </div>
    </div>
  );
}

function Hero() {
  const range = useStore((s) => s.insightsRange);
  const setRange = useStore((s) => s.setInsightsRange);
  const payload = useStore((s) => s.insightsPayload);
  const subtitle = payload
    ? rangeSubtitle(payload.range, payload.range_start, payload.range_end, payload.summary.task_count)
    : 'Loading…';
  const ranges: { id: InsightsRange; label: string }[] = [
    { id: 'week', label: 'This week' },
    { id: 'month', label: 'This month' },
    { id: 'all', label: 'All time' },
  ];
  return (
    <div className="flex justify-between items-end mb-5 flex-wrap gap-3">
      <div>
        <div className="text-[28px] font-extrabold tracking-[-0.5px]" style={{ color: INK }}>
          Where your time went
        </div>
        <div className="text-[13px] mt-1" style={{ color: INK_MUTE }}>{subtitle}</div>
      </div>
      <div
        className="inline-flex rounded-[10px] p-[3px]"
        style={{ background: CARD, border: `1px solid ${LINE}` }}
      >
        {ranges.map((r) => {
          const active = range === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className="px-[14px] py-[6px] text-[12px] font-medium rounded-[7px] cursor-pointer transition-colors"
              style={{
                background: active ? PRIMARY : 'transparent',
                color: active ? '#fff' : INK_SOFT,
                border: 'none',
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, delta, valueColor }: {
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div
      className="rounded-[14px] p-[16px_18px]"
      style={{ background: CARD, border: `1px solid ${LINE}` }}
    >
      <div
        className="text-[11px] font-semibold mb-2 uppercase"
        style={{ letterSpacing: '1px', color: INK_MUTE }}
      >
        {label}
      </div>
      <div
        className="text-[24px] font-extrabold tracking-[-0.5px] truncate"
        style={{ color: valueColor ?? INK }}
      >
        {value}
      </div>
      {delta && (
        <div className="text-[11px] mt-1" style={{ color: INK_MUTE }}>
          {delta}
        </div>
      )}
    </div>
  );
}

function SummaryStats() {
  const payload = useStore((s) => s.insightsPayload);
  if (!payload) return null;
  const { summary, range } = payload;
  const { total_seconds, total_seconds_prev, top_category, top_category_pct, top_project, deepest_day } = summary;

  const deltaSec = total_seconds - total_seconds_prev;
  const prevLabel = range === 'week' ? 'vs last week' : range === 'month' ? 'vs last month' : '';
  const deltaColor = deltaSec > 0 ? '#16a34a' : deltaSec < 0 ? '#c53030' : INK_MUTE;
  const deltaEl = range !== 'all' && total_seconds_prev > 0 ? (
    <span style={{ color: deltaColor }}>
      {deltaSec >= 0 ? '▲' : '▼'} {fmtHM(Math.abs(deltaSec))} {prevLabel}
    </span>
  ) : null;

  return (
    <div
      className="grid gap-3 mb-6"
      style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
    >
      <StatCard label="Total tracked" value={fmtHM(total_seconds)} delta={deltaEl} />
      <StatCard
        label="Top category"
        value={top_category?.name ?? '—'}
        valueColor={top_category?.color}
        delta={top_category
          ? `${fmtHM(top_category.total_seconds)} · ${top_category_pct}% of time`
          : 'No categories tracked yet'}
      />
      <StatCard
        label="Top project"
        value={top_project?.name ?? '—'}
        valueColor={top_project?.color}
        delta={top_project
          ? `${fmtHM(top_project.total_seconds)} · ${top_project.task_count} ${top_project.task_count === 1 ? 'task' : 'tasks'}`
          : 'No projects tracked yet'}
      />
      <StatCard
        label="Deepest-work day"
        value={deepest_day ? formatDateLong(deepest_day.date) : '—'}
        delta={deepest_day ? `${fmtHM(deepest_day.total_seconds)} focused` : 'No sessions yet'}
      />
    </div>
  );
}

function TimeByCategorySection() {
  const payload = useStore((s) => s.insightsPayload);
  const buckets = payload?.categories ?? [];
  const max = buckets.reduce((m, b) => Math.max(m, b.total_seconds), 0);
  const total = payload?.summary.total_seconds ?? 0;
  return (
    <Section title="Time by Category" sub="What kind of work am I doing?">
      {buckets.length === 0 ? (
        <EmptyMsg>
          {payload?.missing_label_schema
            ? 'Categories aren’t set up yet — add them from the header.'
            : 'No tracked time tagged with categories in this range.'}
        </EmptyMsg>
      ) : (
        buckets.map((b) => (
          <BarRow key={b.id} bucket={b} max={max} totalForPct={total} />
        ))
      )}
    </Section>
  );
}

function TimeByProjectSection() {
  const payload = useStore((s) => s.insightsPayload);
  const buckets = (payload?.projects ?? []).filter(
    (p) => p.status !== 'archived' || p.total_seconds > 0,
  );
  const max = buckets.reduce((m, b) => Math.max(m, b.total_seconds), 0);
  const total = buckets.reduce((sum, b) => sum + b.total_seconds, 0);
  return (
    <Section title="Time by Project" sub="What thing am I building?">
      {buckets.length === 0 ? (
        <EmptyMsg>
          {payload?.missing_label_schema
            ? 'Projects aren’t set up yet — add them from the header.'
            : 'No tracked time tagged with projects in this range.'}
        </EmptyMsg>
      ) : (
        buckets.map((b) => (
          <BarRow key={b.id} bucket={b} max={max} totalForPct={total} />
        ))
      )}
    </Section>
  );
}

function DrilldownProjectSection() {
  const payload = useStore((s) => s.insightsPayload);
  const selectedId = useStore((s) => s.insightsSelectedProjectId);
  const setSelected = useStore((s) => s.setInsightsSelectedProject);

  const projects = payload?.projects ?? [];
  const active = projects.find((p) => p.id === selectedId) ?? projects[0];
  const categories = active ? payload?.categories_by_project[active.id] ?? [] : [];
  const tasks = active ? payload?.tasks_by_project[active.id] ?? [] : [];
  const max = categories.reduce((m, b) => Math.max(m, b.total_seconds), 0);
  const total = active?.total_seconds ?? 0;

  if (projects.length === 0) {
    return (
      <Section
        title="Drill-down — time on one project, broken down by category"
        sub="Pick a project to answer questions like “how much development did I do on Get-it-done?”"
      >
        <EmptyMsg>No projects with tracked time in this range.</EmptyMsg>
      </Section>
    );
  }

  return (
    <Section
      title="Drill-down — time on one project, broken down by category"
      sub="Pick a project to answer questions like “how much development did I do on Get-it-done?”"
    >
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-[12px] font-semibold" style={{ color: INK_MUTE }}>PROJECT:</span>
        <div className="inline-flex flex-wrap gap-[6px]">
          {projects.map((p) => {
            const isActive = p.id === (active?.id ?? null);
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className="text-[11px] font-semibold px-[10px] py-[5px] rounded-[7px] cursor-pointer transition-[opacity,border-color] duration-150"
                style={{
                  color: p.color,
                  background: tintFromHex(p.color),
                  border: `1.5px solid ${isActive ? p.color : 'transparent'}`,
                  opacity: isActive ? 1 : 0.55,
                }}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      {active && (
        <div
          className="rounded-[10px] px-4 py-[14px] mb-[14px] flex justify-between items-center"
          style={{ background: LINE_SOFT }}
        >
          <div className="text-[13px]" style={{ color: INK_SOFT }}>
            Time on <strong style={{ color: INK, fontWeight: 700 }}>{active.name}</strong>,
            {' '}across all categories
          </div>
          <div className="text-[20px] font-extrabold tracking-[-0.5px]" style={{ color: active.color }}>
            {fmtHM(total)}
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <EmptyMsg>This project has no category-tagged time in the range.</EmptyMsg>
      ) : (
        categories.map((c) => <BarRow key={c.id} bucket={c} max={max} totalForPct={total} />)
      )}

      {tasks.length > 0 && (
        <div className="mt-[18px]">
          <div
            className="grid text-[11px] font-semibold uppercase px-3 py-2"
            style={{
              gridTemplateColumns: '2fr 1fr 80px',
              color: INK_MUTE,
              letterSpacing: '0.8px',
              borderBottom: `1px solid ${LINE}`,
            }}
          >
            <span>Task</span>
            <span>Categories</span>
            <span className="text-right">Time</span>
          </div>
          {tasks.map((t, idx) => (
            <div
              key={t.id}
              className="grid items-center px-3 py-[10px]"
              style={{
                gridTemplateColumns: '2fr 1fr 80px',
                borderBottom: idx === tasks.length - 1 ? 'none' : `1px solid ${LINE_SOFT}`,
              }}
            >
              <div className="text-[13px] font-medium" style={{ color: INK }}>{t.title}</div>
              <div className="flex gap-[5px] flex-wrap">
                {t.categories.map((c) => (
                  <span
                    key={c.id}
                    className="text-[10px] font-bold px-[7px] py-[2px] rounded-[5px] inline-flex items-center gap-1"
                    style={{ color: c.color, background: tintFromHex(c.color) }}
                  >
                    <span
                      className="w-[5px] h-[5px] rounded-full"
                      style={{ background: c.color }}
                    />
                    {c.name}
                  </span>
                ))}
              </div>
              <div
                className="text-[12px] font-semibold text-right tabular-nums"
                style={{ color: INK_SOFT }}
              >
                {fmtHM(t.total_seconds)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function MatrixSection() {
  const rowsSel = useStore((s) => s.insightsPayload?.matrix.rows);
  const catsSel = useStore((s) => s.insightsPayload?.matrix.category_order);
  const tasksByProject = useStore(
    (s) => s.insightsPayload?.tasks_by_project ?? {},
  );
  const rows = useMemo(() => rowsSel ?? [], [rowsSel]);
  const cats = useMemo(() => catsSel ?? [], [catsSel]);
  const maxCell = useMemo(() => {
    let m = 0;
    for (const r of rows) for (const v of Object.values(r.cells)) if (v > m) m = v;
    return m;
  }, [rows]);

  // Phase 7 — click-through state. When set, the side sheet renders the
  // contributing tasks for that intersection. Data is derived from the
  // existing tasks_by_project map — no new endpoint needed.
  const [drilldown, setDrilldown] = useState<{
    projectId: string;
    categoryId: string;
  } | null>(null);

  if (rows.length === 0 || cats.length === 0) {
    return (
      <Section
        title="Category × Project matrix"
        sub="Every intersection at a glance — darker cells = more time spent"
      >
        <EmptyMsg>Need both categories and projects with tracked time to populate this view.</EmptyMsg>
      </Section>
    );
  }

  return (
    <Section
      title="Category × Project matrix"
      sub="Every intersection at a glance — darker cells = more time spent"
    >
      <div className="overflow-x-auto -mx-1 px-1 mt-[10px]">
        <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th
                className="text-left pl-[14px] py-[10px] font-bold uppercase"
                style={{
                  color: INK_SOFT, fontSize: '11px', letterSpacing: '0.5px',
                  borderBottom: `1px solid ${LINE}`,
                }}
              >
                Project ↓ / Category →
              </th>
              {cats.map((c) => (
                <th
                  key={c.id}
                  className="py-[10px] px-[8px] text-center font-bold uppercase"
                  style={{
                    color: c.color, fontSize: '11px', letterSpacing: '0.5px',
                    borderBottom: `1px solid ${LINE}`,
                  }}
                >
                  {c.name}
                </th>
              ))}
              <th
                className="py-[10px] px-[8px] text-center font-extrabold uppercase"
                style={{
                  color: INK, fontSize: '11px', letterSpacing: '0.5px',
                  borderBottom: `1px solid ${LINE}`,
                }}
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.project_id}>
                <td
                  className="text-left pl-[14px] py-[10px] font-semibold"
                  style={{ color: r.project_color, borderBottom: `1px solid ${LINE_SOFT}` }}
                >
                  {r.project_name}
                </td>
                {cats.map((c) => {
                  const v = r.cells[c.id] ?? 0;
                  const opacity = v > 0 && maxCell > 0 ? 0.05 + (v / maxCell) * 0.55 : 0;
                  // Phase 7 — cell-as-button. Empty cells stay non-interactive
                  // so the cursor doesn't suggest there's something to drill
                  // into. The full cell is clickable for a big target.
                  return (
                    <td
                      key={c.id}
                      className="p-0 relative"
                      style={{ borderBottom: `1px solid ${LINE_SOFT}` }}
                    >
                      {v > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setDrilldown({
                              projectId: r.project_id,
                              categoryId: c.id,
                            })
                          }
                          className="block w-full py-[10px] px-[8px] text-center tabular-nums relative cursor-pointer bg-transparent border-0 transition-colors hover:bg-[rgba(0,0,0,0.04)]"
                          style={{
                            color: INK,
                            fontWeight: 600,
                          }}
                          title={`${r.project_name} × ${c.name} — click for tasks`}
                          aria-label={`Drill into ${r.project_name} × ${c.name}`}
                        >
                          <span
                            className="absolute rounded-[5px] z-0 pointer-events-none"
                            style={{ inset: 4, background: PRIMARY, opacity }}
                          />
                          <span className="relative z-[1]">{fmtHM(v)}</span>
                        </button>
                      ) : (
                        <div
                          className="py-[10px] px-[8px] text-center tabular-nums"
                          style={{ color: INK_MUTE, fontWeight: 400 }}
                        >
                          —
                        </div>
                      )}
                    </td>
                  );
                })}
                <td
                  className="py-[10px] px-[8px] text-center tabular-nums"
                  style={{
                    color: INK, fontWeight: 800,
                    borderBottom: `1px solid ${LINE_SOFT}`,
                  }}
                >
                  {fmtHM(r.total_seconds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LegendNote>
        <strong>How to read this:</strong> Each cell is the time you spent on that{' '}
        <em>category</em>, for that <em>project</em>. Row totals will slightly exceed
        the sum of cells because a single task with multiple categories counts into
        each cell (intentional — you want a “dev + learning” task to count in both).
        Click any cell to see the tasks behind it.
      </LegendNote>

      {drilldown && (
        <MatrixCellDrilldown
          projectId={drilldown.projectId}
          categoryId={drilldown.categoryId}
          projectName={
            rows.find((r) => r.project_id === drilldown.projectId)
              ?.project_name ?? 'Project'
          }
          categoryName={
            cats.find((c) => c.id === drilldown.categoryId)?.name ?? 'Category'
          }
          categoryColor={
            cats.find((c) => c.id === drilldown.categoryId)?.color ?? INK
          }
          cellSeconds={
            rows.find((r) => r.project_id === drilldown.projectId)?.cells[
              drilldown.categoryId
            ] ?? 0
          }
          tasks={(tasksByProject[drilldown.projectId] ?? []).filter((t) =>
            t.categories.some((cat) => cat.id === drilldown.categoryId),
          )}
          onClose={() => setDrilldown(null)}
        />
      )}
    </Section>
  );
}

// Phase 7 — slide-in side sheet listing the tasks that fed a Matrix cell.
// Derived purely from the existing /api/insights payload — no extra fetch.
function MatrixCellDrilldown({
  projectId,
  categoryId,
  projectName,
  categoryName,
  categoryColor,
  cellSeconds,
  tasks,
  onClose,
}: {
  projectId: string;
  categoryId: string;
  projectName: string;
  categoryName: string;
  categoryColor: string;
  cellSeconds: number;
  tasks: import('@/types').InsightsTask[];
  onClose: () => void;
}) {
  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Silence unused — kept on the prop API for symmetry with the brief's
  // suggested REST shape (`GET /api/insights/cell?category=&project=`),
  // in case we want to fall back to a server endpoint later.
  void projectId;
  void categoryId;

  const max = tasks.reduce((m, t) => Math.max(m, t.total_seconds), 0);

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/30 animate-[fadeIn_0.15s_ease-out]"
      />
      <aside
        className="fixed top-0 right-0 z-50 h-screen w-full sm:w-[460px] bg-white shadow-[-8px_0_30px_rgba(0,0,0,0.12)] flex flex-col animate-[slideInRight_0.2s_ease-out]"
        role="dialog"
        aria-label={`${projectName} × ${categoryName} — contributing tasks`}
      >
        <div
          className="px-5 py-4 flex items-start justify-between"
          style={{ borderBottom: `1px solid ${LINE}` }}
        >
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[1px] text-[#9ca3af] mb-[2px]">
              Matrix cell · {tasks.length}{' '}
              {tasks.length === 1 ? 'task' : 'tasks'}
            </div>
            <div className="text-[15px] font-extrabold text-[#1a1a2e] flex items-center gap-2 flex-wrap">
              <span>{projectName}</span>
              <span className="text-[#9ca3af]">×</span>
              <span style={{ color: categoryColor }}>{categoryName}</span>
            </div>
            <div className="text-[12px] text-[#6b7280] mt-1">
              Total: <b className="text-[#1a1a2e]">{fmtHM(cellSeconds)}</b>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border-0 text-[#aaa] hover:text-[#1a1a2e] cursor-pointer text-xl leading-none p-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {tasks.length === 0 ? (
            <div className="text-center py-10 text-[#9ca3af] text-[13px]">
              No tasks in this cell for the current range.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {tasks
                .slice()
                .sort((a, b) => b.total_seconds - a.total_seconds)
                .map((t) => {
                  const w = max > 0 ? (t.total_seconds / max) * 100 : 0;
                  return (
                    <div
                      key={t.id}
                      className="py-2"
                      style={{
                        borderBottom: `1px solid ${LINE_SOFT}`,
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div
                          className="text-[13px] font-semibold text-[#1a1a2e] truncate flex-1"
                          title={t.title}
                        >
                          {t.title}
                        </div>
                        <div className="text-[12px] font-mono font-bold tabular-nums text-[#1a1a2e] shrink-0">
                          {fmtHM(t.total_seconds)}
                        </div>
                      </div>
                      <div
                        className="rounded-full h-[3px] mt-[6px] overflow-hidden"
                        style={{ background: LINE_SOFT }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(2, w)}%`,
                            background: categoryColor,
                          }}
                        />
                      </div>
                      {t.categories.length > 1 && (
                        <div className="text-[10px] text-[#9ca3af] mt-1">
                          also tagged:{' '}
                          {t.categories
                            .filter((c) => c.id !== categoryId)
                            .map((c) => c.name)
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function TagCloudSection() {
  const payload = useStore((s) => s.insightsPayload);
  const setSelectedTag = useStore((s) => s.setInsightsSelectedTag);
  const tags = payload?.tags ?? [];

  // Position-based sizing buckets.
  const sizeClassFor = (idx: number, len: number): string => {
    if (len === 0) return 'text-[13px]';
    const pos = idx / len;
    if (pos < 0.2) return 'text-[17px]';
    if (pos < 0.4) return 'text-[15px]';
    if (pos < 0.7) return 'text-[13px]';
    return 'text-[12px]';
  };

  return (
    <Section
      title="Tags — the long tail"
      sub="Free-form tags ranked by time. Size = hours. Click any tag to see tasks."
    >
      {tags.length === 0 ? (
        <EmptyMsg>No tagged tasks in this range.</EmptyMsg>
      ) : (
        <div className="flex flex-wrap gap-2 items-baseline py-1">
          {tags.map((t, idx) => (
            <TagChip
              key={t.id}
              tag={t}
              sizeClass={sizeClassFor(idx, tags.length)}
              onClick={() => setSelectedTag(t.id)}
            />
          ))}
        </div>
      )}
      <LegendNote>
        <strong>Why tags still matter:</strong> Categories tell you the <em>kind</em> of
        work, projects tell you <em>for whom/what</em>, but tags catch the cross-cutting
        stuff neither captures — <strong>#deep-work</strong> across everything,{' '}
        <strong>#blocked</strong> across everything. Use these when you want to ask
        questions like “how much time did I spend in deep focus this month?”
      </LegendNote>
    </Section>
  );
}

function TagChip({ tag, sizeClass, onClick, active }: {
  tag: InsightsTagBucket;
  sizeClass: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`${sizeClass} inline-flex items-baseline gap-2 px-3 py-[5px] rounded-lg font-semibold cursor-pointer transition-colors`}
      style={{
        background: active ? PRIMARY_SOFT : LINE_SOFT,
        color: active ? PRIMARY_DEEP : INK_SOFT,
        border: 'none',
        opacity: active === false ? 0.55 : 1,
      }}
    >
      <span>
        <span style={{ opacity: 0.5, marginRight: -2 }}>#</span>
        {tag.name}
      </span>
      <span className="text-[11px] font-medium" style={{ color: INK_MUTE }}>
        {fmtHM(tag.total_seconds)}
      </span>
    </button>
  );
}

function TagCategorySection() {
  const payload = useStore((s) => s.insightsPayload);
  const selectedId = useStore((s) => s.insightsSelectedTagId);
  const setSelected = useStore((s) => s.setInsightsSelectedTag);

  const tags = (payload?.tags ?? []).slice(0, 10);
  const active = (payload?.tags ?? []).find((t) => t.id === selectedId) ?? tags[0];
  const buckets = active ? payload?.categories_by_tag[active.id] ?? [] : [];
  const max = buckets.reduce((m, b) => Math.max(m, b.total_seconds), 0);
  const total = active?.total_seconds ?? 0;

  if (tags.length === 0) {
    return (
      <Section
        title="Double-filter: Tag × Category"
        sub="Example: when I do #deep-work, what kind of work is it?"
      >
        <EmptyMsg>Add some tags to tasks and track time on them to see this.</EmptyMsg>
      </Section>
    );
  }

  return (
    <Section
      title="Double-filter: Tag × Category"
      sub="Example: when I do #deep-work, what kind of work is it?"
    >
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-[12px] font-semibold" style={{ color: INK_MUTE }}>TAG:</span>
        <div className="inline-flex flex-wrap gap-[6px]">
          {tags.map((t) => (
            <TagChip
              key={t.id}
              tag={t}
              sizeClass="text-[13px]"
              onClick={() => setSelected(t.id)}
              active={active?.id === t.id}
            />
          ))}
        </div>
      </div>

      {active && (
        <div
          className="rounded-[10px] px-4 py-[14px] mb-[14px] flex justify-between items-center"
          style={{ background: LINE_SOFT }}
        >
          <div className="text-[13px]" style={{ color: INK_SOFT }}>
            Time tagged <strong style={{ color: INK, fontWeight: 700 }}>#{active.name}</strong>,
            {' '}broken down by category
          </div>
          <div className="text-[20px] font-extrabold tracking-[-0.5px]" style={{ color: PRIMARY_DEEP }}>
            {fmtHM(total)}
          </div>
        </div>
      )}

      {buckets.length === 0 ? (
        <EmptyMsg>Tasks with this tag aren’t tagged with any category yet.</EmptyMsg>
      ) : (
        buckets.map((b) => <BarRow key={b.id} bucket={b} max={max} totalForPct={total} />)
      )}
    </Section>
  );
}

// ---- Page shell ----------------------------------------------------------

type InsightsTabId = 'time' | 'daily' | 'matrix';

export function Insights() {
  const payload = useStore((s) => s.insightsPayload);
  const loading = useStore((s) => s.insightsLoading);
  const err = useStore((s) => s.insightsError);

  const hasAnyTime = (payload?.summary.total_seconds ?? 0) > 0;
  const firstLoad = loading && !payload;

  const [tab, setTab] = useState<InsightsTabId>('time');
  const TABS: { id: InsightsTabId; label: string }[] = [
    { id: 'time', label: 'Where your time went' },
    { id: 'daily', label: 'Daily progress' },
    { id: 'matrix', label: 'Category × Project matrix' },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#e8e8ea', color: INK, fontSize: '14px', lineHeight: 1.5 }}>
      <div className="max-w-[1120px] mx-auto px-8 pt-7 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/dashboard"
            className="text-[24px] font-extrabold tracking-[-0.5px] inline-flex items-center gap-[10px]"
            style={{ color: INK }}
          >
            <span style={{ color: INK }}>⚡</span> Get-it-done
          </Link>
          <div className="flex gap-2">
            <Link
              href="/dashboard"
              className="text-[13px] font-medium px-[14px] py-2 rounded-[10px]"
              style={{
                background: CARD,
                border: `1px solid ${LINE}`,
                color: INK,
              }}
            >
              ← Back to board
            </Link>
            <Link
              href="/settings"
              className="text-[13px] font-medium px-[14px] py-2 rounded-[10px]"
              style={{
                background: CARD,
                border: `1px solid ${LINE}`,
                color: INK,
              }}
            >
              Settings
            </Link>
          </div>
        </div>

        {/* Page nav */}
        <div
          className="inline-flex rounded-[12px] p-1 mb-6"
          style={{ background: CARD, border: `1px solid ${LINE}` }}
        >
          <Link
            href="/dashboard"
            className="px-[18px] py-2 text-[13px] font-medium rounded-[9px] inline-flex items-center gap-[6px]"
            style={{ color: INK_SOFT }}
          >
            ▤ Board
          </Link>
          <span
            className="px-[18px] py-2 text-[13px] font-medium rounded-[9px] inline-flex items-center gap-[6px]"
            style={{ background: PRIMARY, color: '#fff' }}
          >
            📊 Insights
          </span>
        </div>

        {/* Sub-tabs (Phase 4 step 11) */}
        <div
          className="inline-flex rounded-[12px] p-1 mb-5 flex-wrap"
          style={{ background: CARD, border: `1px solid ${LINE}` }}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-[14px] py-2 text-[12px] font-medium rounded-[9px] cursor-pointer border-0"
                style={{
                  background: active ? PRIMARY : 'transparent',
                  color: active ? '#fff' : INK_SOFT,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'time' && (
          <>
            <HonestScoreCard />
            <Hero />
          </>
        )}

        {err && (
          <div
            className="rounded-[12px] p-4 mb-4 text-[13px]"
            style={{ background: '#fde8e8', color: '#991b1b', border: '1px solid #fca5a5' }}
          >
            Couldn’t load insights: {err}
          </div>
        )}

        {payload?.missing_label_schema && (
          <div
            className="rounded-[12px] p-4 mb-4 text-[13px]"
            style={{ background: PRIMARY_SOFT, color: PRIMARY_DEEP, border: `1px solid ${LINE}` }}
          >
            Categories and projects aren’t set up in the database yet. Add them from the header
            on the board to start seeing category/project breakdowns here.
          </div>
        )}

        {tab === 'daily' ? (
          <DailyProgressTab />
        ) : firstLoad ? (
          <div
            className="rounded-[14px] p-8 text-center text-[13px]"
            style={{ background: CARD, border: `1px solid ${LINE}`, color: INK_MUTE }}
          >
            Loading your insights…
          </div>
        ) : !hasAnyTime ? (
          <div
            className="rounded-[14px] p-10 text-center"
            style={{ background: CARD, border: `1px solid ${LINE}` }}
          >
            <div className="text-[16px] font-bold mb-2" style={{ color: INK }}>
              No tracked time yet
            </div>
            <div className="text-[13px]" style={{ color: INK_MUTE }}>
              Track some time this week and this page will come alive.
            </div>
          </div>
        ) : tab === 'matrix' ? (
          <MatrixSection />
        ) : (
          <>
            <SummaryStats />

            <div
              className="grid gap-[18px]"
              style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
            >
              <TimeByCategorySection />
              <TimeByProjectSection />
            </div>

            <DrilldownProjectSection />
            <MatrixSection />
            <TagCloudSection />
            <TagCategorySection />
          </>
        )}
      </div>
    </div>
  );
}
