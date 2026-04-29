import { useState } from 'react';
import { View } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import { KanbanView } from '@/components/KanbanView';
import { PriorityView } from '@/components/PriorityView';

type Mode = 'status' | 'priority';

export default function BoardScreen() {
  const [mode, setMode] = useState<Mode>('status');
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <SegmentedButtons
          value={mode}
          onValueChange={(v) => setMode(v as Mode)}
          density="small"
          buttons={[
            { value: 'status', label: 'By status' },
            { value: 'priority', label: 'By priority' },
          ]}
        />
      </View>
      {mode === 'status' ? <KanbanView /> : <PriorityView />}
    </View>
  );
}
