import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { fmtShort, fmtDueDate, getProgress, isOverdue } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { PriorityBadge } from './PriorityBadge';
import { TagBadge } from './TagBadge';
import { ProgressBar } from './ProgressBar';
import { SubtaskItem } from './SubtaskItem';
import { AddSubtask } from './AddSubtask';
import { PomodoroTimer } from './PomodoroTimer';
import type { TaskType } from '@/types';

interface Props {
  task: TaskType;
  compact?: boolean;
}

export function TaskCard({ task, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const tags = useStore((s) => s.tags);
  const deleteTask = useStore((s) => s.deleteTask);
  const addSubtask = useStore((s) => s.addSubtask);
  const toggleSubtask = useStore((s) => s.toggleSubtask);
  const renameSubtask = useStore((s) => s.renameSubtask);
  const deleteSubtask = useStore((s) => s.deleteSubtask);
  const activeSession = useStore((s) => s.activeSession);
  const startTrackingTask = useStore((s) => s.startTrackingTask);
  const stopActiveSession = useStore((s) => s.stopActiveSession);

  const isTrackingThisTask = activeSession?.task_id === task.id;
  const handleQuickPlay = () => {
    if (isTrackingThisTask) return void stopActiveSession();
    if (activeSession) {
      Alert.alert(
        'Switch timer?',
        `Stop the current timer and start tracking "${task.title}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Switch', onPress: () => void startTrackingTask(task.id) },
        ],
      );
      return;
    }
    void startTrackingTask(task.id);
  };

  const progress = getProgress(task.subtasks);
  const overdue = isOverdue(task.due_date, task.status);
  const taskTags = task.tag_ids.map((id) => tags.find((t) => t.id === id));

  const { timerIcon, panel, running, totalTime } = PomodoroTimer({ task });

  const doneCount = task.subtasks.filter((s) => s.is_done).length;

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
        elevation: running || isTrackingThisTask ? 4 : 2,
        borderLeftWidth: isTrackingThisTask ? 3 : 0,
        borderLeftColor: isTrackingThisTask ? '#8b5cf6' : 'transparent',
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
                color: '#1a1a2e',
                lineHeight: 19,
                flexShrink: 1,
              }}
            >
              {task.title}
            </Text>
            {totalTime > 0 && (
              <View
                style={{
                  backgroundColor: 'rgba(139,92,246,0.08)',
                  paddingHorizontal: 7,
                  paddingVertical: 1,
                  borderRadius: 6,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#8b5cf6' }}>
                  🕐 {fmtShort(totalTime)}
                </Text>
              </View>
            )}
            {task.estimated_seconds && task.estimated_seconds > 0 && (
              <View
                style={{
                  backgroundColor: 'rgba(0,0,0,0.04)',
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color:
                      totalTime > task.estimated_seconds * 1.1
                        ? '#dc2626'
                        : totalTime > task.estimated_seconds * 0.9
                          ? '#f59e0b'
                          : '#888',
                  }}
                >
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
              onToggle={() => toggleSubtask(task.id, s.id)}
              onDelete={() => deleteSubtask(task.id, s.id)}
              onRename={(t) => renameSubtask(task.id, s.id, t)}
            />
          ))}
          <AddSubtask onAdd={(title) => addSubtask(task.id, title)} />
        </View>
      )}
    </View>
  );
}
