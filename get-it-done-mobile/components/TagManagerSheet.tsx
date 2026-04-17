import { forwardRef, useImperativeHandle, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useStore } from '@/lib/store';
import { TAG_COLORS } from '@/lib/constants';

export interface TagManagerHandle {
  open: () => void;
  close: () => void;
}

export const TagManagerSheet = forwardRef<TagManagerHandle>(function TagManagerSheet(
  _props,
  ref,
) {
  const [visible, setVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const tags = useStore((s) => s.tags);
  const addTag = useStore((s) => s.addTag);
  const deleteTag = useStore((s) => s.deleteTag);

  useImperativeHandle(ref, () => ({
    open: () => setVisible(true),
    close: () => setVisible(false),
  }));

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const color = TAG_COLORS[tags.length % TAG_COLORS.length];
    await addTag(name, color);
    setNewName('');
  };

  const confirmDelete = (id: string, name: string) =>
    Alert.alert('Delete tag?', `"${name}" will be removed from all tasks.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTag(id) },
    ]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => setVisible(false)}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'flex-end',
        }}
        onPress={() => setVisible(false)}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#fff',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            paddingBottom: 32,
            maxHeight: '80%',
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: '#e5e7eb',
              marginBottom: 16,
            }}
          />
          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: '#1a1a2e',
              marginBottom: 14,
            }}
          >
            Manage tags
          </Text>

          <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled>
            {tags.map((t) => (
              <View
                key={t.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(0,0,0,0.06)',
                }}
              >
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: t.color,
                  }}
                />
                <Text style={{ flex: 1, fontSize: 14, color: '#1a1a2e' }}>
                  {t.name}
                </Text>
                <Pressable
                  onPress={() => confirmDelete(t.id, t.name)}
                  hitSlop={8}
                >
                  <Text style={{ color: '#ccc', fontSize: 18 }}>×</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>

          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              marginTop: 14,
              borderTopWidth: 1,
              borderTopColor: '#eee',
              paddingTop: 12,
            }}
          >
            <TextInput
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={create}
              placeholder="New tag name…"
              placeholderTextColor="#aaa"
              returnKeyType="done"
              style={{
                flex: 1,
                borderWidth: 1.5,
                borderColor: '#e5e7eb',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                fontSize: 13,
              }}
            />
            {newName.trim() !== '' && (
              <Pressable
                onPress={create}
                style={{
                  backgroundColor: '#8b5cf6',
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                  Add
                </Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});
