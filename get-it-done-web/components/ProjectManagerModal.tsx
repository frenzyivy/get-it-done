'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { TAG_COLORS } from '@/lib/constants';
import { labelTintBg } from '@/lib/utils';
import type { ProjectStatus, ProjectType } from '@/types';

interface Props {
  onClose: () => void;
}

const STATUSES: ProjectStatus[] = ['active', 'paused', 'archived'];

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

  const remove = async (p: ProjectType) => {
    if (!confirm(`Delete "${p.name}"? It will be removed from all tasks.`)) return;
    setError(null);
    try {
      await deleteProject(p.id);
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

        <div className="overflow-y-auto px-6 py-4 flex-1">
          {projects.length === 0 ? (
            <p className="text-[13px] text-[#9ca3af] py-6 text-center">
              No projects yet. Add one below.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-[#f0eefb]">
              {projects.map((p) => {
                const editing = editingId === p.id;
                return (
                  <div key={p.id} className="flex items-center gap-3 py-3 flex-wrap">
                    {editing ? (
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
                          className="text-[12px] font-bold text-white bg-[#8b5cf6] border-0 px-3 py-[5px] rounded-md cursor-pointer"
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
                          className="inline-flex items-center px-[9px] py-[3px] rounded-md text-[11px] font-semibold"
                          style={{
                            backgroundColor: labelTintBg(p.color),
                            color: p.color,
                            opacity: p.status === 'archived' ? 0.55 : 1,
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
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <div className="flex-1" />
                        <button
                          onClick={() => startEdit(p)}
                          className="text-[12px] text-[#8b5cf6] bg-transparent border-0 cursor-pointer hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => remove(p)}
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
              className="flex-1 min-w-[160px] border-[1.5px] border-[#e5e7eb] rounded-lg px-3 py-[6px] text-[13px] outline-none focus:border-[#8b5cf6]"
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
              className="bg-[#8b5cf6] text-white border-0 rounded-lg px-4 py-[6px] text-[13px] font-bold cursor-pointer disabled:opacity-50"
            >
              {creating ? '…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
