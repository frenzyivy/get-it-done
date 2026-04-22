import Constants, { ExecutionEnvironment } from 'expo-constants';

// Expo Go dropped the native notifications module in SDK 53, so everything
// here is dynamic-imported and guarded. In Expo Go these calls no-op silently
// rather than throwing — the focus session itself still works, just without
// the OS-level completion/broken banner.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export async function notifyFocusSessionComplete(
  taskTitle: string | null,
  durationMinutes: number,
): Promise<void> {
  if (isExpoGo) return;
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Focus session complete 🎉',
        body: `${durationMinutes}m deep work logged${taskTitle ? ` on "${taskTitle}"` : ''}.`,
        sound: true,
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[local-notif] complete failed', err);
  }
}

export async function notifyFocusSessionBroken(): Promise<void> {
  if (isExpoGo) return;
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Session ended early',
        body: 'Streak reset.',
        sound: true,
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[local-notif] broken failed', err);
  }
}
