import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { PRIORITIES } from '@/lib/constants';
import { useStore } from '@/lib/store';
import { todayISO, tomorrowISO } from '@/lib/utils';
import { TagPicker } from './TagPicker';
import { CategoryPicker } from './CategoryPicker';
import { ProjectPicker } from './ProjectPicker';
import type { Priority, SubtaskType } from '@/types';

// Feature 3 (mobile) — full edit sheet. Mirrors the web EditTaskDrawer:
// title, description, priority, due date, estimate, tags, subtask CRUD/reorder.
//
// API uses the same forwardRef pattern as AddTaskSheet/NotificationSheet so the
// parent screen owns one instance and just calls `open(taskId)` on it.
export interface EditTaskSheetHandle {
  open: (taskId: string) => void;
  close: () => void;
}

export const EditTaskSheet = forwardRef<EditTaskSheetHandle>(function EditTaskSheet(
  _props,
  ref,
) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const visible = taskId !== null;

  useImperativeHandle(ref, () => ({
    open: (id: string) => setTaskId(id),
    close: () => setTaskId(null),
  }));

  // We render the inner editor only while `taskId` is set. The `key` prop on
  // the inner component remounts it (and reseeds form state) per task.
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => setTaskId(null)}
    >
      {taskId && (
        <EditTaskSheetInner
          key={taskId}
          taskId={taskId}
          onClose={() => setTaskId(null)}
        />
      )}
    </Modal>
  );
});

