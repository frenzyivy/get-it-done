import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Tabs, useSegments } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';
import { UIProvider } from '@/lib/ui-context';
import { TrackingCard } from '@/components/TrackingCard';
import { TopAppBar } from '@/components/TopAppBar';
import { M3BottomNav } from '@/components/M3BottomNav';
import { FAB } from '@/components/FAB';
import { TagManagerSheet, type TagManagerHandle } from '@/components/TagManagerSheet';
import { AddTaskSheet, type AddTaskSheetHandle } from '@/components/AddTaskSheet';
import {
  NotificationSheet,
  type NotificationSheetHandle,
} from '@/components/NotificationSheet';
import {
  EditTaskSheet,
  type EditTaskSheetHandle,
} from '@/components/EditTaskSheet';
import { FocusModeScreen } from '@/components/FocusModeScreen';
import {
  FocusLockPickerSheet,
  type FocusLockPickerHandle,
} from '@/components/FocusLockPickerSheet';
import {
  RecurringTemplatesSheet,
  type RecurringTemplatesHandle,
} from '@/components/RecurringTemplatesSheet';
import {
  TodayFiveSheet,
  type TodayFiveSheetHandle,
} from '@/components/TodayFiveSheet';
import { RolloverPromptSheet } from '@/components/RolloverPromptSheet';
import { registerForPushNotifications } from '@/lib/push-notifications';
import type { Status } from '@/types';

const TITLES: Record<string, { title: string; subtitle?: string }> = {
  index: { title: 'Board' },
  list: { title: 'Today' },
  schedule: { title: 'Day' },
  timeline: { title: 'Insights' },
  settings: { title: 'Settings' },
};

export default function TabsLayout() {
  const theme = useTheme();
  const segments = useSegments();
  const userId = useStore((s) => s.userId);
  const prefs = useStore((s) => s.prefs);
  const unreadCount = useStore(
    (s) => s.notifications.filter((n) => !n.read_at).length,
  );

  // Last segment inside the (tabs) group tells us which screen is active.
  // When on the index screen, expo-router reports the group name only.
  const lastSeg = segments[segments.length - 1] ?? 'index';
  const routeKey = lastSeg === '(tabs)' ? 'index' : lastSeg;
  const header = TITLES[routeKey] ?? TITLES.index;
  const tagSheetRef = useRef<TagManagerHandle>(null);
  const addSheetRef = useRef<AddTaskSheetHandle>(null);
  const notifSheetRef = useRef<NotificationSheetHandle>(null);
  const editSheetRef = useRef<EditTaskSheetHandle>(null);
  const todayFiveSheetRef = useRef<TodayFiveSheetHandle>(null);
  const focusLockPickerRef = useRef<FocusLockPickerHandle>(null);
  const recurringSheetRef = useRef<RecurringTemplatesHandle>(null);

  const openAddTask = useCallback((status: Status = 'todo') => {
    addSheetRef.current?.open(status);
  }, []);
  const openEditTask = useCallback((taskId: string) => {
    editSheetRef.current?.open(taskId);
  }, []);
  const openTodayFive = useCallback(() => {
    todayFiveSheetRef.current?.open();
  }, []);
  const openFocusLockPicker = useCallback(
    (taskId: string, subtaskId: string | null = null) => {
      focusLockPickerRef.current?.open(taskId, subtaskId);
    },
    [],
  );
  const openRecurringTemplates = useCallback(() => {
    recurringSheetRef.current?.open();
  }, []);

  useEffect(() => {
    if (!userId || !prefs) return;
    if (!prefs.notify_push) return;
    void registerForPushNotifications(userId);
  }, [userId, prefs]);

  return (
    <UIProvider
      value={{
        openAddTask,
        openEditTask,
        openTodayFive,
        openFocusLockPicker,
        openRecurringTemplates,
      }}
    >
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        edges={['top']}
      >
        <TopAppBar
          title={header.title}
          subtitle={header.subtitle}
          unreadCount={unreadCount}
          onOpenNotifications={() => notifSheetRef.current?.open()}
          onOpenOverflow={() => tagSheetRef.current?.open()}
        />
        <TrackingCard />

        <View style={{ flex: 1 }}>
          <Tabs
            screenOptions={{ headerShown: false }}
            tabBar={(props) => <M3BottomNav {...props} />}
          >
            <Tabs.Screen
              name="index"
              listeners={{ focus: () => useStore.getState().setView('kanban') }}
            />
            <Tabs.Screen
              name="list"
              listeners={{ focus: () => useStore.getState().setView('list') }}
            />
            <Tabs.Screen
              name="schedule"
              listeners={{ focus: () => useStore.getState().setView('schedule') }}
            />
            <Tabs.Screen
              name="timeline"
              listeners={{ focus: () => useStore.getState().setView('timeline') }}
            />
            <Tabs.Screen name="settings" />
          </Tabs>
        </View>

        {/* Global add-task FAB — hidden on Day (has its own Plan FAB) and
            Settings (no task surface). */}
        {routeKey !== 'schedule' && routeKey !== 'settings' && (
        <FAB
          onPress={() => openAddTask('todo')}
          onLongPress={() => {
            // Long-press = "start a focus session on my #1 Today task".
            // If there is no Today plan, fall back to first in-progress or
            // first todo. If nothing at all, fall through to Add Task.
            const { tasks } = useStore.getState();
            const today = new Date().toISOString().slice(0, 10);
            const pick =
              tasks.find(
                (t) => t.planned_for_date === today && t.status !== 'done',
              ) ??
              tasks.find((t) => t.status === 'in_progress') ??
              tasks.find((t) => t.status === 'todo');
            if (pick) openFocusLockPicker(pick.id);
            else openAddTask('todo');
          }}
        />
        )}

        <TagManagerSheet ref={tagSheetRef} />
        <AddTaskSheet ref={addSheetRef} />
        <NotificationSheet ref={notifSheetRef} />
        <EditTaskSheet ref={editSheetRef} />
        <TodayFiveSheet ref={todayFiveSheetRef} />
        <FocusLockPickerSheet ref={focusLockPickerRef} />
        <RecurringTemplatesSheet ref={recurringSheetRef} />
        <RolloverPromptSheet />
        <FocusModeScreen />
      </SafeAreaView>
    </UIProvider>
  );
}
