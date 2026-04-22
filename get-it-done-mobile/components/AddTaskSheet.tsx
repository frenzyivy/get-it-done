import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { PRIORITIES } from '@/lib/constants';
import { useStore } from '@/lib/store';
import { TagPicker } from './TagPicker';
import { CategoryPicker } from './CategoryPicker';
import { ProjectPicker } from './ProjectPicker';
import { AiSuggestionPanel } from './AiSuggestionPanel';
import type { Priority, Status } from '@/types';

export interface AddTaskSheetHandle {
  open: (defaultStatus?: Status) => void;
  close: () => void;
}

export const AddTaskSheet = forwardRef<AddTaskSheetHandle>(function AddTaskSheet(
  _props,
  ref,
) {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [estimateMin, setEstimateMin] = useState<number | null>(null);
  const [pendingSubtasks, setPendingSubtasks] = useState<string[]>([]);
  const defaultStatusRef = useRef<Status>('todo');

  const tags = useStore((s) => s.tags);
  const addTask = useStore((s) => s.addTask);
  const addSubtask = useStore((s) => s.addSubtask);

  useImperativeHandle(ref, () => ({
    open: (defaultStatus = 'todo') => {
      defaultStatusRef.current = defaultStatus;
      setVisible(true);
    },
    close: () => setVisible(false),
  }));

  const reset = () => {
    setTitle('');
    setPriority('medium');
    setTagIds([]);
    setCategoryIds([]);
    setProjectIds([]);
    setDueDate(null);
    setEstimateMin(null);
    setPendingSubtasks([]);
    setVisible(false);
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const taskId = await addTask({
      title: trimmed,
      priority,
      tag_ids: tagIds,
      category_ids: categoryIds,
      project_ids: projectIds,
      due_date: dueDate ? dueDate.toISOString().slice(0, 10) : null,
      status: defaultStatusRef.current,
      estimated_seconds: estimateMin ? estimateMin * 60 : null,
    });
    if (taskId) {
      for (const sub of pendingSubtasks) {
        await addSubtask(taskId, sub);
      }
    }
    reset();
  };

  const onDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setPickerOpen(false);
    if (event.type === 'set' && date) setDueDate(date);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={reset}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'flex-end',
        }}
        onPress={reset}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#fff',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            paddingBottom: 32,
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
            New task
          </Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Task title…"
            placeholderTextColor="#aaa"
            autoFocus
            style={{
              fontSize: 15,
              fontWeight: '600',
              borderBottomWidth: 2,
              borderBottomColor: '#e5e7eb',
              paddingVertical: 8,
              marginBottom: 16,
            }}
          />

          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            Priority
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
              {PRIORITIES.map((p) => {
                const on = priority === p.value;
                return (
                  <Pressable
                    key={p.value}
                    onPress={() => setPriority(p.value)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: on ? p.bg : '#f3f4f6',
                      borderWidth: 1.5,
                      borderColor: on ? p.color : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        color: on ? p.color : '#666',
                        fontSize: 12,
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={{ marginBottom: 16 }}>
            <CategoryPicker selectedIds={categoryIds} onChange={setCategoryIds} />
          </View>

          <View style={{ marginBottom: 16 }}>
            <ProjectPicker selectedIds={projectIds} onChange={setProjectIds} />
          </View>

          <View style={{ marginBottom: 16 }}>
            <TagPicker tags={tags} selectedIds={tagIds} onChange={setTagIds} />
          </View>

          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            Due date
          </Text>
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1.5,
                borderColor: '#e5e7eb',
              }}
            >
              <Text style={{ fontSize: 13, color: dueDate ? '#1a1a2e' : '#aaa' }}>
                {dueDate
                  ? dueDate.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Pick a date'}
              </Text>
            </Pressable>
            {dueDate && (
              <Pressable onPress={() => setDueDate(null)} hitSlop={6}>
                <Text style={{ color: '#aaa', fontSize: 13 }}>Clear</Text>
              </Pressable>
            )}
          </View>
          {pickerOpen && (
            <DateTimePicker
              value={dueDate ?? new Date()}
              mode="date"
              onChange={onDateChange}
            />
          )}

          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            Estimate
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
              {[15, 25, 50, 60, 90, 120].map((m) => {
                const on = estimateMin === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setEstimateMin(on ? null : m)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      borderWidth: 1.5,
                      borderColor: on ? '#8b5cf6' : '#e5e7eb',
                      backgroundColor: on ? 'rgba(139,92,246,0.08)' : '#fff',
                    }}
                  >
                    <Text
                      style={{
                        color: on ? '#8b5cf6' : '#666',
                        fontSize: 12,
                        fontWeight: on ? '700' : '500',
                      }}
                    >
                      {m}m
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {pendingSubtasks.length > 0 && (
            <View
              style={{
                marginBottom: 12,
                padding: 10,
                borderRadius: 10,
                backgroundColor: '#f9fafb',
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Will add {pendingSubtasks.length} subtask{pendingSubtasks.length === 1 ? '' : 's'}
              </Text>
              {pendingSubtasks.map((s, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ fontSize: 13, color: '#374151', flex: 1 }}>• {s}</Text>
                  <Pressable
                    onPress={() =>
                      setPendingSubtasks((prev) => prev.filter((_, j) => j !== i))
                    }
                    hitSlop={6}
                  >
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <AiSuggestionPanel
            taskTitle={title}
            selectedTagIds={tagIds}
            selectedCategoryIds={categoryIds}
            selectedProjectIds={projectIds}
            onAcceptSubtasks={(titles) =>
              setPendingSubtasks((prev) => [...prev, ...titles])
            }
            onAcceptTags={(ids) =>
              setTagIds((prev) => Array.from(new Set([...prev, ...ids])))
            }
            onAcceptCategories={(ids) =>
              setCategoryIds((prev) => Array.from(new Set([...prev, ...ids])))
            }
            onAcceptProjects={(ids) =>
              setProjectIds((prev) => Array.from(new Set([...prev, ...ids])))
            }
            onAcceptEstimate={(seconds) => setEstimateMin(Math.round(seconds / 60))}
          />

          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              justifyContent: 'flex-end',
              marginTop: 16,
            }}
          >
            <Pressable
              onPress={reset}
              style={{ paddingHorizontal: 16, paddingVertical: 10 }}
            >
              <Text style={{ color: '#888', fontSize: 14, fontWeight: '600' }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!title.trim()}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: title.trim() ? '#8b5cf6' : '#ddd',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                Create
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});
