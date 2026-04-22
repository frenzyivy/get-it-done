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
import type { ProjectStatus, ProjectType } from '@/types';

export interface ProjectManagerHandle {
  open: () => void;
  close: () => void;
}

const STATUSES: ProjectStatus[] = ['active', 'paused', 'archived'];

export const ProjectManagerSheet = forwardRef<ProjectManagerHandle>(
  function ProjectManagerSheet(_props, ref) {
    const [visible, setVisible] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState<string>(TAG_COLORS[2]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState<string>(TAG_COLORS[2]);

    const projects = useStore((s) => s.projects);
    const addProject = useStore((s) => s.addProject);
    const updateProject = useStore((s) => s.updateProject);
    const deleteProject = useStore((s) => s.deleteProject);

    useImperativeHandle(ref, () => ({
      open: () => setVisible(true),
      close: () => setVisible(false),
    }));

    const create = async () => {
      const name = newName.trim();
      if (!name) return;
      try {
        await addProject(name, newColor, 'active');
        setNewName('');
      } catch (err) {
        Alert.alert(
          'Failed to create',
          err instanceof Error ? err.message : 'Unknown error',
        );
      }
    };

    const startEdit = (p: ProjectType) => {
      setEditingId(p.id);
      setEditName(p.name);
      setEditColor(p.color);
    };

    const saveEdit = async (id: string) => {
      const name = editName.trim();
      if (!name) return;
      try {
        await updateProject(id, { name, color: editColor });
        setEditingId(null);
      } catch (err) {
        Alert.alert(
          'Failed to save',
          err instanceof Error ? err.message : 'Unknown error',
        );
      }
    };

    const cycleStatus = (p: ProjectType) => {
      const next = STATUSES[(STATUSES.indexOf(p.status) + 1) % STATUSES.length];
      void updateProject(p.id, { status: next });
    };

    const confirmDelete = (p: ProjectType) =>
      Alert.alert('Delete project?', `"${p.name}" will be removed from all tasks.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteProject(p.id),
        },
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
              maxHeight: '85%',
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
              ★ Manage projects
            </Text>

            <ScrollView style={{ maxHeight: 380 }} nestedScrollEnabled>
              {projects.length === 0 && (
                <Text style={{ color: '#9ca3af', fontSize: 13, paddingVertical: 10 }}>
                  No projects yet.
                </Text>
              )}
              {projects.map((p) => {
                const editing = editingId === p.id;
                const faded = p.status === 'archived';
                return (
                  <View
                    key={p.id}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: 'rgba(0,0,0,0.06)',
                      opacity: faded ? 0.6 : 1,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 6,
                          backgroundColor: editing ? editColor : p.color,
                        }}
                      />
                      {editing ? (
                        <TextInput
                          value={editName}
                          onChangeText={setEditName}
                          onSubmitEditing={() => saveEdit(p.id)}
                          style={{
                            flex: 1,
                            fontSize: 14,
                            borderBottomWidth: 1,
                            borderBottomColor: '#8b5cf6',
                            paddingVertical: 2,
                          }}
                        />
                      ) : (
                        <Text style={{ flex: 1, fontSize: 14, color: '#1a1a2e' }}>
                          {p.name}
                        </Text>
                      )}
                      {!editing && (
                        <Pressable
                          onPress={() => cycleStatus(p)}
                          hitSlop={6}
                          style={{
                            backgroundColor: '#f3f4f6',
                            borderRadius: 6,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '700',
                              color: '#6b7280',
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                            }}
                          >
                            {p.status}
                          </Text>
                        </Pressable>
                      )}
                      {editing ? (
                        <>
                          <Pressable onPress={() => saveEdit(p.id)} hitSlop={6}>
                            <Text style={{ color: '#8b5cf6', fontWeight: '700', fontSize: 13 }}>
                              Save
                            </Text>
                          </Pressable>
                          <Pressable onPress={() => setEditingId(null)} hitSlop={6}>
                            <Text style={{ color: '#888', fontSize: 13 }}>Cancel</Text>
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <Pressable onPress={() => startEdit(p)} hitSlop={6}>
                            <Text style={{ color: '#8b5cf6', fontWeight: '700', fontSize: 13 }}>
                              Edit
                            </Text>
                          </Pressable>
                          <Pressable onPress={() => confirmDelete(p)} hitSlop={6}>
                            <Text style={{ color: '#dc2626', fontSize: 13 }}>Delete</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                    {editing && (
                      <View
                        style={{
                          flexDirection: 'row',
                          gap: 6,
                          marginTop: 8,
                          paddingLeft: 22,
                        }}
                      >
                        {TAG_COLORS.slice(0, 10).map((color) => (
                          <Pressable
                            key={color}
                            onPress={() => setEditColor(color)}
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 9,
                              backgroundColor: color,
                              borderWidth: editColor === color ? 2 : 0,
                              borderColor: '#1a1a2e',
                            }}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <View
              style={{
                marginTop: 14,
                borderTopWidth: 1,
                borderTopColor: '#eee',
                paddingTop: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: '#888',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 8,
                }}
              >
                Add new
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  onSubmitEditing={create}
                  placeholder="Project name…"
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
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                {TAG_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setNewColor(color)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: color,
                      borderWidth: newColor === color ? 2 : 0,
                      borderColor: '#1a1a2e',
                    }}
                  />
                ))}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  },
);
