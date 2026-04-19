import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import {
  fmtShort,
  fmtDueDate,
  getProgress,
  isOverdue,
  todayISO,
  tomorrowISO,
} from '@/lib/utils';
import { useStore } from '@/lib/store';
import { useLiveTimers } from '@/lib/useLiveTimer';
import { useUI } from '@/lib/ui-context';
import { PriorityBadge } from './PriorityBadge';
import { TagBadge } from './TagBadge';
import { ProgressBar } from './ProgressBar';
import { SubtaskItem } from './SubtaskItem';
import { AddSubtask } from './AddSubtask';
import { PomodoroTimer } from './PomodoroTimer';
import type { Status, TaskType } from '@/types';

interface Props {
  task: TaskType;
  compact?: boolean;
}

export function TaskCard({ task, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const tags = useStore((s) => s.tags);
  const deleteTask = useStore((s) => s.deleteTask);
  const updateTask = useStore((s) => s.updateTask);
  const addSubtask = useStore((s) => s.addSubtask);
  const toggleSubtask = useStore((s) => s.toggleSubtask);
  const renameSubtask = useStore((s) => s.renameSubtask);
  const deleteSubtask = useStore((s) => s.deleteSubtask);
  const activeSessions = useStore((s) => s.activeSessions);
  const startTrackingTask = useStore((s) => s.startTrackingTask);
  const stopSession = useStore((s) => s.stopSession);
  const openFocusMode = useStore((s) => s.openFocusMode);
  const prefs = useStore((s) => s.prefs);
  const { openEditTask } = useUI();

  const elapsedMap = useLiveTimers();

  const sessionsForThisTask = activeSessions.filter((s) => s.task_id === task.id);
  const taskLevelSession = sessionsForThisTask.find((s) => s.subtask_id === null);
  const isTrackingThisTask = !!taskLevelSession;
  const isTrackingThisCard = sessionsForThisTask.length > 0;
  const liveElapsedForCard = sessionsForThisTask.reduce(
    (sum, s) => sum + (elapsedMap[s.id] ?? 0),
    0,
  );

  const handleQuickPlay = () => {
    if (isTrackingThisTask && taskLevelSession) {
      return void stopSession(taskLevelSession.id);
    }
    const defaultMode = prefs?.default_timer_mode ?? 'open';
    void (async () => {
      const session = await startTrackingTask(task.id, null, defaultMode);
      if (session && defaultMode !== 'open') openFocusMode(session.id);
    })();
  };

  // Feature 2c — always-visible task checkbox.
  const handleCheckbox = () => {
    const next: Status = task.status === 'done' ? 'in_progress' : 'done';
    void updateTask(task.id, { status: next });
  };

  // "Today's 5" quick actions.
  const allTasks = useStore((s) => s.tasks);
  const todayStr = todayISO();
  const tomorrowStr = tomorrowISO();
  const isPlannedToday = task.planned_for_date === todayStr;
  const isPlannedTomorrow = task.planned_for_date === tomorrowStr;

  const handleToggleToday = () => {
    if (isPlannedToday) {
      void updateTask(task.id, { planned_for_date: null });
      return;
    }
    const plannedToday = allTasks.filter(
      (t) => t.planned_for_date === todayStr,
    );
    if (plannedToday.length >= 5) {
      Alert.alert(
        "Today's 5 is full",
        `Add "${task.title}" as #${plannedToday.length + 1}? You'll need to reorder in the Today's 5 sheet to bring it into the top 5.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add to queue',
            onPress: () => {
              const maxOrder = Math.max(
                ...plannedToday.map((t) => t.sort_order),
              );
              void updateTask(task.id, {
                planned_for_date: todayStr,
                sort_order: maxOrder + 1,
              });
            },
          },
        ],
      );
      return;
    }
    void updateTask(task.id, { planned_for_date: todayStr });
  };

  const handleToggleTomorrow = () => {
    const next = isPlannedTomorrow ? null : tomorrowStr;
    void updateTask(task.id, { planned_for_date: next });
  };

  // Subtask delete with the "preserve time entries" prompt for subs that have
  // tracked time. Plain delete otherwise.
  const handleDeleteSub = (subId: string) => {
    const sub = task.subtasks.find((s) => s.id === subId);
    if (sub && sub.total_time_seconds > 0) {
      Alert.alert(
        'Delete subtask?',
        'This subtask has tracked time. Delete anyway? Time entries will be kept but unlinked from the subtask.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => deleteSubtask(task.id, subId),
          },
        ],
      );
    } else {
      void deleteSubtask(task.id, subId);
    }
  };

  const progress = getProgress(task.subtasks);
  const overdue = isOverdue(task.due_date, task.status);
  const taskTags = task.tag_ids.map((id) => tags.find((t) => t.id === id));

  const { timerIcon, panel, running } = PomodoroTimer({ task });

  // Feature 2b + 4 — invested chip combines saved task.total_time_seconds with
  // the live elapsed of every currently running tracked_session for this task.
  const invested = task.total_time_seconds + liveElapsedForCard;

  const doneCount = task.subtasks.filter((s) => s.is_done).length;
  const incompleteSubsOnDone =
    task.status === 'done' && task.subtasks.length > 0 && doneCount < task.subtasks.length;

  // Over-estimate visual states for the invested chip.
  let investedColor: string = '#888';
  let investedBg: string = 'rgba(0,0,0,0.04)';
  if (task.estimated_seconds && task.estimated_seconds > 0) {
    if (invested > task.estimated_seconds * 1.5) {
      investedColor = '#fff';
      investedBg = '#dc2626';
    } else if (invested > task.estimated_seconds) {
      investedColor = '#92400e';
      investedBg = '#fde68a';
    }
  }

  const confirmDelete = () =>
    Alert.alert('Delete task?', task.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTask(task.id) },
    ]);

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: compact ? 14 : 18,
        shadowColor: '#000',
        shadowOpacity: running ? 0.15 : 0.06,
        shadowRadius: running ? 8 : 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: running || isTrackingThisCard ? 4 : 2,
        borderLeftWidth: isTrackingThisCard ? 3 : 0,
        borderLeftColor: isTrackingThisCard ? '#8b5cf6' : 'transparent',
        borderWidth: running ? 2 : 0,
        borderColor: running ? 'rgba(139,92,246,0.25)' : 'transparent',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          marginBottom: 8,
        }}
      >
        {/* Feature 2c — always-visible task checkbox */}
        <Pressable
          onPress={handleCheckbox}
          hitSlop={6}
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: task.status === 'done' ? 0 : 2,
            borderColor: '#ccc',
            backgroundColor: task.status === 'done' ? '#10b981' : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 1,
          }}
        >
          {task.status === 'done' && (
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</Text>
          )}
        </Pressable>
        {timerIcon}
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          hitSlop={6}
          style={{ marginTop: 2 }}
        >
          <Text
            style={{
              color: '#aaa',
              fontSize: 14,
              transform: [{ rotate: expanded ? '90deg' : '0deg' }],
            }}
          >
            ▶
          </Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <Text
              style={{
                fontWeight: '700',
                fontSize: compact ? 14 : 15,
                color: task.status === 'done' ? '#888' : '#1a1a2e',
                lineHeight: 19,
                flexShrink: 1,
                textDecorationLine: task.status === 'done' ? 'line-through' : 'none',
              }}
            >
              {task.title}
            </Text>
            {incompleteSubsOnDone && (
              <View
                style={{
                  backgroundColor: '#fde68a',
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 6,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#92400e' }}>
                  ⚠ {task.subtasks.length - doneCount} not done
                </Text>
              </View>
            )}
            {/* Feature 2b — invested chip */}
            <View
              style={{
                backgroundColor: investedBg,
                paddingHorizontal: 7,
                paddingVertical: 1,
                borderRadius: 6,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: investedColor }}>
                ⏱ {fmtShort(invested)}
              </Text>
            </View>
            {task.estimated_seconds && task.estimated_seconds > 0 && (
              <View
                style={{
                  backgroundColor: 'rgba(0,0,0,0.04)',
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 6,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#888' }}>
                  Est {fmtShort(task.estimated_seconds)}
                </Text>
              </View>
            )}
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: 6,
              flexWrap: 'wrap',
              marginTop: 6,
              alignItems: 'center',
            }}
          >
            <PriorityBadge priority={task.priority} />
            {taskTags.map((t, i) => (
              <TagBadge key={t?.id ?? i} tag={t} />
            ))}
            {task.due_date && (
              <Text
                style={{
                  fontSize: 11,
                  color: overdue ? '#dc2626' : '#888',
                  fontWeight: overdue ? '700' : '500',
                }}
              >
                {overdue ? '⚠ ' : ''}Due {fmtDueDate(task.due_date)}
              </Text>
            )}
          </View>
        </View>

        <Pressable
          onPress={handleQuickPlay}
          hitSlop={6}
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: isTrackingThisTask ? '#8b5cf6' : 'rgba(139,92,246,0.1)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: isTrackingThisTask ? '#fff' : '#8b5cf6',
              fontSize: 12,
              fontWeight: '800',
            }}
          >
            {isTrackingThisTask ? '⏸' : '▶'}
          </Text>
        </Pressable>
        {/* Today's 5 quick-pick */}
        <Pressable onPress={handleToggleToday} hitSlop={8}>
          <Text
            style={{
              color: isPlannedToday ? '#f59e0b' : '#ccc',
              fontSize: 15,
            }}
          >
            {isPlannedToday ? '⭐' : '☆'}
          </Text>
        </Pressable>
        {/* Do tomorrow */}
        <Pressable onPress={handleToggleTomorrow} hitSlop={8}>
          <Text
            style={{
              color: isPlannedTomorrow ? '#3b82f6' : '#ccc',
              fontSize: 14,
            }}
          >
            📅
          </Text>
        </Pressable>
        <Pressable onPress={() => openEditTask(task.id)} hitSlop={8}>
          <Text style={{ color: '#bbb', fontSize: 16 }}>✎</Text>
        </Pressable>
        <Pressable onPress={confirmDelete} hitSlop={8}>
          <Text style={{ color: '#ccc', fontSize: 20 }}>×</Text>
        </Pressable>
      </View>

      {panel}

      <View style={{ marginTop: 8, marginBottom: expanded ? 8 : 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <View style={{ flex: 1 }}>
            <ProgressBar value={progress} />
          </View>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: progress === 100 ? '#10b981' : '#8b5cf6',
              minWidth: 36,
              textAlign: 'right',
            }}
          >
            {progress}%
          </Text>
        </View>
        <Text style={{ fontSize: 11, color: '#aaa' }}>
          {doneCount}/{task.subtasks.length} subtasks
        </Text>
      </View>

      {expanded && (
        <View style={{ marginTop: 6 }}>
          {task.subtasks.map((s) => (
            <SubtaskItem
              key={s.id}
              subtask={s}
              taskId={task.id}
              taskTitle={task.title}
              onToggle={() => toggleSubtask(task.id, s.id)}
              onDelete={() => handleDeleteSub(s.id)}
              onRename={(t) => renameSubtask(task.id, s.id, t)}
            />
          ))}
          <AddSubtask onAdd={(title) => addSubtask(task.id, title)} />
        </View>
      )}
    </View>
  );
}
