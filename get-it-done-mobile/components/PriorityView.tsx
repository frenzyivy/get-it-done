import { Fragment, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SegmentedButtons, useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';
import { TaskItem } from './TaskItem';
import { type as M3Type } from '@/lib/theme';
import type { Priority, TaskType } from '@/types';

// Phase 7 step B — Priority view on mobile. Mirrors the web spec § Change #5
// (three swimlanes Urgent / Med / Low — schema's 'high' folds into Med).
//
// Mobile uses the same SegmentedButtons pattern as KanbanView so the user
// only sees one lane at a time. The spec calls for the Urgent lane to be a
// black "current focus" card; on mobile that becomes a black header strip
// above the active lane when Urgent is selected.

type Lane = 'urgent' | 'med' | 'low';

interface Segment {
  id: Lane;
  label: string;
}

const SEGMENTS: Segment[] = [
  { id: 'urgent', label: 'Urgent' },
  { id: 'med', label: 'Med' },
  { id: 'low', label: 'Low' },
];

function laneOf(priority: Priority): Lane {
  if (priority === 'urgent') return 'urgent';
  if (priority === 'high' || priority === 'medium') return 'med';
  return 'low';
}

export function PriorityView() {
  const theme = useTheme();
  const c = theme.colors;
  const tasks = useStore((s) => s.tasks);

  const [laneId, setLaneId] = useState<Lane>('urgent');

  const counts = useMemo(
    () =>
      SEGMENTS.reduce<Record<Lane, number>>(
        (acc, s) => {
          acc[s.id] = tasks.filter(
            (t) => laneOf(t.priority) === s.id && t.effective_status !== 'done',
          ).length;
          return acc;
        },
        { urgent: 0, med: 0, low: 0 },
      ),
    [tasks],
  );

  const laneTasks = useMemo(() => {
    // Hide done tasks from the priority lanes — done tasks have no priority
    // signal value once completed. Within a lane, sort by progress (less-done
    // first) so the next-actionable items rise.
    return tasks
      .filter(
        (t) => laneOf(t.priority) === laneId && t.effective_status !== 'done',
      )
      .sort((a, b) => {
        const aProg = progressOf(a);
        const bProg = progressOf(b);
        if (aProg !== bProg) return aProg - bProg;
        return a.sort_order - b.sort_order;
      });
  }, [tasks, laneId]);

  const isUrgent = laneId === 'urgent';

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <SegmentedButtons
          value={laneId}
          onValueChange={(v) => setLaneId(v as Lane)}
          density="regular"
          buttons={SEGMENTS.map((s) => ({
            value: s.id,
            label: `${s.label} · ${counts[s.id]}`,
            showSelectedCheck: true,
          }))}
        />
      </View>

      {isUrgent && counts.urgent > 0 && (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 8,
            backgroundColor: '#1a1a2e',
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: 9,
              letterSpacing: 1.5,
              fontWeight: '700',
            }}
          >
            CURRENT FOCUS
          </Text>
          <Text
            style={{
              color: '#fff',
              fontSize: 13,
              fontWeight: '700',
              marginTop: 2,
            }}
          >
            {counts.urgent} urgent task{counts.urgent === 1 ? '' : 's'} need attention
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 120,
          gap: 12,
        }}
      >
        {laneTasks.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ ...M3Type.bodyMedium, color: c.onSurfaceVariant }}>
              {isUrgent ? 'No urgent tasks. Nice.' : 'Nothing here.'}
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
            {laneTasks.map((task, i) => (
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

function progressOf(task: TaskType): number {
  if (task.effective_status === 'done') return 100;
  if (task.subtasks.length === 0) return 0;
  const done = task.subtasks.filter((s) => s.is_done).length;
  return Math.round((done / task.subtasks.length) * 100);
}
