import { Pressable, ScrollView, Text, View } from 'react-native';
import { PRIORITY_ORDER } from '@/lib/constants';
import { useStore } from '@/lib/store';
import { TaskCard } from './TaskCard';
import type { Status } from '@/types';

export function ListView({ onAdd }: { onAdd: (status: Status) => void }) {
  const tasks = useStore((s) => s.tasks);
  const sorted = [...tasks].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );

  return (
    <ScrollView
      contentContainerStyle={{
        gap: 12,
        paddingHorizontal: 16,
        paddingBottom: 120,
      }}
    >
      {sorted.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Text style={{ color: '#aaa', fontSize: 14 }}>
            No tasks yet. Create one below!
          </Text>
        </View>
      )}
      {sorted.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
      <Pressable
        onPress={() => onAdd('todo')}
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
  );
}
