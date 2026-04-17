import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { KANBAN_COLS } from '@/lib/constants';
import { useStore } from '@/lib/store';
import { TaskCard } from './TaskCard';
import type { Status, TaskType } from '@/types';

type ColId = (typeof KANBAN_COLS)[number]['id'];

export function KanbanView({ onAdd }: { onAdd: (status: Status) => void }) {
  const [colId, setColId] = useState<ColId>('todo');
  const tasks = useStore((s) => s.tasks);
  const moveTask = useStore((s) => s.moveTask);

  const col = KANBAN_COLS.find((c) => c.id === colId)!;
  const colTasks = tasks.filter((t) => t.status === colId);

  const promptMove = (task: TaskType) => {
    const options = KANBAN_COLS.filter((c) => c.id !== task.status).map((c) => c.label);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options, 'Cancel'], cancelButtonIndex: options.length },
        (i) => {
          if (i < options.length) {
            const target = KANBAN_COLS.filter((c) => c.id !== task.status)[i];
            void moveTask(task.id, target.id);
          }
        },
      );
    } else {
      Alert.alert(
        'Move task',
        task.title,
        [
          ...KANBAN_COLS.filter((c) => c.id !== task.status).map((c) => ({
            text: c.label,
            onPress: () => moveTask(task.id, c.id),
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
        { cancelable: true },
      );
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}
      >
        {KANBAN_COLS.map((c) => {
          const on = c.id === colId;
          const count = tasks.filter((t) => t.status === c.id).length;
          return (
            <Pressable
              key={c.id}
              onPress={() => setColId(c.id)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: on ? c.accent : '#fff',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                shadowColor: '#000',
                shadowOpacity: 0.04,
                shadowRadius: 2,
                elevation: 1,
              }}
            >
              <Text style={{ fontSize: 14, color: on ? '#fff' : c.accent }}>
                {c.icon}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '800',
                  color: on ? '#fff' : c.accent,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                {c.label}
              </Text>
              <View
                style={{
                  backgroundColor: on ? 'rgba(255,255,255,0.25)' : c.accent + '18',
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: on ? '#fff' : c.accent,
                  }}
                >
                  {count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{
          gap: 10,
          paddingHorizontal: 16,
          paddingBottom: 120,
        }}
      >
        {colTasks.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ color: '#aaa', fontSize: 13 }}>
              No tasks in {col.label}.
            </Text>
          </View>
        )}
        {colTasks.map((task) => (
          <Pressable key={task.id} onLongPress={() => promptMove(task)} delayLongPress={350}>
            <TaskCard task={task} compact />
          </Pressable>
        ))}
        <Pressable
          onPress={() => onAdd(colId)}
          style={{
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: 'rgba(139,92,246,0.3)',
            backgroundColor: 'rgba(139,92,246,0.05)',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#8b5cf6', fontWeight: '700', fontSize: 13 }}>
            + New Task
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
