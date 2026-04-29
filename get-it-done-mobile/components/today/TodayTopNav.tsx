import { Pressable, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui-context';
import { TODAY_COLORS, TODAY_FONT } from './palette';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ISO week number, Mon-based. Reference: https://stackoverflow.com/a/6117889
function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function TodayTopNav() {
  const unread = useStore(
    (s) => s.notifications.filter((n) => !n.read_at).length,
  );
  const { openNotifications, openOverflowMenu } = useUI();

  const now = new Date();
  const subtitle = `${DOW[now.getDay()]}, ${now.getDate()} ${MONTH[now.getMonth()]} · Week ${isoWeek(now)}`;

  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
      }}
    >
      <View>
        <Text
          style={{
            fontFamily: TODAY_FONT.extrabold,
            fontSize: 26,
            letterSpacing: -0.5,
            color: TODAY_COLORS.ink,
            lineHeight: 26,
          }}
        >
          Today
        </Text>
        <Text
          style={{
            fontFamily: TODAY_FONT.medium,
            fontSize: 12,
            color: TODAY_COLORS.ink3,
            marginTop: 4,
          }}
        >
          {subtitle}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={openNotifications}
          accessibilityRole="button"
          accessibilityLabel="Open notifications"
          hitSlop={6}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: pressed ? TODAY_COLORS.chipBg : TODAY_COLORS.card,
            borderWidth: 1,
            borderColor: TODAY_COLORS.border,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <MaterialCommunityIcons
            name="bell-outline"
            size={18}
            color={TODAY_COLORS.ink}
          />
          {unread > 0 && (
            <View
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: TODAY_COLORS.red,
              }}
            />
          )}
        </Pressable>

        <Pressable
          onPress={openOverflowMenu}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          hitSlop={6}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: pressed ? TODAY_COLORS.chipBg : TODAY_COLORS.card,
            borderWidth: 1,
            borderColor: TODAY_COLORS.border,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <MaterialCommunityIcons
            name="dots-horizontal"
            size={18}
            color={TODAY_COLORS.ink}
          />
        </Pressable>
      </View>
    </View>
  );
}
