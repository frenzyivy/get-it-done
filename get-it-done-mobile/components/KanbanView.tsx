import { Fragment, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SegmentedButtons, useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';
import { PRIORITY_ORDER } from '@/lib/constants';
import { TaskItem } from './TaskItem';
import { type as M3Type } from '@/lib/theme';
import type { Status, TaskType } from '@/types';

const SEGMENTS: { id: Status; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'Doing' },
  { id: 'done', label: 'Done' },
];

export function KanbanView() {
  const theme = useTheme();
  const c = theme.colors;
  const [colId, setColId] = useState<Status>('todo');
  const tasks = useStore((s) => s.tasks);

  const counts = useMemo(
    () =>
      SEGMENTS.reduce<Record<Status, number>>(
        (acc, s) => {
          acc[s.id] = tasks.filter((t) => t.status === s.id).length;
          return acc;
        },
        { todo: 0, in_progress: 0, done: 0 },
      ),
    [tasks],
  );

  const colTasks = useMemo(() => {
    const byPriority = (a: TaskType, b: TaskType) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    return tasks.filter((t) => t.status === colId).sort(byPriority);
  }, [tasks, colId]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <SegmentedButtons
          value={colId}
          onValueChange={(v) => setColId(v as Status)}
          density="regular"
          buttons={SEGMENTS.map((s) => ({
            value: s.id,
            label: `${s.label} · ${counts[s.id]}`,
            showSelectedCheck: true,
          }))}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 120,
          gap: 12,
        }}
      >
        {colTasks.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ ...M3Type.bodyMedium, color: c.onSurfaceVariant }}>
              Nothing here.
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
            {colTasks.map((task, i) => (
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
