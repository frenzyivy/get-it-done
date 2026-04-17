import '../global.css';

import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments } from 'expo-router';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  DMSans_800ExtraBold,
} from '@expo-google-fonts/dm-sans';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    DMSans_800ExtraBold,
  });

  const [authReady, setAuthReady] = useState(false);
  const setUserId = useStore((s) => s.setUserId);
  const fetchAll = useStore((s) => s.fetchAll);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user.id ?? null);
      if (session?.user.id) void fetchAll();
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user.id) {
        useStore.getState().unsubscribeNotifications();
      }
      setUserId(session?.user.id ?? null);
      if (session?.user.id) void fetchAll();
    });
    return () => sub.subscription.unsubscribe();
  }, [setUserId, fetchAll]);

  useEffect(() => {
    if (!authReady) return;
    const userId = useStore.getState().userId;
    const inAuthGroup = segments[0] === '(tabs)';
    if (!userId && inAuthGroup) {
      router.replace('/login');
    } else if (userId && !inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [authReady, segments, router]);

  if (!fontsLoaded || !authReady) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#f8f7ff',
        }}
      >
        <ActivityIndicator color="#8b5cf6" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  );
}