function EditTaskSheetInner({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId));
  const tags = useStore((s) => s.tags);
  const updateTask = useStore((s) => s.updateTask);
  const updateTaskTags = useStore((s) => s.updateTaskTags);
  const updateTaskCategories = useStore((s) => s.updateTaskCategories);
  const updateTaskProjects = useStore((s) => s.updateTaskProjects);
  const addSubtask = useStore((s) => s.addSubtask);
  const renameSubtask = useStore((s) => s.renameSubtask);
  const deleteSubtask = useStore((s) => s.deleteSubtask);
  const reorderSubtasks = useStore((s) => s.reorderSubtasks);

  // Seed form state from the current task. Because EditTaskSheetInner is keyed
  // on `taskId`, the initializers run once per opened task — no useEffect.
  const initialDueDate = useMemo(
    () => (task?.due_date ? new Date(task.due_date) : null),
    [task?.due_date],
  );
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState<Date | null>(initialDueDate);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [estimateMin, setEstimateMin] = useState<number | null>(
    task?.estimated_seconds ? Math.round(task.estimated_seconds / 60) : null,
  );
  const [tagIds, setTagIds] = useState<string[]>(task?.tag_ids ?? []);
  const [categoryIds, setCategoryIds] = useState<string[]>(task?.category_ids ?? []);
  const [projectIds, setProjectIds] = useState<string[]>(task?.project_ids ?? []);
  const [allowAlarms, setAllowAlarms] = useState<boolean>(task?.allow_alarms ?? false);
  const [plannedForDate, setPlannedForDate] = useState<string>(
    task?.planned_for_date ?? '',
  );
  const [newSub, setNewSub] = useState('');

  if (!task) {
    return null;
  }

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await updateTask(task.id, {
      title: trimmed,
      description: description.trim() || null,
      priority,
      due_date: dueDate ? dueDate.toISOString().slice(0, 10) : null,
      estimated_seconds: estimateMin ? estimateMin * 60 : null,
      allow_alarms: allowAlarms,
      planned_for_date: plannedForDate || null,
    });
    if (
      tagIds.length !== task.tag_ids.length ||
      tagIds.some((id) => !task.tag_ids.includes(id))
    ) {
      await updateTaskTags(task.id, tagIds);
    }
    if (
      categoryIds.length !== task.category_ids.length ||
      categoryIds.some((id) => !task.category_ids.includes(id))
    ) {
      await updateTaskCategories(task.id, categoryIds);
    }
    if (
      projectIds.length !== task.project_ids.length ||
      projectIds.some((id) => !task.project_ids.includes(id))
    ) {
      await updateTaskProjects(task.id, projectIds);
    }
    onClose();
  };

  const handleAddSub = async () => {
    const t = newSub.trim();
    if (!t) return;
    await addSubtask(task.id, t);
    setNewSub('');
  };

  const handleDeleteSub = (sub: SubtaskType) => {
    const doDelete = () => deleteSubtask(task.id, sub.id);
    if (sub.total_time_seconds > 0) {
      Alert.alert(
        'Delete subtask?',
        'This subtask has tracked time. Delete anyway? Time entries will be kept but unlinked from the subtask.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ],
      );
    } else {
      doDelete();
    }
  };

  const onDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setPickerOpen(false);
    if (event.type === 'set' && date) setDueDate(date);
  };

  const isOverduePast =
    dueDate && dueDate < new Date(new Date().toDateString());

  const renderSubtaskRow = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<SubtaskType>) => (
    <SubtaskEditRow
      subtask={item}
      drag={drag}
      isActive={isActive}
      onRename={(t) => renameSubtask(task.id, item.id, t)}
      onDelete={() => handleDeleteSub(item)}
    />
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'flex-end',
        }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#fff',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 12,
            paddingBottom: 16,
            maxHeight: '90%',
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: '#e5e7eb',
              marginBottom: 8,
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingBottom: 10,
              borderBottomWidth: 1,
              borderBottomColor: '#eee',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '800',
                color: '#1a1a2e',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Edit task
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={{ color: '#aaa', fontSize: 22 }}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 14 }}
            keyboardShouldPersistTaps="handled"
          >
            <Field label="Title">
              <TextInput
                value={title}
                onChangeText={setTitle}
                style={inputStyle}
              />
            </Field>

            <Field label="Description">
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Optional notes…"
                placeholderTextColor="#aaa"
                multiline
                numberOfLines={3}
                style={[inputStyle, { minHeight: 70, textAlignVertical: 'top' }]}
              />
            </Field>

            <Field label="Priority">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
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
                          }}
                        >
                          {p.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </Field>

            <Field label="Estimate">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[15, 25, 50, 60, 90, 120, 180, 240].map((m) => {
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
                          {m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </Field>

            <Field label="Due date">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                {isOverduePast && (
                  <View
                    style={{
                      backgroundColor: '#fee2e2',
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#dc2626' }}>
                      OVERDUE
                    </Text>
                  </View>
                )}
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
            </Field>

            {/* "Plan for date" — Today's 5 entry point from the edit sheet */}
            <Field label="Plan for date">
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Pressable
                  onPress={() => setPlannedForDate(todayISO())}
                  style={{
                    backgroundColor:
                      plannedForDate === todayISO()
                        ? '#8b5cf6'
                        : 'rgba(139,92,246,0.08)',
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color:
                        plannedForDate === todayISO() ? '#fff' : '#8b5cf6',
                    }}
                  >
                    Today
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPlannedForDate(tomorrowISO())}
                  style={{
                    backgroundColor:
                      plannedForDate === tomorrowISO()
                        ? '#3b82f6'
                        : 'rgba(59,130,246,0.08)',
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color:
                        plannedForDate === tomorrowISO() ? '#fff' : '#3b82f6',
                    }}
                  >
                    Tomorrow
                  </Text>
                </Pressable>
                {plannedForDate && (
                  <Pressable
                    onPress={() => setPlannedForDate('')}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 6,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: '#aaa' }}>Clear</Text>
                  </Pressable>
                )}
                {plannedForDate && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: '#888',
                      alignSelf: 'center',
                    }}
                  >
                    {plannedForDate}
                  </Text>
                )}
              </View>
            </Field>

            <CategoryPicker selectedIds={categoryIds} onChange={setCategoryIds} />
            <ProjectPicker selectedIds={projectIds} onChange={setProjectIds} />
            <TagPicker tags={tags} selectedIds={tagIds} onChange={setTagIds} />

            {/* Feature 5 — per-task alarm passthrough during Strict Zone */}
            <Pressable
              onPress={() => setAllowAlarms((v) => !v)}
              style={{
                flexDirection: 'row',
                gap: 10,
                alignItems: 'center',
                paddingVertical: 4,
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  borderWidth: allowAlarms ? 0 : 2,
                  borderColor: '#ccc',
                  backgroundColor: allowAlarms ? '#8b5cf6' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {allowAlarms && (
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                    ✓
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1a2e' }}>
                  Allow alarms during focus
                </Text>
                <Text style={{ fontSize: 11, color: '#888' }}>
                  Scheduled alerts for this task still ring in Strict Zone.
                </Text>
              </View>
            </Pressable>

            <View>
              <Text style={labelStyle}>Subtasks ({task.subtasks.length})</Text>
              <View style={{ height: Math.max(80, task.subtasks.length * 44) }}>
                <DraggableFlatList
                  data={task.subtasks}
                  keyExtractor={(s) => s.id}
                  renderItem={renderSubtaskRow}
                  onDragEnd={({ data }) =>
                    void reorderSubtasks(task.id, data.map((s) => s.id))
                  }
                  activationDistance={10}
                  scrollEnabled={false}
                />
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  marginTop: 8,
                  alignItems: 'center',
                }}
              >
                <TextInput
                  value={newSub}
                  onChangeText={setNewSub}
                  onSubmitEditing={handleAddSub}
                  returnKeyType="done"
                  placeholder="Add subtask…"
                  placeholderTextColor="#aaa"
                  style={[inputStyle, { flex: 1, marginBottom: 0 }]}
                />
                <Pressable
                  onPress={handleAddSub}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: 'rgba(139,92,246,0.1)',
                  }}
                >
                  <Text style={{ color: '#8b5cf6', fontSize: 12, fontWeight: '700' }}>
                    + Add
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: 10,
              paddingHorizontal: 20,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: '#eee',
              backgroundColor: '#fafafa',
            }}
          >
            <Pressable
              onPress={onClose}
              style={{ paddingHorizontal: 16, paddingVertical: 10 }}
            >
              <Text style={{ color: '#666', fontSize: 14, fontWeight: '700' }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!title.trim()}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: title.trim() ? '#8b5cf6' : '#ddd',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                Save
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={labelStyle}>{label}</Text>
      {children}
    </View>
  );
}

