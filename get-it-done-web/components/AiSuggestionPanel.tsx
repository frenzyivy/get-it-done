'use client';

import { useState } from 'react';
import { aiClient, type AiSubtask, type AiTagSuggestion } from '@/lib/ai';

interface Props {
  taskTitle: string;
  dueDate: string | null;
  selectedTagIds: string[];
  onAcceptSubtasks: (titles: string[]) => void;
  onAcceptTags: (tagIds: string[]) => void;
  onAcceptEstimate: (seconds: number) => void;
}

type Loading = 'none' | 'subtasks' | 'tags' | 'estimate';

export function AiSuggestionPanel({
  taskTitle,
  dueDate,
  selectedTagIds,
  onAcceptSubtasks,
  onAcceptTags,
  onAcceptEstimate,
}: Props) {
  const [loading, setLoading] = useState<Loading>('none');
  const [subtasks, setSubtasks] = useState<AiSubtask[] | null>(null);
  const [tagSuggestions, setTagSuggestions] = useState<AiTagSuggestion[] | null>(null);
  const [estimate, setEstimate] = useState<{ seconds: number; reasoning: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRun = taskTitle.trim().length >= 3;

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
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-[#c4b5fd] bg-white px-3 py-1 text-[12px] font-semibold text-[#7c3aed] disabled:opacity-50"
    >
      {loading ? '…thinking' : label}
    </button>
  );
}
