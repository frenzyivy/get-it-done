'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { TAG_COLORS } from '@/lib/constants';
import { labelTintBg } from '@/lib/utils';
import type { ProjectStatus, ProjectType } from '@/types';

interface Props {
  onClose: () => void;
}

// User-facing status options. 'paused' is intentionally absent — it's a
// legacy state from migration 0019 the redesign no longer uses. Existing
// 'paused' rows in the DB still satisfy the type and the API check; we just
// don't offer it as a new choice.
const STATUSES: ProjectStatus[] = ['active', 'completed', 'archived'];

type StatusFilter = 'all' | 'active' | 'completed' | 'archived';
const STATUS_TABS: StatusFilter[] = ['all', 'active', 'completed', 'archived'];

export function ProjectManagerModal({ onClose }: Props) {
  const projects = useStore((s) => s.projects);
  const addProject = useStore((s) => s.addProject);
  const updateProject = useStore((s) => s.updateProject);
  const deleteProject = useStore((s) => s.deleteProject);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(TAG_COLORS[2]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(TAG_COLORS[2]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // Typed-name delete confirmation: when set, that row transforms into the
  // confirmation UI and other rows fade out to lock attention on the
  // destructive action.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState('');

  // Counts per tab. 'paused' rows count under 'active' for filtering purposes
  // (they're legacy and read as "still in play").
  const counts = useMemo(() => {
    const c = { all: projects.length, active: 0, completed: 0, archived: 0 };
    for (const p of projects) {
      if (p.status === 'completed') c.completed++;
      else if (p.status === 'archived') c.archived++;
      else c.active++; // active OR legacy paused
    }
    return c;
  }, [projects]);

  const visibleProjects = useMemo(() => {
    if (statusFilter === 'all') return projects;
    if (statusFilter === 'active')
      return projects.filter((p) => p.status === 'active' || p.status === 'paused');
    return projects.filter((p) => p.status === statusFilter);
  }, [projects, statusFilter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const create = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      await addProject(name, newColor, 'active');
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
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
    setError(null);
    try {
      await updateProject(id, { name, color: editColor });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const startDeleteConfirm = (p: ProjectType) => {
    setEditingId(null); // exit any in-progress edit
    setConfirmingDeleteId(p.id);
    setConfirmName('');
    setError(null);
  };

  const cancelDeleteConfirm = () => {
    setConfirmingDeleteId(null);
    setConfirmName('');
  };

  const confirmDelete = async (p: ProjectType) => {
    if (confirmName.trim() !== p.name) return;
    setError(null);
    try {
      await deleteProject(p.id);
      setConfirmingDeleteId(null);
      setConfirmName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const cycleStatus = async (p: ProjectType, next: ProjectStatus) => {
    setError(null);
    try {
      await updateProject(p.id, { status: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 animate-[fadeIn_0.15s_ease-out]"
      />
      <div
        role="dialog"
        aria-label="Manage projects"
        className="fixed top-1/2 left-1/2 z-50 w-[min(620px,92vw)] max-h-[86vh] -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.25)] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#eee]">
          <h2 className="text-[15px] font-extrabold text-[#1a1a2e] tracking-[-0.2px]">
            ★ Manage projects
          </h2>
          <button
            onClick={onClose}
            className="bg-transparent border-0 text-xl text-[#aaa] hover:text-[#1a1a2e] cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-3 text-[12px] text-[#dc2626] bg-[#fee2e2] rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {/* Status tabs — Spec § Manage projects screen. Counts come from the
            full project set; the visible list filters to the chosen tab.
            'paused' rows count under 'active'. */}
        {projects.length > 0 && (
          <div className="px-6 pt-3 pb-2 flex gap-1 flex-wrap">
            {STATUS_TABS.map((tab) => {
              const on = statusFilter === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className="text-[11px] font-semibold rounded-md px-[10px] py-[4px] border-0 cursor-pointer inline-flex items-center gap-[6px] transition-colors"
                  style={{
                    background: on ? '#1a1a2e' : '#f3f4f6',
                    color: on ? '#fff' : '#6b7280',
                  }}
                >
                  <span className="capitalize">{tab}</span>
                  <span
                    className="text-[10px] font-mono opacity-70"
                  >
                    {counts[tab]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="overflow-y-auto px-6 py-4 flex-1">
          {projects.length === 0 ? (
            <p className="text-[13px] text-[#9ca3af] py-6 text-center">
              No projects yet. Add one below.
            </p>
          ) : visibleProjects.length === 0 ? (
            <p className="text-[13px] text-[#9ca3af] py-6 text-center">
              No projects in this tab.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-[#f0eefb]">
              {visibleProjects.map((p) => {
                const editing = editingId === p.id;
                const confirmingDelete = confirmingDeleteId === p.id;
                // When ANY row is in delete-confirm, fade the others to lock
                // attention on the destructive action.
                const dimmed =
                  confirmingDeleteId !== null && confirmingDeleteId !== p.id;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 py-3 flex-wrap transition-opacity"
                    style={{
                      opacity: dimmed ? 0.35 : 1,
                      pointerEvents: dimmed ? 'none' : 'auto',
                    }}
                  >
                    {confirmingDelete ? (
                      <>
                        <span
                          className="inline-flex items-center px-[9px] py-[3px] rounded-md text-[11px] font-semibold"
                          style={{
                            backgroundColor: labelTintBg(p.color),
                            color: p.color,
                            opacity: 0.55,
                          }}
                        >
                          {p.name}
                        </span>
                        <span className="text-[12px] text-[#dc2626] font-semibold">
                          Type
                          {' '}
                          <span className="font-mono bg-[#fee2e2] px-[5px] py-[1px] rounded">
                            {p.name}
                          </span>
                          {' '}
                          to confirm:
                        </span>
                        <input
                          autoFocus
                          value={confirmName}
                          onChange={(e) => setConfirmName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && confirmName.trim() === p.name) {
                              void confirmDelete(p);
                            } else if (e.key === 'Escape') {
                              cancelDeleteConfirm();
                            }
                          }}
                          placeholder={p.name}
                          className="flex-1 min-w-[140px] border-[1.5px] border-[#dc2626] rounded-lg px-3 py-[5px] text-[13px] outline-none font-mono"
                        />
                        <button
                          onClick={cancelDeleteConfirm}
                          className="text-[12px] text-[#888] bg-transparent border-0 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => void confirmDelete(p)}
                          disabled={confirmName.trim() !== p.name}
                          className="text-[12px] font-bold text-white bg-[#dc2626] border-0 px-3 py-[5px] rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Delete
                        </button>
                      </>
                    ) : editing ? (
                      <>
                        <span
                          className="inline-flex items-center px-[9px] py-[3px] rounded-md text-[11px] font-semibold"
                          style={{
                            backgroundColor: labelTintBg(editColor),
                            color: editColor,
                          }}
                        >
                          {editName || 'name'}
                        </span>
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit(p.id)}
                          className="flex-1 min-w-[140px] border-[1.5px] border-[#e5e7eb] rounded-lg px-3 py-[5px] text-[13px] outline-none"
                        />
                        <div className="flex gap-[3px]">
                          {TAG_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={() => setEditColor(color)}
                              className="w-4 h-4 rounded-full cursor-pointer"
                              style={{
                                background: color,
                                outline: editColor === color ? '2px solid #1a1a2e' : 'none',
                                outlineOffset: 1,
                              }}
                              aria-label={`Pick ${color}`}
                            />
                          ))}
                        </div>
                        <button
                          onClick={() => saveEdit(p.id)}
                          className="text-[12px] font-bold text-white bg-[#1a1a2e] border-0 px-3 py-[5px] rounded-md cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-[12px] text-[#888] bg-transparent border-0 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span
                          className={`inline-flex items-center px-[9px] py-[3px] rounded-md text-[11px] font-semibold ${
                            p.status !== 'active' ? 'italic' : ''
                          }`}
                          style={{
                            backgroundColor: labelTintBg(p.color),
                            color: p.color,
                            opacity: p.status === 'active' ? 1 : 0.55,
                          }}
                        >
                          {p.name}
                        </span>
                        <select
                          value={p.status}
                          onChange={(e) =>
                            void cycleStatus(p, e.target.value as ProjectStatus)
                          }
                          className="text-[11px] border-[1.5px] border-[#e5e7eb] rounded-md px-2 py-[3px] cursor-pointer bg-white"
                          aria-label={`Change ${p.name} status`}
                        >
                          {/* If the row is on legacy 'paused', surface it as a
                              valid current value but exclude it from the
                              new-action choices below. */}
                          {p.status === 'paused' && (
                            <option value="paused">paused (legacy)</option>
                          )}
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        {p.status === 'completed' && (
                          <span className="text-[10px] italic text-[#9ca3af]">
                            hidden from create-task picker
                          </span>
                        )}
                        {p.status === 'archived' && (
                          <span className="text-[10px] italic text-[#9ca3af]">
                            hidden from create-task picker
                          </span>
                        )}
                        <div className="flex-1" />
                        <button
                          onClick={() => startEdit(p)}
                          className="text-[12px] text-[#1a1a2e] bg-transparent border-0 cursor-pointer hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => startDeleteConfirm(p)}
                          className="text-[12px] text-[#dc2626] bg-transparent border-0 cursor-pointer hover:underline"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-[#eee] px-6 py-4 bg-[#fafafa]">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-[#888] mb-2">
            Add new
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="Project name…"
              className="flex-1 min-w-[160px] border-[1.5px] border-[#e5e7eb] rounded-lg px-3 py-[6px] text-[13px] outline-none focus:border-[#1a1a2e]"
            />
            <div className="flex gap-[4px]">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className="w-4 h-4 rounded-full cursor-pointer"
                  style={{
                    background: c,
                    outline: newColor === c ? '2px solid #1a1a2e' : 'none',
                    outlineOffset: 1,
                  }}
                  aria-label={`Pick ${c}`}
                />
              ))}
            </div>
            <button
              onClick={create}
              disabled={!newName.trim() || creating}
              className="bg-[#1a1a2e] text-white border-0 rounded-lg px-4 py-[6px] text-[13px] font-bold cursor-pointer disabled:opacity-50"
            >
              {creating ? '…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
