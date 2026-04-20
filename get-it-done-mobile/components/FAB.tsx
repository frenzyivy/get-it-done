import { Pressable } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from 'react-native-paper';

interface Props {
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
}

export function FAB({
  onPress,
  onLongPress,
  accessibilityLabel = 'Add task',
}: Props) {
  const theme = useTheme();
  const c = theme.colors;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={
        onLongPress ? 'Long-press to start a focus session' : undefined
      }
      style={({ pressed }) => ({
        position: 'absolute',
        right: 18,
        bottom: 96,
        width: 56,
        height: 56,
        zIndex: 50,
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
