import { useState } from 'react';
import { View } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import { ScheduleView } from '@/components/ScheduleView';
import { CalendarView } from '@/components/CalendarView';
import { TimelineDayView } from '@/components/TimelineDayView';

type Mode = 'day' | 'timeline' | 'calendar';

export default function ScheduleScreen() {
  const [mode, setMode] = useState<Mode>('day');
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <SegmentedButtons
          value={mode}
          onValueChange={(v) => setMode(v as Mode)}
          density="small"
          buttons={[
            { value: 'day', label: 'Day' },
            { value: 'timeline', label: 'Timeline' },
            { value: 'calendar', label: 'Calendar' },
          ]}
        />
      </View>
      {mode === 'day' ? (
        <ScheduleView />
      ) : mode === 'timeline' ? (
        <TimelineDayView />
      ) : (
        <CalendarView />
      )}
    </View>
  );
}
