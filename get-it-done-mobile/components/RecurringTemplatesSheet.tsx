import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
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
import type {
  NewRecurringTemplateInput,
  Priority,
  RecurringFrequency,
  RecurringTemplate,
} from '@/types';

export interface RecurringTemplatesHandle {
  open: () => void;
  close: () => void;
}

const FREQUENCIES: { id: RecurringFrequency; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

function emptyInput(): NewRecurringTemplateInput {
  return {
    title: '',
    priority: 'medium',
    tag_ids: [],
    subtask_titles: [],
    frequency: 'daily',
    day_of_week: null,
    day_of_month: null,
    hour_local: 8,
    is_enabled: true,
  };
}

function describeSchedule(t: RecurringTemplate): string {
  const hh = String(t.hour_local).padStart(2, '0');
  switch (t.frequency) {
    case 'daily':
      return `Every day at ${hh}:00`;
    case 'weekdays':
      return `Weekdays at ${hh}:00`;
    case 'weekly':
      return `Every ${DAYS_OF_WEEK[t.day_of_week ?? 1]} at ${hh}:00`;
    case 'monthly':
      return `Day ${t.day_of_month ?? 1} of each month at ${hh}:00`;
  }
}

type EditState =
  | { mode: 'list' }
  | { mode: 'new'; draft: NewRecurringTemplateInput }
  | { mode: 'edit'; id: string; draft: NewRecurringTemplateInput };

export const RecurringTemplatesSheet = forwardRef<RecurringTemplatesHandle>(
  function RecurringTemplatesSheet(_props, ref) {
    const [visible, setVisible] = useState(false);
    const [edit, setEdit] = useState<EditState>({ mode: 'list' });

    const templates = useStore((s) => s.recurringTemplates);
    const tags = useStore((s) => s.tags);
    const fetchRecurringTemplates = useStore((s) => s.fetchRecurringTemplates);
    const addRecurringTemplate = useStore((s) => s.addRecurringTemplate);
    const updateRecurringTemplate = useStore(
      (s) => s.updateRecurringTemplate,
    );
    const deleteRecurringTemplate = useStore(
      (s) => s.deleteRecurringTemplate,
    );
    const toggleRecurringTemplate = useStore(
      (s) => s.toggleRecurringTemplate,
    );

    useImperativeHandle(ref, () => ({
      open: () => {
        setEdit({ mode: 'list' });
        setVisible(true);
      },
      close: () => setVisible(false),
    }));

    useEffect(() => {
      if (visible) void fetchRecurringTemplates();
    }, [visible, fetchRecurringTemplates]);

    const title = useMemo(() => {
      if (edit.mode === 'new') return 'New recurring template';
      if (edit.mode === 'edit') return 'Edit template';
      return 'Recurring templates';
    }, [edit.mode]);

    const confirmDelete = (t: RecurringTemplate) => {
      Alert.alert(
        'Delete template?',
        `"${t.title}" will no longer create tasks. Already-created tasks stay.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => deleteRecurringTemplate(t.id),
          },
        ],
      );
    };

    const save = async () => {
      if (edit.mode === 'list') return;
      const d = edit.draft;
      if (!d.title.trim()) return;
      const payload: NewRecurringTemplateInput = {
        ...d,
        title: d.title.trim(),
        day_of_week: d.frequency === 'weekly' ? d.day_of_week ?? 1 : null,
        day_of_month: d.frequency === 'monthly' ? d.day_of_month ?? 1 : null,
        subtask_titles: d.subtask_titles.map((x) => x.trim()).filter(Boolean),
      };
      if (edit.mode === 'new') {
        await addRecurringTemplate(payload);
      } else {
        await updateRecurringTemplate(edit.id, payload);
      }
      setEdit({ mode: 'list' });
    };

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
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}
          onPress={() => setVisible(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 20,
              paddingTop: 14,
              paddingBottom: 28,
              maxHeight: '92%',
            }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                backgroundColor: '#E5E5E5',
                borderRadius: 2,
                alignSelf: 'center',
                marginBottom: 12,
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              {edit.mode !== 'list' ? (
                <Pressable
                  onPress={() => setEdit({ mode: 'list' })}
                  hitSlop={8}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#8b5cf6',
                      fontWeight: '700',
                    }}
                  >
                    ← Back
                  </Text>
                </Pressable>
              ) : (
                <View style={{ width: 40 }} />
              )}
              <Text
                style={{ fontSize: 18, fontWeight: '800', color: '#1a1a2e' }}
              >
                {title}
              </Text>
              {edit.mode === 'list' ? (
                <Pressable
                  onPress={() =>
                    setEdit({ mode: 'new', draft: emptyInput() })
                  }
                  hitSlop={8}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#8b5cf6',
                      fontWeight: '700',
                    }}
                  >
                    + New
                  </Text>
                </Pressable>
              ) : (
                <View style={{ width: 40 }} />
              )}
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {edit.mode === 'list' ? (
                <ListBody
                  templates={templates}
                  onToggle={(id, v) => toggleRecurringTemplate(id, v)}
                  onEdit={(t) =>
                    setEdit({
                      mode: 'edit',
                      id: t.id,
                      draft: {
                        title: t.title,
                        priority: t.priority,
                        tag_ids: t.tag_ids,
                        subtask_titles: t.subtask_titles,
                        frequency: t.frequency,
                        day_of_week: t.day_of_week,
                        day_of_month: t.day_of_month,
                        hour_local: t.hour_local,
                        is_enabled: t.is_enabled,
                      },
                    })
                  }
                  onDelete={confirmDelete}
                />
              ) : (
                <EditorBody
                  draft={edit.draft}
                  setDraft={(draft) => {
                    if (edit.mode === 'new')
                      setEdit({ mode: 'new', draft });
                    else setEdit({ mode: 'edit', id: edit.id, draft });
                  }}
                  tags={tags}
                  onSave={save}
                  onCancel={() => setEdit({ mode: 'list' })}
                  isNew={edit.mode === 'new'}
                />
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  },
);

function ListBody({
  templates,
  onToggle,
  onEdit,
  onDelete,
}: {
  templates: RecurringTemplate[];
  onToggle: (id: string, v: boolean) => void;
  onEdit: (t: RecurringTemplate) => void;
  onDelete: (t: RecurringTemplate) => void;
}) {
  if (templates.length === 0) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <Text
          style={{
            fontSize: 13,
            color: '#888',
            textAlign: 'center',
            paddingHorizontal: 24,
          }}
        >
          No recurring templates yet. Tap{' '}
          <Text style={{ fontWeight: '700' }}>+ New</Text> to create one that
          auto-generates tasks on a schedule.
        </Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {templates.map((t) => (
        <View
          key={t.id}
          style={{
            backgroundColor: '#F6F3F9',
            borderRadius: 14,
            padding: 14,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '800',
                color: '#1a1a2e',
                flex: 1,
              }}
              numberOfLines={1}
            >
              {t.title}
            </Text>
            <Pressable
              onPress={() => onToggle(t.id, !t.is_enabled)}
              hitSlop={8}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: t.is_enabled ? '#8b5cf6' : '#d1d5db',
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: '800',
                  letterSpacing: 0.5,
                }}
              >
                {t.is_enabled ? 'ACTIVE' : 'PAUSED'}
              </Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            {describeSchedule(t)} · {t.priority}
            {t.subtask_titles.length > 0
              ? ` · ${t.subtask_titles.length} subtask${t.subtask_titles.length === 1 ? '' : 's'}`
              : ''}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              gap: 16,
              marginTop: 10,
            }}
          >
            <Pressable onPress={() => onEdit(t)} hitSlop={6}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  color: '#7c3aed',
                }}
              >
                Edit
              </Text>
            </Pressable>
            <Pressable onPress={() => onDelete(t)} hitSlop={6}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  color: '#e5447a',
                }}
              >
                Delete
              </Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

function EditorBody({
  draft,
  setDraft,
  tags,
  onSave,
  onCancel,
  isNew,
}: {
  draft: NewRecurringTemplateInput;
  setDraft: (d: NewRecurringTemplateInput) => void;
  tags: { id: string; name: string; color: string }[];
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  return (
    <View style={{ gap: 14 }}>
      <Field label="TITLE">
        <TextInput
          value={draft.title}
          onChangeText={(title) => setDraft({ ...draft, title })}
          placeholder="e.g. Review weekly numbers"
          placeholderTextColor="#999"
          style={{
            borderWidth: 1,
            borderColor: '#E5E5E5',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 14,
            color: '#1a1a2e',
          }}
        />
      </Field>

      <Field label="FREQUENCY">
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {FREQUENCIES.map((f) => {
            const active = draft.frequency === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setDraft({ ...draft, frequency: f.id })}
                style={{
                  borderWidth: 2,
                  borderColor: active ? '#8b5cf6' : '#E5E5E5',
                  backgroundColor: active ? '#F5F2FF' : '#fff',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: active ? '#8b5cf6' : '#333',
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      {draft.frequency === 'weekly' && (
        <Field label="DAY OF WEEK">
          <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
            {DAYS_OF_WEEK.map((label, idx) => {
              const active = draft.day_of_week === idx;
              return (
                <Pressable
                  key={label}
                  onPress={() => setDraft({ ...draft, day_of_week: idx })}
                  style={{
                    width: 44,
                    height: 36,
                    borderWidth: 2,
                    borderColor: active ? '#8b5cf6' : '#E5E5E5',
                    backgroundColor: active ? '#F5F2FF' : '#fff',
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: active ? '#8b5cf6' : '#333',
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>
      )}

      {draft.frequency === 'monthly' && (
        <Field label="DAY OF MONTH">
          <TextInput
            value={String(draft.day_of_month ?? 1)}
            onChangeText={(txt) => {
              const n = Math.min(31, Math.max(1, parseInt(txt, 10) || 1));
              setDraft({ ...draft, day_of_month: n });
            }}
            keyboardType="number-pad"
            style={{
              borderWidth: 1,
              borderColor: '#E5E5E5',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14,
              color: '#1a1a2e',
              width: 100,
            }}
          />
        </Field>
      )}

      <Field label="HOUR (YOUR LOCAL TIME)">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingRight: 20 }}
        >
          {Array.from({ length: 24 }, (_, i) => {
            const active = draft.hour_local === i;
            return (
              <Pressable
                key={i}
                onPress={() => setDraft({ ...draft, hour_local: i })}
                style={{
                  borderWidth: 2,
                  borderColor: active ? '#8b5cf6' : '#E5E5E5',
                  backgroundColor: active ? '#F5F2FF' : '#fff',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: active ? '#8b5cf6' : '#333',
                  }}
                >
                  {String(i).padStart(2, '0')}:00
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Field>

      <Field label="PRIORITY">
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {PRIORITIES.map((p) => {
            const active = draft.priority === p;
            return (
              <Pressable
                key={p}
                onPress={() => setDraft({ ...draft, priority: p })}
                style={{
                  borderWidth: 2,
                  borderColor: active ? '#8b5cf6' : '#E5E5E5',
                  backgroundColor: active ? '#F5F2FF' : '#fff',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: active ? '#8b5cf6' : '#333',
                    textTransform: 'capitalize',
                  }}
                >
                  {p}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      {tags.length > 0 && (
        <Field label="TAGS">
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {tags.map((tag) => {
              const active = draft.tag_ids.includes(tag.id);
              return (
                <Pressable
                  key={tag.id}
                  onPress={() => {
                    const next = active
                      ? draft.tag_ids.filter((x) => x !== tag.id)
                      : [...draft.tag_ids, tag.id];
                    setDraft({ ...draft, tag_ids: next });
                  }}
                  style={{
                    borderWidth: 2,
                    borderColor: active ? tag.color : '#E5E5E5',
                    backgroundColor: active ? tag.color : '#fff',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: active ? '#fff' : '#333',
                    }}
                  >
                    {tag.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>
      )}

      <Field label="SUBTASKS (ONE PER LINE, OPTIONAL)">
        <TextInput
          value={draft.subtask_titles.join('\n')}
          onChangeText={(txt) =>
            setDraft({ ...draft, subtask_titles: txt.split('\n') })
          }
          multiline
          placeholder={'Review pull requests\nWrite summary\nPost to channel'}
          placeholderTextColor="#999"
          style={{
            borderWidth: 1,
            borderColor: '#E5E5E5',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 13,
            color: '#1a1a2e',
            minHeight: 90,
            textAlignVertical: 'top',
          }}
        />
      </Field>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
        <Pressable
          onPress={onCancel}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#CCC',
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text
            style={{ fontSize: 13, fontWeight: '800', color: '#1a1a2e' }}
          >
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={!draft.title.trim()}
          style={{
            flex: 1,
            backgroundColor: '#8b5cf6',
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: draft.title.trim() ? 1 : 0.5,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>
            {isNew ? 'Create' : 'Save'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: '#888',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}
