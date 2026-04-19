import { Pressable, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from 'react-native-paper';
import { type as M3Type } from '@/lib/theme';

interface Props {
  title?: string;
  subtitle?: string;
  unreadCount: number;
  onOpenNotifications: () => void;
  onOpenOverflow?: () => void;
}

export function TopAppBar({
  title,
  subtitle,
  unreadCount,
  onOpenNotifications,
  onOpenOverflow,
}: Props) {
  const theme = useTheme();
  const c = theme.colors;

  // Per prototype: large, left-aligned screen title (headlineSmall-ish).
  // When no title is set we fall back to bolt + wordmark.
  const hasTitle = Boolean(title);

  return (
    <View
      style={{
        minHeight: 64,
        paddingHorizontal: 4,
        paddingVertical: hasTitle ? 10 : 0,
        backgroundColor: c.surface,
        flexDirection: 'row',
        alignItems: hasTitle ? 'flex-start' : 'center',
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: hasTitle ? 'column' : 'row',
          alignItems: hasTitle ? 'flex-start' : 'center',
          gap: hasTitle ? 2 : 8,
          paddingLeft: 16,
          paddingTop: hasTitle ? 6 : 0,
        }}
      >
        {hasTitle ? (
          <>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 28,
                lineHeight: 34,
                fontWeight: '700',
                letterSpacing: -0.5,
                color: c.onSurface,
              }}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                numberOfLines={1}
                style={{
                  ...M3Type.bodySmall,
                  color: c.onSurfaceVariant,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {subtitle}
              </Text>
            )}
          </>
        ) : (
          <>
            <MaterialCommunityIcons name="flash" size={24} color={c.primary} />
            <Text
              style={{ ...M3Type.titleLarge, color: c.onSurface }}
              numberOfLines={1}
            >
              Get-it-done
            </Text>
          </>
        )}
      </View>

      <Pressable
        onPress={onOpenNotifications}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        style={({ pressed }) => ({
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          backgroundColor: pressed ? c.elevation.level2 : 'transparent',
        })}
      >
        <MaterialCommunityIcons
          name={unreadCount > 0 ? 'bell' : 'bell-outline'}
          size={24}
          color={c.onSurface}
        />
        {unreadCount > 0 && (
          <View
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: c.error,
              borderWidth: 2,
              borderColor: c.surface,
            }}
          />
        )}
      </Pressable>

      <Pressable
        onPress={onOpenOverflow}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="More options"
        style={({ pressed }) => ({
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 4,
          backgroundColor: pressed ? c.elevation.level2 : 'transparent',
        })}
      >
        <MaterialCommunityIcons name="dots-vertical" size={24} color={c.onSurface} />
      </Pressable>
    </View>
  );
}
