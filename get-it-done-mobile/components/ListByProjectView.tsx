import { Fragment, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SegmentedButtons, useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';
import { TaskItem } from './TaskItem';
import { type as M3Type } from '@/lib/theme';
import type { TaskType } from '@/types';

// Phase 7 step B — List by project view on mobile. Mirrors web § Change in
// the spec — group tasks by project (default), category, or flat. Sort modes
// match web: progress / recent / total_time / alpha.
//
// On mobile: collapsible sections, each headed by a project (or category)
// chip with task count + progress %. Tap the header to toggle expansion.
// Active project (one with a live session) gets a black header per spec §6.

type GroupBy = 'project' | 'category' | 'flat';
type SortBy = 'progress' | 'recent' | 'total_time' | 'alpha';

const GROUP_SEGMENTS: { id: GroupBy; label: string }[] = [
  { id: 'project', label: 'Project' },
  { id: 'category', label: 'Category' },
  { id: 'flat', label: 'Flat' },
];

const SORT_SEGMENTS: { id: SortBy; label: string }[] = [
  { id: 'progress', label: 'Progress' },
  { id: 'recent', label: 'Recent' },
  { id: 'total_time', label: 'Time' },
  { id: 'alpha', label: 'A–Z' },
];

interface Bucket {
  key: string;
  label: string;
  color: string;
  isActive: boolean;
  tasks: TaskType[];
}

export function ListByProjectView() {
  const theme = useTheme();
  const c = theme.colors;
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const categories = useStore((s) => s.categories);
  const activeSessions = useStore((s) => s.activeSessions);

  const [groupBy, setGroupBy] = useState<GroupBy>('project');
  const [sortBy, setSortBy] = useState<SortBy>('progress');
  // Set of bucket keys collapsed by the user. Default = all expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const activeProjectIds = useMemo(() => {
    const set = new Set<string>();
    for (const sess of activeSessions) {
      const t = tasks.find((x) => x.id === sess.task_id);
      if (!t) continue;
      for (const pid of t.project_ids) set.add(pid);
    }
    return set;
  }, [activeSessions, tasks]);

  const buckets = useMemo<Bucket[]>(() => {
    if (groupBy === 'flat') return [];
    const result: Bucket[] = [];
    const unassigned: TaskType[] = [];

    if (groupBy === 'project') {
      for (const p of projects) {
        const pTasks = tasks.filter((t) => t.project_ids.includes(p.id));
        if (pTasks.length === 0) continue;
        result.push({
          key: `proj:${p.id}`,
          label: p.name,
          color: p.color,
          isActive: activeProjectIds.has(p.id),
          tasks: pTasks,
        });
      }
      for (const t of tasks) {
        if (t.project_ids.length === 0) unassigned.push(t);
      }
    } else {
      // groupBy === 'category'
      for (const cat of categories) {
        const cTasks = tasks.filter((t) => t.category_ids.includes(cat.id));
        if (cTasks.length === 0) continue;
        result.push({
          key: `cat:${cat.id}`,
          label: cat.name,
          color: cat.color,
          isActive: false,
          tasks: cTasks,
        });
      }
      for (const t of tasks) {
        if (t.category_ids.length === 0) unassigned.push(t);
      }
    }

    result.sort((a, b) => compareBuckets(a, b, sortBy));

    if (unassigned.length > 0) {
      result.push({
        key: 'unassigned',
        label: 'Unassigned',
        color: '#9ca3af',
        isActive: false,
        tasks: unassigned,
      });
    }
    return result;
  }, [groupBy, tasks, projects, categories, activeProjectIds, sortBy]);

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Flat-mode sort — computed unconditionally to satisfy rules-of-hooks even
  // when not in flat mode (cheap; tasks list is small).
  const flat = useMemo(() => {
    const sorted = tasks.slice();
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'progress': {
          const ap = progressOfTasks([a]);
          const bp = progressOfTasks([b]);
          return bp - ap;
        }
        case 'total_time':
          return b.total_time_seconds - a.total_time_seconds;
        case 'recent':
          return maxStartedAt([b]) - maxStartedAt([a]);
        case 'alpha':
          return a.title.localeCompare(b.title);
      }
    });
    return sorted;
  }, [tasks, sortBy]);

  if (groupBy === 'flat') {
    return (
      <View style={{ flex: 1 }}>
        <Toolbar
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          sortBy={sortBy}
          setSortBy={setSortBy}
          showSort
        />
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 120,
            gap: 12,
          }}
        >
          {flat.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ ...M3Type.bodyMedium, color: c.onSurfaceVariant }}>
                No tasks.
              </Text>
            </View>
          ) : (
            <View
              style={{
                backgroundColor: c.elevation.level1,
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              {flat.map((task, i) => (
                <Fragment key={task.id}>
                  {i > 0 && (
                    <View style={{ height: 1, backgroundColor: c.outlineVariant }} />
                  )}
                  <TaskItem task={task} />
                </Fragment>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Toolbar
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        sortBy={sortBy}
        setSortBy={setSortBy}
        showSort
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 120,
          gap: 14,
        }}
      >
        {buckets.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ ...M3Type.bodyMedium, color: c.onSurfaceVariant }}>
              No tasks match.
            </Text>
          </View>
        ) : (
          buckets.map((b) => {
            const isCollapsed = collapsed.has(b.key);
            const progress = progressOfTasks(b.tasks);
            const totalSec = b.tasks.reduce((s, t) => s + t.total_time_seconds, 0);
            return (
              <View
                key={b.key}
                style={{
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: c.elevation.level1,
                }}
              >
                <Pressable
                  onPress={() => toggleCollapse(b.key)}
                  style={{
                    backgroundColor: b.isActive ? '#1a1a2e' : c.elevation.level1,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: b.color || '#9ca3af',
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: b.isActive ? '#fff' : c.onSurface,
                        fontSize: 13,
                        fontWeight: '700',
                      }}
                    >
                      {b.label}
                    </Text>
                    <Text
                      style={{
                        color: b.isActive ? 'rgba(255,255,255,0.6)' : c.onSurfaceVariant,
                        fontSize: 10,
                        marginTop: 1,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {b.tasks.length} task{b.tasks.length === 1 ? '' : 's'} ·{' '}
                      {progress}% · {fmtSecs(totalSec)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: b.isActive ? 'rgba(255,255,255,0.6)' : c.onSurfaceVariant,
                      fontSize: 14,
                    }}
                  >
                    {isCollapsed ? '▸' : '▾'}
                  </Text>
                </Pressable>
                {!isCollapsed &&
                  b.tasks.map((task, i) => (
                    <Fragment key={task.id}>
                      <View
                        style={{ height: 1, backgroundColor: c.outlineVariant }}
                      />
                      <TaskItem task={task} />
                    </Fragment>
                  ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function Toolbar({
  groupBy,
  setGroupBy,
  sortBy,
  setSortBy,
  showSort,
}: {
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
  showSort: boolean;
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 }}>
      <SegmentedButtons
        value={groupBy}
        onValueChange={(v) => setGroupBy(v as GroupBy)}
        density="regular"
        buttons={GROUP_SEGMENTS.map((s) => ({ value: s.id, label: s.label }))}
      />
      {showSort && (
        <SegmentedButtons
          value={sortBy}
          onValueChange={(v) => setSortBy(v as SortBy)}
          density="small"
          buttons={SORT_SEGMENTS.map((s) => ({ value: s.id, label: s.label }))}
        />
      )}
    </View>
  );
}

function compareBuckets(a: Bucket, b: Bucket, sortBy: SortBy): number {
  switch (sortBy) {
    case 'progress':
      return progressOfTasks(b.tasks) - progressOfTasks(a.tasks);
    case 'total_time': {
      const aT = a.tasks.reduce((s, t) => s + t.total_time_seconds, 0);
      const bT = b.tasks.reduce((s, t) => s + t.total_time_seconds, 0);
      return bT - aT;
    }
    case 'recent':
      return maxStartedAt(b.tasks) - maxStartedAt(a.tasks);
    case 'alpha':
      return a.label.localeCompare(b.label);
  }
}

function progressOfTasks(tasks: TaskType[]): number {
  if (tasks.length === 0) return 0;
  const total = tasks.reduce((sum, t) => {
    if (t.effective_status === 'done') return sum + 100;
    if (t.subtasks.length === 0) return sum;
    const done = t.subtasks.filter((s) => s.is_done).length;
    return sum + Math.round((done / t.subtasks.length) * 100);
  }, 0);
  return Math.round(total / tasks.length);
}

function maxStartedAt(tasks: TaskType[]): number {
  let max = 0;
  for (const t of tasks) {
    for (const s of t.sessions) {
      const ts = Date.parse(s.started_at);
      if (Number.isFinite(ts) && ts > max) max = ts;
    }
  }
  return max;
}

function fmtSecs(sec: number): string {
  if (sec <= 0) return '0m';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

