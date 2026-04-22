'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { TAG_COLORS } from '@/lib/constants';
import { labelTintBg } from '@/lib/utils';
import type { CategoryType } from '@/types';

interface Props {
  onClose: () => void;
}

export function CategoryManagerModal({ onClose }: Props) {
  const categories = useStore((s) => s.categories);
  const addCategory = useStore((s) => s.addCategory);
  const updateCategory = useStore((s) => s.updateCategory);
  const deleteCategory = useStore((s) => s.deleteCategory);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(TAG_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(TAG_COLORS[0]);
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
      await addCategory(name, newColor);
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (c: CategoryType) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditColor(c.color);
  };

  const saveEdit = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    setError(null);
    try {
      await updateCategory(id, { name, color: editColor });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const remove = async (c: CategoryType) => {
    if (!confirm(`Delete "${c.name}"? It will be removed from all tasks.`)) return;
    setError(null);
    try {
      await deleteCategory(c.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
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
        aria-label="Manage categories"
        className="fixed top-1/2 left-1/2 z-50 w-[min(560px,92vw)] max-h-[86vh] -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.25)] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#eee]">
          <h2 className="text-[15px] font-extrabold text-[#1a1a2e] tracking-[-0.2px]">
            🎯 Manage categories
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
          {categories.length === 0 ? (
            <p className="text-[13px] text-[#9ca3af] py-6 text-center">
              No categories yet. Add one below.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-[#f0eefb]">
              {categories.map((c) => {
                const editing = editingId === c.id;
                return (
                  <div key={c.id} className="flex items-center gap-3 py-3">
                    {editing ? (
                      <>
                        <span
                          className="inline-flex items-center gap-[5px] px-[9px] py-[3px] rounded-md text-[11px] font-bold"
                          style={{
                            backgroundColor: labelTintBg(editColor),
                            color: editColor,
                          }}
                        >
                          <span
                            className="w-[6px] h-[6px] rounded-full"
                            style={{ background: editColor }}
                          />
                          {editName || 'name'}
                        </span>
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit(c.id)}
                          className="flex-1 border-[1.5px] border-[#e5e7eb] rounded-lg px-3 py-[5px] text-[13px] outline-none"
                        />
                        <div className="flex gap-[3px]">
                          {TAG_COLORS.slice(0, 6).map((color) => (
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
                          onClick={() => saveEdit(c.id)}
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
                          className="inline-flex items-center gap-[5px] px-[9px] py-[3px] rounded-md text-[11px] font-bold"
                          style={{
                            backgroundColor: labelTintBg(c.color),
                            color: c.color,
                          }}
                        >
                          <span
                            className="w-[6px] h-[6px] rounded-full"
                            style={{ background: c.color }}
                          />
                          {c.name}
                        </span>
                        <div className="flex-1" />
                        <button
                          onClick={() => startEdit(c)}
                          className="text-[12px] text-[#8b5cf6] bg-transparent border-0 cursor-pointer hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => remove(c)}
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
              placeholder="Category name…"
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
