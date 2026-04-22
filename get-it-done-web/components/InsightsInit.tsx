'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';

export function InsightsInit({ userId }: { userId: string }) {
  const setUserId = useStore((s) => s.setUserId);
  const fetchInsights = useStore((s) => s.fetchInsights);

  useEffect(() => {
    setUserId(userId);
    void fetchInsights();
  }, [userId, setUserId, fetchInsights]);

  return null;
}
