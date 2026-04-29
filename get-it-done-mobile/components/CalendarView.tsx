import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useStore } from '@/lib/store';
import { CalendarGrid } from './CalendarGrid';

// Phase 7 step C — Calendar view on mobile. Read-only month grid with
// previous / next / today nav. Reuses the same `dailyTargets` and
// `secondsByDay` store wiring as web. Editor + weekly strip + legend
// deferred — Komal can edit targets via web for now.

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addMonths(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setMonth(d.getMonth() + delta);
  return next;
}

export function CalendarView() {
  const dailyTargets = useStore((s) => s.dailyTargets);
  const fetchDailyTargets = useStore((s) => s.fetchDailyTargets);
  const secondsByDay = useStore((s) => s.secondsByDay);
  const fetchSessionsByDay = useStore((s) => s.fetchSessionsByDay);

  const [monthStart, setMonthStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  useEffect(() => {
    if (!dailyTargets) void fetchDailyTargets();
  }, [dailyTargets, fetchDailyTargets]);

  useEffect(() => {
    const fromDate = new Date(monthStart);
    fromDate.setDate(monthStart.getDate() - 7);
    const toDate = new Date(monthStart);
    toDate.setMonth(monthStart.getMonth() + 1);
    toDate.setDate(7);
    void fetchSessionsByDay(ymd(fromDate), ymd(toDate));
  }, [monthStart, fetchSessionsByDay]);

  const monthLabel = useMemo(
    () =>
      monthStart.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [monthStart],
  );

  // Cell size derived from the screen width. 7 cells across with margins.
  // Subtract container padding (32) + grid padding (28) + 6 inter-cell gaps
  // (24) = ~84px overhead, divide remainder by 7.
  const screenW = Dimensions.get('window').width;
  const cellSize = Math.floor((screenW - 84) / 7);

  if (!dailyTargets) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <ActivityIndicator size="small" />
        <Text style={{ marginTop: 8, color: '#9ca3af', fontSize: 12 }}>
          Loading calendar…
        </Text>
      </View>
    );
  }

  const todayMonth = (() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const isOnCurrentMonth = monthStart.getTime() === todayMonth.getTime();

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Month nav row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          onPress={() => setMonthStart(addMonths(monthStart, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 8,
            borderWidth: 1.5,
            borderColor: '#e5e7eb',
            backgroundColor: '#fff',
          }}
        >
          <Text style={{ color: '#1a1a2e', fontWeight: '700' }}>←</Text>
        </Pressable>
        <Text
          style={{
            color: '#1a1a2e',
            fontSize: 14,
            fontWeight: '800',
            flex: 1,
          }}
        >
          {monthLabel}
        </Text>
        <Pressable
          onPress={() => setMonthStart(addMonths(monthStart, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 8,
            borderWidth: 1.5,
            borderColor: '#e5e7eb',
            backgroundColor: '#fff',
          }}
        >
          <Text style={{ color: '#1a1a2e', fontWeight: '700' }}>→</Text>
        </Pressable>
        {!isOnCurrentMonth && (
          <Pressable
            onPress={() => setMonthStart(todayMonth)}
            accessibilityRole="button"
            accessibilityLabel="Jump to current month"
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <Text
              style={{
                color: '#9ca3af',
                fontSize: 11,
                textDecorationLine: 'underline',
              }}
            >
              today
            </Text>
          </Pressable>
        )}
      </View>

      <CalendarGrid
        monthStart={monthStart}
        secondsByDay={secondsByDay}
        targets={dailyTargets}
        cellSize={cellSize}
      />

      {/* Compact legend */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 4 }}>
        <LegendItem label="Goal hit" hint="full ring" />
        <LegendItem label="Partial" hint="arc" />
        <LegendItem label="Exceeded" hint="thick + glow" />
        <LegendItem label="Rest day" hint="dim" />
      </View>
    </ScrollView>
  );
}

function LegendItem({ label, hint }: { label: string; hint: string }) {
  return (
    <View>
      <Text
        style={{
          color: '#1a1a2e',
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <Text style={{ color: '#9ca3af', fontSize: 9 }}>{hint}</Text>
    </View>
  );
}
