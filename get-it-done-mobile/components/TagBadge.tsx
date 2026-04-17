import { Text, View } from 'react-native';
import type { TagType } from '@/types';

export function TagBadge({ tag }: { tag: TagType | undefined }) {
  if (!tag) return null;
  return (
    <View
      style={{
        backgroundColor: tag.color + '18',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
      }}
    >
      <Text
        style={{
          color: tag.color,
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        }}
      >
        {tag.name}
      </Text>
    </View>
  );
}
