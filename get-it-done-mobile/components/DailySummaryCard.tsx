import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useStore } from '@/lib/store';

export function DailySummaryCard() {
  const notifications = useStore((s) => s.notifications);
  const markNotificationRead = useStore((s) => s.markNotificationRead);

  const summary = useMemo(() => {
    const unread = notifications
      .filter((n) => n.kind === 'daily_summary' && !n.read_at)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    return unread[0] ?? null;
  }, [notifications]);

  if (!summary) return null;

  const body = summary.body ?? '';
  const paragraphs = body.split('\n').filter((p) => p.trim().length > 0);

  return (
    <View
      style={{
        backgroundColor: '#fef3c7',
        borderLeftWidth: 4,
        borderLeftColor: '#f59e0b',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 16 }}>☀️</Text>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: '#92400e',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Morning briefing
          </Text>
        </View>
        <Pressable
          onPress={() => void markNotificationRead(summary.id)}
          hitSlop={8}
        >
          <Text style={{ color: '#92400e', fontSize: 14, fontWeight: '700' }}>
            ×
          </Text>
        </Pressable>
      </View>
      {paragraphs.map((p, i) => (
        <Text
          key={i}
          style={{
            fontSize: 13,
            color: '#1a1a2e',
            lineHeight: 19,
            marginBottom: 6,
          }}
        >
          {p}
        </Text>
      ))}
    </View>
  );
}
