'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import type {
  InsightsBucket,
  InsightsTagBucket,
  InsightsRange,
} from '@/types';

// Match the visual reference: lightweight palette, no chart library.
const INK = '#1a1730';
const INK_SOFT = '#5b5674';
const INK_MUTE = '#8e89a8';
const LINE = '#ece9f7';
const LINE_SOFT = '#f2f0fa';
const CARD = '#ffffff';
const PRIMARY = '#7c5cff';
const PRIMARY_SOFT = '#efeaff';
const PRIMARY_DEEP = '#5a3fd8';

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
  const rows = useMemo(() => rowsSel ?? [], [rowsSel]);
  const cats = useMemo(() => catsSel ?? [], [catsSel]);
  const maxCell = useMemo(() => {
    let m = 0;
    for (const r of rows) for (const v of Object.values(r.cells)) if (v > m) m = v;
    return m;
  }, [rows]);

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
                  return (
                    <td
                      key={c.id}
                      className="py-[10px] px-[8px] text-center tabular-nums relative"
                      style={{
                        color: v > 0 ? INK : INK_MUTE,
                        fontWeight: v > 0 ? 600 : 400,
                        borderBottom: `1px solid ${LINE_SOFT}`,
                      }}
                    >
                      {v > 0 && (
                        <span
                          className="absolute rounded-[5px] z-0"
                          style={{ inset: 4, background: PRIMARY, opacity }}
                        />
                      )}
                      <span className="relative z-[1]">
                        {v > 0 ? fmtHM(v) : '—'}
                      </span>
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
      </LegendNote>
    </Section>
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

export function Insights() {
  const payload = useStore((s) => s.insightsPayload);
  const loading = useStore((s) => s.insightsLoading);
  const err = useStore((s) => s.insightsError);

  const hasAnyTime = (payload?.summary.total_seconds ?? 0) > 0;
  const firstLoad = loading && !payload;

  return (
    <div className="min-h-screen" style={{ background: '#f6f5ff', color: INK, fontSize: '14px', lineHeight: 1.5 }}>
      <div className="max-w-[1120px] mx-auto px-8 pt-7 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/dashboard"
            className="text-[24px] font-extrabold tracking-[-0.5px] inline-flex items-center gap-[10px]"
            style={{ color: INK }}
          >
            <span style={{ color: '#f59e0b' }}>⚡</span> Get-it-done
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

        <Hero />

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
            style={{ background: PRIMARY_SOFT, color: PRIMARY_DEEP, border: `1px solid #d5cafe` }}
          >
            Categories and projects aren’t set up in the database yet. Add them from the header
            on the board to start seeing category/project breakdowns here.
          </div>
        )}

        {firstLoad ? (
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
