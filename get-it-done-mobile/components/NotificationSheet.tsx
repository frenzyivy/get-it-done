import { forwardRef, useImperativeHandle, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useStore } from '@/lib/store';
import type { NotificationType } from '@/types';

export interface NotificationSheetHandle {
  open: () => void;
  close: () => void;
}

const KIND_EMOJI: Record<string, string> = {
  overdue: '⚠️',
  due_soon: '⏰',
  priority_bumped: '⬆️',
  recurring_created: '🔄',
  daily_summary: '☀️',
  completion_celebrate: '🎉',
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export const NotificationSheet = forwardRef<NotificationSheetHandle>(
  function NotificationSheet(_props, ref) {
    const [visible, setVisible] = useState(false);
    const notifications = useStore((s) => s.notifications);
    const markRead = useStore((s) => s.markNotificationRead);
    const markAllRead = useStore((s) => s.markAllNotificationsRead);

    useImperativeHandle(ref, () => ({
      open: () => setVisible(true),
      close: () => setVisible(false),
    }));

    const unread = notifications.filter((n) => !n.read_at).length;

    const handleItemPress = (n: NotificationType) => {
      if (!n.read_at) markRead(n.id);
    };

    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.4)',
            justifyContent: 'flex-end',
          }}
          onPress={() => setVisible(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 16,
              paddingBottom: 32,
              maxHeight: '80%',
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: '#e5e7eb',
                marginBottom: 12,
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 20,
                marginBottom: 8,
              }}
            >
              <Text
                style={{ fontSize: 18, fontWeight: '800', color: '#1a1a2e' }}
              >
                Notifications
              </Text>
              {unread > 0 && (
                <Pressable onPress={markAllRead} hitSlop={8}>
                  <Text
                    style={{ fontSize: 12, fontWeight: '700', color: '#8b5cf6' }}
                  >
                    Mark all read
                  </Text>
                </Pressable>
              )}
            </View>
            <ScrollView
              style={{ maxHeight: 520 }}
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              {notifications.length === 0 ? (
                <Text
                  style={{
                    textAlign: 'center',
                    color: '#aaa',
                    paddingVertical: 40,
                    paddingHorizontal: 20,
                    fontSize: 13,
                  }}
                >
                  Nothing here yet. Automations will post updates as they happen.
                </Text>
              ) : (
                notifications.map((n) => (
                  <Pressable
                    key={n.id}
                    onPress={() => handleItemPress(n)}
                    style={{
                      flexDirection: 'row',
                      gap: 10,
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: 'rgba(0,0,0,0.04)',
                      backgroundColor: n.read_at
                        ? 'transparent'
                        : 'rgba(139,92,246,0.04)',
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>
                      {KIND_EMOJI[n.kind] ?? '🔔'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: n.read_at ? '600' : '700',
                            color: n.read_at ? '#555' : '#1a1a2e',
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          {n.title}
                        </Text>
                        {!n.read_at && (
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: '#8b5cf6',
                            }}
                          />
                        )}
                      </View>
                      {n.body && (
                        <Text
                          style={{ fontSize: 12, color: '#888', marginTop: 2 }}
                          numberOfLines={2}
                        >
                          {n.body}
                        </Text>
                      )}
                      <Text
                        style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}
                      >
                        {timeAgo(n.created_at)} ago
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  },
);
