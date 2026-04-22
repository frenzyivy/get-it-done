import { Text, View } from 'react-native';
import { labelTintBg } from '@/lib/utils';
import type { CategoryType } from '@/types';

interface Props {
  category: CategoryType | undefined;
}

export function CategoryPill({ category }: Props) {
  if (!category) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: labelTintBg(category.color),
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: category.color,
        }}
      />
      <Text style={{ fontSize: 11, fontWeight: '700', color: category.color }}>
        {category.name}
      </Text>
    </View>
  );
}
