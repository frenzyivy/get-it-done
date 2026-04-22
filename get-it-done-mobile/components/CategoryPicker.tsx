import { Pressable, Text, View, ScrollView } from 'react-native';
import { useStore } from '@/lib/store';

interface Props {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function CategoryPicker({ selectedIds, onChange }: Props) {
  const categories = useStore((s) => s.categories);
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
        Category
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {categories.length === 0 && (
            <Text style={{ fontSize: 12, color: '#aaa' }}>
              No categories yet.
            </Text>
          )}
          {categories.map((c) => {
            const on = selectedIds.includes(c.id);
            return (
              <Pressable
                key={c.id}
                onPress={() => toggle(c.id)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: on ? c.color : '#e5e7eb',
                  backgroundColor: on ? c.color + '22' : '#fff',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: c.color,
                  }}
                />
                <Text
                  style={{
                    fontSize: 12,
                    color: on ? c.color : '#666',
                    fontWeight: on ? '700' : '500',
                  }}
                >
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
