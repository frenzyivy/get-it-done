import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { fmtShort } from '@/lib/utils';
import type { SubtaskType } from '@/types';

interface Props {
  subtask: SubtaskType;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}

export function SubtaskItem({ subtask, onToggle, onDelete, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(subtask.title);

  const commit = () => {
    const next = val.trim();
    if (next && next !== subtask.title) onRename(next);
    setEditing(false);
  };

  const confirmDelete = () =>
    Alert.alert('Remove subtask?', subtask.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 5,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.04)',
      }}
    >
      <Pressable
        onPress={onToggle}
        hitSlop={6}
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          borderWidth: subtask.is_done ? 0 : 2,
          borderColor: '#ccc',
          backgroundColor: subtask.is_done ? '#10b981' : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {subtask.is_done && (
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>
        )}
      </Pressable>

      {editing ? (
        <TextInput
          value={val}
          autoFocus
          onChangeText={setVal}
          onBlur={commit}
          onSubmitEditing={commit}
          returnKeyType="done"
          style={{
            flex: 1,
            fontSize: 13,
            paddingVertical: 2,
            borderBottomWidth: 1.5,
            borderBottomColor: '#8b5cf6',
          }}
        />
      ) : (
        <Pressable onLongPress={() => setEditing(true)} style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 13,
              color: subtask.is_done ? '#aaa' : '#333',
              textDecorationLine: subtask.is_done ? 'line-through' : 'none',
            }}
          >
            {subtask.title}
          </Text>
        </Pressable>
      )}

      {subtask.total_time_seconds > 0 && (
        <View
          style={{
            backgroundColor: 'rgba(139,92,246,0.08)',
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 5,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#8b5cf6' }}>
            🕐 {fmtShort(subtask.total_time_seconds)}
          </Text>
        </View>
      )}

      <Pressable onPress={confirmDelete} hitSlop={8}>
        <Text style={{ color: '#ccc', fontSize: 16 }}>×</Text>
      </Pressable>
    </View>
  );
}
