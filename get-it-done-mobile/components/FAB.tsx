import { Pressable } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from 'react-native-paper';

interface Props {
  onPress: () => void;
  accessibilityLabel?: string;
}

export function FAB({ onPress, accessibilityLabel = 'Add task' }: Props) {
  const theme = useTheme();
  const c = theme.colors;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        position: 'absolute',
        right: 16,
        bottom: 96,
        width: 56,
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.primary,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
        transform: pressed ? [{ scale: 0.96 }] : undefined,
      })}
    >
      <MaterialCommunityIcons name="plus" size={24} color={c.onPrimary} />
    </Pressable>
  );
}