function SubtaskEditRow({
  subtask,
  drag,
  isActive,
  onRename,
  onDelete,
}: {
  subtask: SubtaskType;
  drag: () => void;
  isActive: boolean;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(subtask.title);

  const commit = () => {
    const t = val.trim();
    if (t && t !== subtask.title) onRename(t);
    setEditing(false);
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 8,
        paddingVertical: 8,
        backgroundColor: isActive ? '#f3eaff' : '#fafafa',
        borderRadius: 8,
        marginBottom: 4,
      }}
    >
      <Pressable onLongPress={drag} delayLongPress={150} hitSlop={6}>
        <Text style={{ color: '#bbb', fontSize: 16 }}>⋮⋮</Text>
      </Pressable>
      {editing ? (
        <TextInput
          value={val}
          autoFocus
          onChangeText={setVal}
          onBlur={commit}
          onSubmitEditing={commit}
          returnKeyType="done"
          style={{
            flex: 1,
            fontSize: 13,
            paddingVertical: 2,
            borderBottomWidth: 1.5,
            borderBottomColor: '#8b5cf6',
          }}
        />
      ) : (
        <Pressable
          onPress={() => setEditing(true)}
          style={{ flex: 1 }}
          hitSlop={4}
        >
          <Text
            style={{
              fontSize: 13,
              color: subtask.is_done ? '#aaa' : '#333',
              textDecorationLine: subtask.is_done ? 'line-through' : 'none',
            }}
          >
            {subtask.title}
          </Text>
        </Pressable>
      )}
      <Pressable onPress={onDelete} hitSlop={8}>
        <Text style={{ color: '#ccc', fontSize: 18 }}>×</Text>
      </Pressable>
    </View>
  );
}

const inputStyle = {
  borderWidth: 1.5,
  borderColor: '#e5e7eb',
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 8,
  fontSize: 14,
  marginBottom: 0,
} as const;

const labelStyle = {
  fontSize: 11,
  fontWeight: '800' as const,
  color: '#888',
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
  marginBottom: 6,
};
