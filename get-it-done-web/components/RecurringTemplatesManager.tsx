'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import type {
  NewRecurringTemplateInput,
  Priority,
  RecurringFrequency,
  RecurringTemplate,
} from '@/types';

// Settings card — create, edit, enable/disable, delete recurring templates.
// The Edge Function `create-recurring-tasks` reads these every 15 min and
// materializes tasks on each due cycle.

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

export function RecurringTemplatesManager() {
  const userId = useStore((s) => s.userId);
  const templates = useStore((s) => s.recurringTemplates);
  const tags = useStore((s) => s.tags);
  const fetchRecurringTemplates = useStore((s) => s.fetchRecurringTemplates);
  const addRecurringTemplate = useStore((s) => s.addRecurringTemplate);
  const updateRecurringTemplate = useStore((s) => s.updateRecurringTemplate);
  const deleteRecurringTemplate = useStore((s) => s.deleteRecurringTemplate);
  const toggleRecurringTemplate = useStore((s) => s.toggleRecurringTemplate);

  const [editing, setEditing] = useState<
    | { mode: 'new'; draft: NewRecurringTemplateInput }
    | { mode: 'edit'; id: string; draft: NewRecurringTemplateInput }
    | null
  >(null);

  useEffect(() => {
    if (!userId) return;
    void fetchRecurringTemplates();
  }, [userId, fetchRecurringTemplates]);

  const openNew = () => setEditing({ mode: 'new', draft: emptyInput() });
  const openEdit = (t: RecurringTemplate) =>
    setEditing({
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
    });
  const close = () => setEditing(null);

  const save = async () => {
    if (!editing) return;
    const d = editing.draft;
    if (!d.title.trim()) return;
    // Normalize: only the relevant day_* field is stored per frequency.
    const payload: NewRecurringTemplateInput = {
      ...d,
      title: d.title.trim(),
      day_of_week: d.frequency === 'weekly' ? d.day_of_week ?? 1 : null,
      day_of_month: d.frequency === 'monthly' ? d.day_of_month ?? 1 : null,
      subtask_titles: d.subtask_titles.map((x) => x.trim()).filter(Boolean),
    };
    if (editing.mode === 'new') {
      await addRecurringTemplate(payload);
    } else {
      await updateRecurringTemplate(editing.id, payload);
    }
    close();
  };

  return (
    <>
      <div className="flex items-center justify-between pb-3">
        <div className="text-[13px] text-[#666]">
          Blueprints the app turns into tasks on schedule. Requires the
          &quot;Recurring tasks&quot; automation toggle above.
        </div>
        <button
          onClick={openNew}
          className="shrink-0 px-3 py-[6px] rounded-lg bg-[#8b5cf6] text-white text-xs font-bold hover:bg-[#7c3aed]"
        >
          + New
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="text-[13px] text-[#888] py-2">
          No recurring templates yet. Click <b>+ New</b> to create one.
        </div>
      ) : (
        <ul className="divide-y divide-[#eee]">
          {templates.map((t) => (
            <li key={t.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-bold text-[#1a1a2e] truncate">
                    {t.title}
                  </span>
                  {!t.is_enabled && (
                    <span className="text-[10px] font-bold text-[#aaa] uppercase">
                      paused
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-[#888] mt-[2px]">
                  {describeSchedule(t)} · {t.priority}
                  {t.subtask_titles.length > 0 &&
                    ` · ${t.subtask_titles.length} subtask${t.subtask_titles.length === 1 ? '' : 's'}`}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleRecurringTemplate(t.id, !t.is_enabled)}
                  className="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
                  style={{ backgroundColor: t.is_enabled ? '#8b5cf6' : '#d1d5db' }}
                  aria-pressed={t.is_enabled}
                  aria-label={t.is_enabled ? 'Pause template' : 'Enable template'}
                >
                  <span
                    className="absolute top-[2px] w-5 h-5 rounded-full bg-white shadow-sm transition-all"
                    style={{ left: t.is_enabled ? 22 : 2 }}
                  />
                </button>
                <button
                  onClick={() => openEdit(t)}
                  className="text-[12px] font-semibold text-[#7c3aed] hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${t.title}"? Materialized tasks keep existing.`)) {
                      void deleteRecurringTemplate(t.id);
                    }
                  }}
                  className="text-[12px] font-semibold text-[#e5447a] hover:underline"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={close}
        >
          <div
            className="w-full max-w-[520px] bg-white rounded-[18px] p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[18px] font-extrabold text-[#1a1a2e] mb-4">
              {editing.mode === 'new' ? 'New recurring template' : 'Edit template'}
            </h3>

            <Field label="Title">
              <input
                autoFocus
                value={editing.draft.title}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    draft: { ...editing.draft, title: e.target.value },
                  })
                }
                placeholder="e.g. Review weekly numbers"
                className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Frequency">
              <div className="flex gap-2 flex-wrap">
                {FREQUENCIES.map((f) => {
                  const active = editing.draft.frequency === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          draft: { ...editing.draft, frequency: f.id },
                        })
                      }
                      className="px-3 py-[6px] rounded-lg text-xs font-bold transition-colors border-[1.5px]"
                      style={{
                        borderColor: active ? '#8b5cf6' : '#e5e7eb',
                        background: active ? '#F5F2FF' : '#fff',
                        color: active ? '#8b5cf6' : '#333',
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            {editing.draft.frequency === 'weekly' && (
              <Field label="Day of week">
                <div className="flex gap-1 flex-wrap">
                  {DAYS_OF_WEEK.map((label, idx) => {
                    const active = editing.draft.day_of_week === idx;
                    return (
                      <button
                        key={label}
                        onClick={() =>
                          setEditing({
                            ...editing,
                            draft: { ...editing.draft, day_of_week: idx },
                          })
                        }
                        className="w-10 h-9 rounded-lg text-xs font-bold border-[1.5px]"
                        style={{
                          borderColor: active ? '#8b5cf6' : '#e5e7eb',
                          background: active ? '#F5F2FF' : '#fff',
                          color: active ? '#8b5cf6' : '#333',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}

            {editing.draft.frequency === 'monthly' && (
              <Field label="Day of month">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={editing.draft.day_of_month ?? 1}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      draft: {
                        ...editing.draft,
                        day_of_month: Math.min(
                          31,
                          Math.max(1, Number(e.target.value) || 1),
                        ),
                      },
                    })
                  }
                  className="w-24 border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm"
                />
              </Field>
            )}

            <Field label="Time (your local)">
              <select
                value={editing.draft.hour_local}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    draft: { ...editing.draft, hour_local: Number(e.target.value) },
                  })
                }
                className="border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Priority">
              <div className="flex gap-2">
                {PRIORITIES.map((p) => {
                  const active = editing.draft.priority === p;
                  return (
                    <button
                      key={p}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          draft: { ...editing.draft, priority: p },
                        })
                      }
                      className="px-3 py-[6px] rounded-lg text-xs font-bold transition-colors border-[1.5px] capitalize"
                      style={{
                        borderColor: active ? '#8b5cf6' : '#e5e7eb',
                        background: active ? '#F5F2FF' : '#fff',
                        color: active ? '#8b5cf6' : '#333',
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </Field>

            {tags.length > 0 && (
              <Field label="Tags">
                <div className="flex gap-2 flex-wrap">
                  {tags.map((tag) => {
                    const active = editing.draft.tag_ids.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => {
                          const next = active
                            ? editing.draft.tag_ids.filter((x) => x !== tag.id)
                            : [...editing.draft.tag_ids, tag.id];
                          setEditing({
                            ...editing,
                            draft: { ...editing.draft, tag_ids: next },
                          });
                        }}
                        className="px-3 py-[4px] rounded-full text-xs font-bold border-[1.5px]"
                        style={{
                          borderColor: active ? tag.color : '#e5e7eb',
                          background: active ? tag.color : '#fff',
                          color: active ? '#fff' : '#333',
                        }}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}

            <Field label="Subtasks (one per line, optional)">
              <textarea
                rows={3}
                value={editing.draft.subtask_titles.join('\n')}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    draft: {
                      ...editing.draft,
                      subtask_titles: e.target.value.split('\n'),
                    },
                  })
                }
                placeholder="Review pull requests&#10;Write summary&#10;Post to channel"
                className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm"
              />
            </Field>

            <div className="flex items-center gap-2 justify-end mt-4">
              <button
                onClick={close}
                className="px-4 py-2 text-sm font-bold text-[#666] hover:text-[#333]"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={!editing.draft.title.trim()}
                className="px-4 py-2 rounded-lg bg-[#8b5cf6] text-white text-sm font-bold hover:bg-[#7c3aed] disabled:opacity-50"
              >
                {editing.mode === 'new' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
    <div className="mb-3">
      <div className="text-[11px] font-bold text-[#888] uppercase tracking-[0.5px] mb-[6px]">
        {label}
      </div>
      {children}
    </div>
  );
}
