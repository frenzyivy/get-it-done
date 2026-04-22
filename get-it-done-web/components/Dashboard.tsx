'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { TagManager } from './TagManager';
import { CategoryManagerModal } from './CategoryManagerModal';
import { ProjectManagerModal } from './ProjectManagerModal';
import { BoardView } from './BoardView';
import { ListView } from './ListView';
import { ScheduleView } from './ScheduleView';
import { TimelineView } from './TimelineView';
import { DailyGoalBar } from './DailyGoalBar';
import { NowTrackingBar } from './NowTrackingBar';
import { ColumnSwitcher } from './ColumnSwitcher';
import { NotificationBell } from './NotificationBell';
import { SkeletonBoard } from './Skeleton';
import { FocusModeView } from './FocusModeView';
import { RolloverPromptModal } from './RolloverPromptModal';
import { FloatingAddButton } from './FloatingAddButton';
import { FocusLockPicker } from './FocusLockPicker';

// v2 spec §3 — new IA: compact header, then goal bar, now-tracking bar,
// then the segmented board/list switcher. Sign out moved to Settings.
export function Dashboard({ userId }: { userId: string }) {
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const projects = useStore((s) => s.projects);
  const view = useStore((s) => s.view);
  const loading = useStore((s) => s.loading);
  const setUserId = useStore((s) => s.setUserId);
  const fetchAll = useStore((s) => s.fetchAll);
  const unsubscribeNotifications = useStore((s) => s.unsubscribeNotifications);
  const setView = useStore((s) => s.setView);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showProjectsModal, setShowProjectsModal] = useState(false);

  useEffect(() => {
    setUserId(userId);
    void fetchAll();
    return () => unsubscribeNotifications();
  }, [userId, setUserId, fetchAll, unsubscribeNotifications]);

  return (
    <div
      className="min-h-screen px-4 py-4"
      style={{
        background: 'linear-gradient(145deg, #f8f7ff 0%, #f0f4ff 50%, #faf5ff 100%)',
      }}
    >
      <div className="max-w-[960px] mx-auto">
        {/* Compact header */}
        <header className="flex items-center justify-between mb-3">
          <h1 className="text-[22px] font-extrabold text-[#1a1a2e] tracking-[-0.5px] m-0">
            <span className="text-[#8b5cf6]">⚡</span> Get-it-done
          </h1>
          <div className="flex gap-2 items-center">
            <NotificationBell />
            <button
              onClick={() => setShowCategoriesModal(true)}
              className="px-3 py-[6px] rounded-lg border-[1.5px] border-[#d5cafe] bg-[#faf7ff] text-xs font-bold text-[#5a3fd8] hover:border-[#8b5cf6] transition-colors"
              title="Manage categories"
            >
              🎯 Categories ({categories.length})
            </button>
            <button
              onClick={() => setShowProjectsModal(true)}
              className="px-3 py-[6px] rounded-lg border-[1.5px] border-[#d5cafe] bg-[#faf7ff] text-xs font-bold text-[#5a3fd8] hover:border-[#8b5cf6] transition-colors"
              title="Manage projects"
            >
              ★ Projects ({projects.length})
            </button>
            <TagManager />
            <Link
              href="/insights"
              className="px-3 py-[6px] rounded-lg border-[1.5px] border-[#e5e7eb] bg-white text-xs font-bold text-[#666] hover:border-[#8b5cf6] transition-colors"
              title="Insights"
            >
              📊 Insights
            </Link>
            <Link
              href="/settings"
              className="px-3 py-[6px] rounded-lg border-[1.5px] border-[#e5e7eb] bg-white text-xs font-bold text-[#666] hover:border-[#8b5cf6] transition-colors"
              title="Settings"
            >
              ⚙ Settings
            </Link>
          </div>
        </header>

        {/* Daily goal bar — always visible */}
        <div className="mb-3">
          <DailyGoalBar />
        </div>

        {/* Now tracking bar — shown only when a session is active */}
        <div className="mb-3">
          <NowTrackingBar />
        </div>

        {/* View switcher: Board · List · Schedule · Timeline */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="flex bg-white rounded-xl p-[3px] shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
            {(
              [
                { id: 'kanban', icon: '▤', label: 'Board' },
                { id: 'list', icon: '☰', label: 'List' },
                { id: 'schedule', icon: '⏱', label: 'Schedule' },
                { id: 'timeline', icon: '◧', label: 'Timeline' },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className="px-3 py-[6px] rounded-[10px] border-0 cursor-pointer text-xs font-bold transition-all"
                style={{
                  background: view === v.id ? '#8b5cf6' : 'transparent',
                  color: view === v.id ? '#fff' : '#888',
                }}
              >
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          {view === 'kanban' && (
            <div className="flex-1">
              <ColumnSwitcher />
            </div>
          )}
        </div>

        {loading && tasks.length === 0 ? (
          <SkeletonBoard />
        ) : view === 'kanban' ? (
          <BoardView />
        ) : view === 'list' ? (
          <ListView />
        ) : view === 'schedule' ? (
          <ScheduleView />
        ) : (
          <TimelineView />
        )}
      </div>
      <FocusModeView />
      <RolloverPromptModal />
      <FloatingAddButton />
      <FocusLockPicker />
      {showCategoriesModal && (
        <CategoryManagerModal onClose={() => setShowCategoriesModal(false)} />
      )}
      {showProjectsModal && (
        <ProjectManagerModal onClose={() => setShowProjectsModal(false)} />
      )}
    </div>
  );
}
