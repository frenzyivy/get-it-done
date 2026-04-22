'use client';

import { useState } from 'react';
import { aiClient, type AiSubtask, type AiTagSuggestion } from '@/lib/ai';
import { useStore } from '@/lib/store';

interface Props {
  taskTitle: string;
  dueDate: string | null;
  selectedTagIds: string[];
  selectedCategoryIds?: string[];
  selectedProjectIds?: string[];
  onAcceptSubtasks: (titles: string[]) => void;
  onAcceptTags: (tagIds: string[]) => void;
  onAcceptEstimate: (seconds: number) => void;
  // Label-suggestion support is opt-in — the edit drawer may not want it until
  // the drawer is task-creation-aware. Both handlers must be provided together.
  onAcceptCategories?: (categoryIds: string[]) => void;
  onAcceptProjects?: (projectIds: string[]) => void;
}

type Loading = 'none' | 'subtasks' | 'tags' | 'labels' | 'estimate';

export function AiSuggestionPanel({
  taskTitle,
  dueDate,
  selectedTagIds,
  selectedCategoryIds = [],
  selectedProjectIds = [],
  onAcceptSubtasks,
  onAcceptTags,
  onAcceptEstimate,
  onAcceptCategories,
  onAcceptProjects,
}: Props) {
  void dueDate;
  const [loading, setLoading] = useState<Loading>('none');
  const [subtasks, setSubtasks] = useState<AiSubtask[] | null>(null);
  const [tagSuggestions, setTagSuggestions] = useState<AiTagSuggestion[] | null>(null);
  const [labelSuggestion, setLabelSuggestion] = useState<{
    categoryIds: string[];
    projectIds: string[];
  } | null>(null);
  const [estimate, setEstimate] = useState<{ seconds: number; reasoning: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRun = taskTitle.trim().length >= 3;
  const canSuggestLabels = !!onAcceptCategories && !!onAcceptProjects;

  const run = async (which: Exclude<Loading, 'none'>) => {
    if (!canRun) return;
    setLoading(which);
    setError(null);
    try {
      if (which === 'subtasks') {
        const res = await aiClient.generateSubtasks(taskTitle);
        setSubtasks(res.subtasks);
      } else if (which === 'tags') {
        const res = await aiClient.smartTag(taskTitle);
        setTagSuggestions(res.suggestions);
      } else if (which === 'labels') {
        const res = await aiClient.suggestLabels(taskTitle);
        setLabelSuggestion({
          categoryIds: res.category_ids,
          projectIds: res.project_ids,
        });
      } else {
        const res = await aiClient.estimateTask(taskTitle, subtasks?.map((s) => s.title));
        setEstimate({ seconds: res.estimated_seconds, reasoning: res.reasoning });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading('none');
    }
  };

  const newTagSuggestions = (tagSuggestions ?? []).filter(
    (s) => !selectedTagIds.includes(s.tag_id),
  );

  return (
    <div className="mt-3 rounded-xl border border-dashed border-[#c4b5fd] bg-[#faf5ff] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[#7c3aed]">✨ AI assist</span>
        <span className="text-[11px] text-[#9ca3af]">Suggestions are always optional</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <AiButton
          label="Break into subtasks"
          loading={loading === 'subtasks'}
          disabled={!canRun || loading !== 'none'}
          onClick={() => run('subtasks')}
        />
        {canSuggestLabels && (
          <AiButton
            label="Suggest category & project"
            loading={loading === 'labels'}
            disabled={!canRun || loading !== 'none'}
            onClick={() => run('labels')}
            dashed
          />
        )}
        <AiButton
          label="Suggest tags"
          loading={loading === 'tags'}
          disabled={!canRun || loading !== 'none'}
          onClick={() => run('tags')}
        />
        <AiButton
          label="Estimate time"
          loading={loading === 'estimate'}
          disabled={!canRun || loading !== 'none'}
          onClick={() => run('estimate')}
        />
      </div>

      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}

      {subtasks && subtasks.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
            Suggested subtasks
          </p>
          <ul className="mt-1 space-y-1">
            {subtasks.map((s, i) => (
              <li key={i} className="text-[13px] text-[#374151]">• {s.title}</li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                onAcceptSubtasks(subtasks.map((s) => s.title));
                setSubtasks(null);
              }}
              className="rounded-lg bg-[#8b5cf6] px-3 py-1 text-[12px] font-semibold text-white"
            >
              Add all
            </button>
            <button
              onClick={() => setSubtasks(null)}
              className="rounded-lg border border-[#e5e7eb] px-3 py-1 text-[12px] text-[#6b7280]"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {labelSuggestion && (
        <LabelSuggestionBlock
          suggestion={labelSuggestion}
          selectedCategoryIds={selectedCategoryIds}
          selectedProjectIds={selectedProjectIds}
          onAcceptCategories={onAcceptCategories!}
          onAcceptProjects={onAcceptProjects!}
          onDismiss={() => setLabelSuggestion(null)}
        />
      )}

      {tagSuggestions && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
            Suggested tags
          </p>
          {newTagSuggestions.length === 0 ? (
            <p className="mt-1 text-[12px] text-[#9ca3af]">
              No confident matches from your existing tags.
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              {newTagSuggestions.map((s) => (
                <button
                  key={s.tag_id}
                  onClick={() => {
                    onAcceptTags([s.tag_id]);
                    setTagSuggestions((prev) => prev?.filter((x) => x.tag_id !== s.tag_id) ?? null);
                  }}
                  className="rounded-full border border-[#c4b5fd] bg-white px-3 py-1 text-[12px] text-[#7c3aed]"
                >
                  + {s.name}
                  <span className="ml-1 text-[10px] text-[#9ca3af]">
                    {Math.round(s.confidence * 100)}%
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {estimate && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
            Suggested estimate
          </p>
          <p className="mt-1 text-[13px] text-[#374151]">
            {Math.round(estimate.seconds / 60)} minutes
            {estimate.reasoning && (
              <span className="text-[#9ca3af]"> — {estimate.reasoning}</span>
            )}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                onAcceptEstimate(estimate.seconds);
                setEstimate(null);
              }}
              className="rounded-lg bg-[#8b5cf6] px-3 py-1 text-[12px] font-semibold text-white"
            >
              Use this estimate
            </button>
            <button
              onClick={() => setEstimate(null)}
              className="rounded-lg border border-[#e5e7eb] px-3 py-1 text-[12px] text-[#6b7280]"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AiButton({
  label,
  loading,
  disabled,
  onClick,
  dashed = false,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  dashed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-white px-3 py-1 text-[12px] font-semibold text-[#7c3aed] disabled:opacity-50"
      style={{
        border: `1px ${dashed ? 'dashed' : 'solid'} #c4b5fd`,
      }}
    >
      {loading ? '…thinking' : label}
    </button>
  );
}

function LabelSuggestionBlock({
  suggestion,
  selectedCategoryIds,
  selectedProjectIds,
  onAcceptCategories,
  onAcceptProjects,
  onDismiss,
}: {
  suggestion: { categoryIds: string[]; projectIds: string[] };
  selectedCategoryIds: string[];
  selectedProjectIds: string[];
  onAcceptCategories: (ids: string[]) => void;
  onAcceptProjects: (ids: string[]) => void;
  onDismiss: () => void;
}) {
  const categories = useStore((s) => s.categories);
  const projects = useStore((s) => s.projects);

  const suggestedCats = suggestion.categoryIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .filter((c) => !selectedCategoryIds.includes(c.id));
  const suggestedProjs = suggestion.projectIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .filter((p) => !selectedProjectIds.includes(p.id));

  if (suggestedCats.length === 0 && suggestedProjs.length === 0) {
    return (
      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
          Suggested category &amp; project
        </p>
        <p className="mt-1 text-[12px] text-[#9ca3af]">
          Nothing new to add — already covered.
        </p>
        <button
          onClick={onDismiss}
          className="mt-2 rounded-lg border border-[#e5e7eb] px-3 py-1 text-[12px] text-[#6b7280]"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
        Suggested category &amp; project
      </p>
      {suggestedCats.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {suggestedCats.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onAcceptCategories([c.id]);
              }}
              className="inline-flex items-center gap-[5px] rounded-md px-[9px] py-[3px] text-[11px] font-bold"
              style={{ background: '#faf5ff', color: c.color, border: '1px dashed #c4b5fd' }}
            >
              <span
                className="w-[6px] h-[6px] rounded-full"
                style={{ background: c.color }}
              />
              + {c.name}
            </button>
          ))}
        </div>
      )}
      {suggestedProjs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestedProjs.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onAcceptProjects([p.id]);
              }}
              className="rounded-md px-[9px] py-[3px] text-[11px] font-semibold"
              style={{ background: '#faf5ff', color: p.color, border: '1px dashed #c4b5fd' }}
            >
              + {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            if (suggestedCats.length > 0) {
              onAcceptCategories(suggestedCats.map((c) => c.id));
            }
            if (suggestedProjs.length > 0) {
              onAcceptProjects(suggestedProjs.map((p) => p.id));
            }
            onDismiss();
          }}
          className="rounded-lg bg-[#8b5cf6] px-3 py-1 text-[12px] font-semibold text-white"
        >
          Add all
        </button>
        <button
          onClick={onDismiss}
          className="rounded-lg border border-[#e5e7eb] px-3 py-1 text-[12px] text-[#6b7280]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
