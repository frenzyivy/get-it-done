import { Text, View } from 'react-native';
import { CalendarDay } from './CalendarDay';
import type { DailyTargets } from '@/types';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  monthStart: Date;
  secondsByDay: Record<string, number>;
  targets: DailyTargets;
  cellSize: number;
}

// Phase 7 step C — month grid, RN port of web's CalendarGrid. 6 rows × 7
// columns; days outside the displayed month dim to 0.45.
export function CalendarGrid({ monthStart, secondsByDay, targets, cellSize }: Props) {
  const cells: { date: Date; inMonth: boolean }[] = [];

  const firstCell = new Date(monthStart);
  firstCell.setDate(monthStart.getDate() - monthStart.getDay());

  for (let i = 0; i < 42; i++) {
    const d = new Date(firstCell);
    d.setDate(firstCell.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === monthStart.getMonth() });
  }

  const today = new Date();
  const todayKey = ymd(today);

  return (
    <View
      style={{
        backgroundColor: '#1a1a2e',
        borderRadius: 18,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {WEEKDAY_LABELS.map((d) => (
          <View
            key={d}
            style={{
              width: cellSize,
              alignItems: 'center',
              marginRight: 4,
            }}
          >
            <Text
              style={{
                color: 'rgba(255,255,255,0.45)',
                fontSize: 9,
                letterSpacing: 1,
                fontWeight: '700',
                textTransform: 'uppercase',
              }}
            >
              {d}
            </Text>
          </View>
        ))}
      </View>

      {/* 6 rows × 7 cols */}
      {Array.from({ length: 6 }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row', marginBottom: row < 5 ? 4 : 0 }}>
          {cells.slice(row * 7, row * 7 + 7).map((cell) => {
            const key = ymd(cell.date);
            const seconds = secondsByDay[key] ?? 0;
            const target = targetHoursFor(cell.date, targets);
            return (
              <View key={key} style={{ marginRight: 4 }}>
                <CalendarDay
                  date={cell.date}
                  inMonth={cell.inMonth}
                  isToday={key === todayKey}
                  secondsLogged={seconds}
                  targetHours={target}
                  size={cellSize}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function targetHoursFor(date: Date, t: DailyTargets): number {
  switch (date.getDay()) {
    case 0:
      return t.sun;
    case 1:
      return t.mon;
    case 2:
      return t.tue;
    case 3:
      return t.wed;
    case 4:
      return t.thu;
    case 5:
      return t.fri;
    case 6:
      return t.sat;
    default:
      return 0;
  }
}
