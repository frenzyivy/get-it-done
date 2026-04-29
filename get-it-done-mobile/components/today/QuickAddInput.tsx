import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useStore } from '@/lib/store';
import { TODAY_COLORS, TODAY_FONT } from './palette';

export function QuickAddInput() {
  const [value, setValue] = useState('');
  const addTask = useStore((s) => s.addTask);

  const submit = async () => {
    const title = value.trim();
    if (!title) return;
    setValue('');
    const today = new Date().toISOString().slice(0, 10);
    await addTask({
      title,
      priority: 'medium',
      status: 'todo',
      tag_ids: [],
      due_date: today,
    });
  };

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: TODAY_COLORS.card,
        borderWidth: 1,
        borderColor: TODAY_COLORS.border,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      <Pressable
        onPress={submit}
        accessibilityRole="button"
        accessibilityLabel="Add task"
        hitSlop={6}
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: TODAY_COLORS.purple,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: TODAY_FONT.semibold,
            color: '#fff',
            fontSize: 16,
            lineHeight: 20,
          }}
        >
          +
        </Text>
      </Pressable>

      <TextInput
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder="Add a task for today…"
        placeholderTextColor={TODAY_COLORS.ink3}
        returnKeyType="done"
        style={{
          flex: 1,
          fontFamily: TODAY_FONT.medium,
          fontSize: 14,
          color: TODAY_COLORS.ink,
          padding: 0,
        }}
      />

      <View
        accessibilityLabel="Voice input (coming soon)"
        style={{
          width: 24,
          height: 24,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons
          name="microphone-outline"
          size={18}
          color={TODAY_COLORS.ink3}
        />
      </View>
    </View>
  );
}
