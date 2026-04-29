import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PRIORITY_ORDER } from '@/lib/constants';
import { useStore } from '@/lib/store';
import { isToday } from '@/lib/utils';
import { TaskItem } from './TaskItem';
import { TODAY_COLORS, TODAY_FONT } from './today/palette';
import { TodayTopNav } from './today/TodayTopNav';
import { QuickAddInput } from './today/QuickAddInput';
import { NowHeroCard } from './today/NowHeroCard';
import { TodayShapeStrip } from './today/TodayShapeStrip';
import { SectionHeader, type SectionAccent } from './today/SectionHeader';
import type { TaskType } from '@/types';

interface Section {
  key: 'in_progress' | 'due_today' | 'up_next' | 'done';
  label: string;
  items: TaskType[];
  accent: SectionAccent;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ListView() {
  const tasks = useStore((s) => s.tasks);
  const activeSessions = useStore((s) => s.activeSessions);

  const hasActive = activeSessions.length > 0;

  const sections = useMemo<Section[]>(() => {
    const byPriority = (a: TaskType, b: TaskType) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];

    const inProgress = tasks
      .filter((t) => t.effective_status === 'in_progress')
      .sort(byPriority);
    const dueToday = tasks
      .filter(
        (t) =>
          t.effective_status !== 'in_progress' &&
          t.effective_status !== 'done' &&
          isToday(t.due_date),
      )
      .sort(byPriority);
    const upNext = tasks
      .filter(
        (t) =>
          t.effective_status !== 'done' &&
          t.effective_status !== 'in_progress' &&
          !isToday(t.due_date),
      )
      .sort(byPriority);
    const doneItems = tasks
      .filter(
        (t) =>
          t.effective_status === 'done' &&
          isToday(t.sessions[t.sessions.length - 1]?.started_at),
      )
      .sort(byPriority);

    return [
      {
        key: 'in_progress',
        label: 'In progress',
        items: inProgress,
        accent: 'default',
      },
      {
        key: 'due_today',
        label: 'Due today',
        items: dueToday,
        accent: 'default',
      },
      { key: 'up_next', label: '↑ Up next', items: upNext, accent: 'upnext' },
      {
        key: 'done',
        label: '✓ Done today',
        items: doneItems,
        accent: 'done',
      },
    ];
  }, [tasks]);

  const today = todayISO();

  // Cell 1 — Done counts. "Total today" = tasks planned for today OR due today,
  // excluding tasks already completed but not counted under Done today (i.e.
  // tasks completed on a prior day are irrelevant here).
  const totalToday = tasks.filter(
    (t) => t.planned_for_date === today || isToday(t.due_date),
  ).length;
  const completedToday = sections.find((s) => s.key === 'done')?.items.length ?? 0;

  // Cell 2 — Invested. Sum of every tracked session that started today.
  const investedSeconds = tasks
    .flatMap((t) => t.sessions)
    .filter((s) => isToday(s.started_at))
    .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const plannedSeconds =
    tasks
      .filter((t) => t.planned_for_date === today && t.effective_status !== 'done')
      .reduce((sum, t) => sum + (t.estimated_seconds ?? 0), 0) || 8 * 3600;

  // Cell 3 — Off-plan: sessions started today on tasks NOT in today's plan.
  const todayPlannedIds = new Set(
    tasks
      .filter((t) => t.planned_for_date === today)
      .map((t) => t.id),
  );
  const offPlanCount = tasks
    .flatMap((t) => t.sessions.map((s) => ({ task_id: t.id, started_at: s.started_at })))
    .filter((s) => isToday(s.started_at) && !todayPlannedIds.has(s.task_id))
    .length;

  return (
    <ScrollView
      style={{ backgroundColor: TODAY_COLORS.bg }}
      contentContainerStyle={{ paddingBottom: 140 }}
    >
      <TodayTopNav />
      <QuickAddInput />

      {hasActive && (
        <>
          <SectionHeader label="Now tracking" count={null} accent="live" />
          <NowHeroCard />
        </>
      )}

      <TodayShapeStrip
        completedToday={completedToday}
        totalToday={totalToday}
        investedSeconds={investedSeconds}
        plannedSeconds={plannedSeconds}
        offPlanCount={offPlanCount}
      />

      {sections.map((section) => {
        if (section.key === 'done' && section.items.length === 0) {
          return (
            <View key={section.key} style={{ marginTop: 6 }}>
              <SectionHeader
                label={section.label}
                count={0}
                accent={section.accent}
              />
              <View
                style={{
                  marginHorizontal: 20,
                  marginBottom: 18,
                  backgroundColor: TODAY_COLORS.card,
                  borderWidth: 1,
                  borderColor: TODAY_COLORS.border,
                  borderStyle: 'dashed',
                  borderRadius: 12,
                  paddingVertical: 18,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: TODAY_FONT.semibold,
                    fontSize: 13,
                    color: TODAY_COLORS.ink2,
                    marginBottom: 3,
                  }}
                >
                  Nothing done yet
                </Text>
                <Text
                  style={{
                    fontFamily: TODAY_FONT.medium,
                    fontSize: 11,
                    color: TODAY_COLORS.ink3,
                  }}
                >
                  Finish what&apos;s tracking to break the 0
                </Text>
              </View>
            </View>
          );
        }

        if (section.items.length === 0) return null;

        return (
          <View key={section.key} style={{ marginTop: 6 }}>
            <SectionHeader
              label={section.label}
              count={section.items.length}
              accent={section.accent}
            />
            {section.items.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}
