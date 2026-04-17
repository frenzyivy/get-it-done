import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { supabase } from './supabase';

// Push notifications require a dev build or standalone app — not Expo Go.
// In Expo Go we skip the whole thing so the app still runs cleanly.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export async function registerForPushNotifications(
  userId: string,
): Promise<string | null> {
  if (isExpoGo) {
    console.log('[push] Expo Go detected — push disabled. Use a dev build.');
    return null;
  }

  // Dynamic imports keep expo-notifications out of the Expo Go bundle, which
  // no longer ships the native module as of SDK 53.
  const [Notifications, Device] = await Promise.all([
    import('expo-notifications'),
    import('expo-device'),
  ]);

  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device.');
    return null;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Get-it-done',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8b5cf6',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  const token = (
    await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )
  ).data;

  await supabase
    .from('user_preferences')
    .update({ expo_push_token: token })
    .eq('user_id', userId);

  return token;
}
