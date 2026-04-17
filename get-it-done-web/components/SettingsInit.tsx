'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';

// Dashboard normally calls fetchAll(), which also hydrates prefs + rules.
// The Settings page can be opened directly, so we initialize the store the
// same way here and skip task/tag fetches we don't need on this screen.
export function SettingsInit({ userId }: { userId: string }) {
  const setUserId = useStore((s) => s.setUserId);
  const fetchPrefs = useStore((s) => s.fetchPrefs);
  const fetchRules = useStore((s) => s.fetchRules);
  const fetchNotifications = useStore((s) => s.fetchNotifications);

  useEffect(() => {
    setUserId(userId);
    void fetchPrefs();
    void fetchRules();
    void fetchNotifications();
  }, [userId, setUserId, fetchPrefs, fetchRules, fetchNotifications]);

  return null;
}
