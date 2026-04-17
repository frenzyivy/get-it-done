import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

export function AddSubtask({ onAdd }: { onAdd: (title: string) => void }) {
  const [val, setVal] = useState('');
  const submit = () => {
    const next = val.trim();
    if (!next) return;
    onAdd(next);
    setVal('');
  };

  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
      <TextInput
        value={val}
        onChangeText={setVal}
        onSubmitEditing={submit}
        placeholder="+ Add subtask…"
        placeholderTextColor="#aaa"
        returnKeyType="done"
        style={{
          flex: 1,
          borderWidth: 1.5,
          borderColor: '#e5e7eb',
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
          fontSize: 13,
          backgroundColor: '#fafafa',
        }}
      />
      {val.trim() !== '' && (
        <Pressable
          onPress={submit}
          style={{
            backgroundColor: '#8b5cf6',
            borderRadius: 8,
            paddingHorizontal: 12,
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Add</Text>
        </Pressable>
      )}
    </View>
  );
}
