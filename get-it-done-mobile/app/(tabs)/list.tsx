import { useState } from 'react';
import { View } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import { ListView } from '@/components/ListView';
import { ListByProjectView } from '@/components/ListByProjectView';

type Mode = 'today' | 'by_project';

export default function ListScreen() {
  const [mode, setMode] = useState<Mode>('today');
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <SegmentedButtons
          value={mode}
          onValueChange={(v) => setMode(v as Mode)}
          density="small"
          buttons={[
            { value: 'today', label: 'Today' },
            { value: 'by_project', label: 'By project' },
          ]}
        />
      </View>
      {mode === 'today' ? <ListView /> : <ListByProjectView />}
    </View>
  );
}
