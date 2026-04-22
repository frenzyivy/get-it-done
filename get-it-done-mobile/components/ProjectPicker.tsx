import { Pressable, Text, View, ScrollView } from 'react-native';
import { useStore } from '@/lib/store';

interface Props {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  includeArchived?: boolean;
}

export function ProjectPicker({ selectedIds, onChange, includeArchived = false }: Props) {
  const projects = useStore((s) => s.projects);
  const visible = projects.filter((p) => (includeArchived ? true : p.status !== 'archived'));

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
        Project
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {visible.length === 0 && (
            <Text style={{ fontSize: 12, color: '#aaa' }}>No projects yet.</Text>
          )}
          {visible.map((p) => {
            const on = selectedIds.includes(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => toggle(p.id)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: on ? p.color : '#e5e7eb',
                  backgroundColor: on ? p.color + '22' : '#fff',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  opacity: p.status === 'archived' ? 0.5 : 1,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: p.color,
                  }}
                />
                <Text
                  style={{
                    fontSize: 12,
                    color: on ? p.color : '#666',
                    fontWeight: on ? '700' : '500',
                  }}
                >
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
