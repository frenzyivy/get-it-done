import { useCallback, useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import { useStore } from '@/lib/store';
import { UIProvider } from '@/lib/ui-context';
import { NowTrackingBar } from '@/components/NowTrackingBar';
import { DailyGoalBar } from '@/components/DailyGoalBar';
import { TagManagerSheet, type TagManagerHandle } from '@/components/TagManagerSheet';
import { AddTaskSheet, type AddTaskSheetHandle } from '@/components/AddTaskSheet';
import {
  NotificationSheet,
  type NotificationSheetHandle,
} from '@/components/NotificationSheet';
import { registerForPushNotifications } from '@/lib/push-notifications';
import type { Status } from '@/types';

export default function TabsLayout() {
  const tagCount = useStore((s) => s.tags.length);
  const userId = useStore((s) => s.userId);
  const prefs = useStore((s) => s.prefs);
  const unreadCount = useStore(
    (s) => s.notifications.filter((n) => !n.read_at).length,
  );
  const tagSheetRef = useRef<TagManagerHandle>(null);
  const addSheetRef = useRef<AddTaskSheetHandle>(null);
  const notifSheetRef = useRef<NotificationSheetHandle>(null);

  const openAddTask = useCallback((status: Status = 'todo') => {
    addSheetRef.current?.open(status);
  }, []);

  // Register for push once the user is authed and they haven't opted out.
  // If they have no token yet (or an old one), update it — PLAN.md §9 says
  // refresh on every launch.
  useEffect(() => {
    if (!userId || !prefs) return;
    if (!prefs.notify_push) return;
    void registerForPushNotifications(userId);
  }, [userId, prefs]);

  return (
    <UIProvider value={{ openAddTask }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f7ff' }} edges={['top']}>
        <NowTrackingBar />
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 8,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#1a1a2e' }}>
            <Text style={{ color: '#8b5cf6' }}>⚡ </Text>Get-it-done
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Pressable
              onPress={() => notifSheetRef.current?.open()}
              hitSlop={6}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                borderWidth: 1.5,
                borderColor: '#e5e7eb',
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              <Text style={{ fontSize: 16 }}>🔔</Text>
              {unreadCount > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    minWidth: 18,
                    height: 18,
                    paddingHorizontal: 4,
                    borderRadius: 9,
                    backgroundColor: '#dc2626',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => tagSheetRef.current?.open()}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                borderWidth: 1.5,
                borderColor: '#e5e7eb',
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#666' }}>
                ⚙ Tags ({tagCount})
              </Text>
            </Pressable>
          </View>
        </View>
        <DailyGoalBar />

        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: '#8b5cf6',
            tabBarInactiveTintColor: '#888',
            tabBarStyle: {
              borderTopWidth: 1,
              borderTopColor: '#eee',
              backgroundColor: '#fff',
              height: 58,
              paddingTop: 6,
              paddingBottom: 8,
            },
            tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Board',
              tabBarIcon: ({ color }) => (
                <Text style={{ color, fontSize: 20 }}>▤</Text>
              ),
            }}
            listeners={{ focus: () => useStore.getState().setView('kanban') }}
          />
          <Tabs.Screen
            name="list"
            options={{
              title: 'List',
              tabBarIcon: ({ color }) => (
                <Text style={{ color, fontSize: 20 }}>☰</Text>
              ),
            }}
            listeners={{ focus: () => useStore.getState().setView('list') }}
          />
          <Tabs.Screen
            name="schedule"
            options={{
              title: 'Schedule',
              tabBarIcon: ({ color }) => (
                <Text style={{ color, fontSize: 18 }}>⏱</Text>
              ),
            }}
            listeners={{ focus: () => useStore.getState().setView('schedule') }}
          />
          <Tabs.Screen
            name="timeline"
            options={{
              title: 'Timeline',
              tabBarIcon: ({ color }) => (
                <Text style={{ color, fontSize: 18 }}>◧</Text>
              ),
            }}
            listeners={{ focus: () => useStore.getState().setView('timeline') }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color }) => (
                <Text style={{ color, fontSize: 20 }}>⚙</Text>
              ),
            }}
          />
        </Tabs>

        <TagManagerSheet ref={tagSheetRef} />
        <AddTaskSheet ref={addSheetRef} />
        <NotificationSheet ref={notifSheetRef} />
      </SafeAreaView>
    </UIProvider>
  );
}
