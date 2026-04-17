import { Text, View } from 'react-native';
import { PRIORITIES } from '@/lib/constants';
import type { Priority } from '@/types';

export function PriorityBadge({ priority }: { priority: Priority }) {
  const p = PRIORITIES.find((x) => x.value === priority) ?? PRIORITIES[0];
  return (
    <View
      style={{
        backgroundColor: p.bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
      }}
    >
      <Text
        style={{
          color: p.color,
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        {p.label}
      </Text>
    </View>
  );
}
