import { Fragment, useState, useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from 'react-native-paper';
import { PRIORITY_ORDER } from '@/lib/constants';
import { useStore } from '@/lib/store';
import { isToday } from '@/lib/utils';
import { useUI } from '@/lib/ui-context';
import { TaskItem } from './TaskItem';
import { TodayCard } from './TodayCard';
import { type as M3Type } from '@/lib/theme';
import type { TaskType } from '@/types';

const DONE_COLLAPSED_COUNT = 5;

interface Section {
  key: string;
  label: string;
  items: TaskType[];
}

function SectionBlock({
  section,
  collapsible,
}: {
  section: Section;
  collapsible?: boolean;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const [expanded, setExpanded] = useState(false);
  if (section.items.length === 0) return null;

  const isDoneSection = section.key === 'done';
  const showToggle =
    collapsible && isDoneSection && section.items.length > DONE_COLLAPSED_COUNT;
  const visibleItems =
    showToggle && !expanded
      ? section.items.slice(0, DONE_COLLAPSED_COUNT)
      : section.items;
  const hiddenCount = section.items.length - visibleItems.length;

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 4,
        }}
      >
        <Text style={{ ...M3Type.labelLarge, color: c.onSurfaceVariant }}>
          {section.label}
        </Text>
        <Text
          style={{
            ...M3Type.labelMedium,
            color: c.onSurfaceVariant,
            fontVariant: ['tabular-nums'],
          }}
        >
          {section.items.length}
        </Text>
      </View>

      <View
        style={{
          backgroundColor: c.elevation.level1,
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        {visibleItems.map((task, i) => (
          <Fragment key={task.id}>
            {i > 0 && (
              <View style={{ height: 1, backgroundColor: c.outlineVariant }} />
            )}
            <TaskItem task={task} />
          </Fragment>
        ))}

        {showToggle && (
          <>
            <View style={{ height: 1, backgroundColor: c.outlineVariant }} />
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                paddingVertical: 12,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: pressed ? c.elevation.level2 : 'transparent',
              })}
            >
              <MaterialCommunityIcons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={c.primary}
              />
              <Text style={{ ...M3Type.labelLarge, color: c.primary }}>
                {expanded ? 'Show less' : `Show ${hiddenCount} more`}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

export function ListView() {
  const theme = useTheme();
  const c = theme.colors;
  const tasks = useStore((s) => s.tasks);
  const { openAddTask } = useUI();

  const sections = useMemo<Section[]>(() => {
    const byPriority = (a: TaskType, b: TaskType) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];

    const inProgress = tasks.filter((t) => t.status === 'in_progress').sort(byPriority);
    const dueToday = tasks
      .filter(
        (t) =>
          t.status !== 'in_progress' &&
          t.status !== 'done' &&
          isToday(t.due_date),
      )
      .sort(byPriority);
    const upNext = tasks
      .filter(
        (t) =>
          t.status !== 'done' &&
          t.status !== 'in_progress' &&
          !isToday(t.due_date),
      )
      .sort(byPriority);
    const done = tasks.filter((t) => t.status === 'done');

    return [
      { key: 'in_progress', label: 'In progress', items: inProgress },
      { key: 'due_today', label: 'Due today', items: dueToday },
      { key: 'up_next', label: 'Up next', items: upNext },
      { key: 'done', label: 'Done', items: done },
    ];
  }, [tasks]);

  const hasAny = sections.some((s) => s.items.length > 0);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: 120,
        gap: 20,
      }}
    >
      <TodayCard />

      <Pressable
        onPress={() => openAddTask('todo')}
        accessibilityRole="button"
        accessibilityLabel="Quick add a new task"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 14,
          backgroundColor: pressed ? c.elevation.level2 : c.elevation.level1,
          borderWidth: 1,
          borderColor: c.outlineVariant,
        })}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: c.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name="plus" size={18} color={c.onPrimary} />
        </View>
        <Text style={{ ...M3Type.bodyLarge, color: c.onSurface }}>
          Add a task
        </Text>
      </Pressable>

      {!hasAny && (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Text style={{ ...M3Type.bodyMedium, color: c.onSurfaceVariant }}>
            No tasks yet. Create one below!
          </Text>
        </View>
      )}

      {sections.map((section) => (
        <SectionBlock key={section.key} section={section} collapsible />
      ))}
    </ScrollView>
  );
}
