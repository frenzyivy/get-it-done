import { Pressable, Text, View, ScrollView } from 'react-native';
import type { TagType } from '@/types';

interface Props {
  tags: TagType[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function TagPicker({ tags, selectedIds, onChange }: Props) {
  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );

  return (
    <View>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        Tags
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {tags.map((t) => {
            const on = selectedIds.includes(t.id);
            return (
              <Pressable
                key={t.id}
                onPress={() => toggle(t.id)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: on ? t.color : '#e5e7eb',
                  backgroundColor: on ? t.color + '22' : '#fff',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: t.color,
                  }}
                />
                <Text
                  style={{
                    fontSize: 12,
                    color: on ? t.color : '#666',
                    fontWeight: on ? '700' : '500',
                  }}
                >
                  {t.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
