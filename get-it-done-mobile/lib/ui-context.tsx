import { createContext, useContext, type ReactNode } from 'react';
import type { Status } from '@/types';

export interface UIContextValue {
  openAddTask: (status?: Status) => void;
  openEditTask: (taskId: string) => void;
  // "Today's 5" drawer — opened from DailyGoalBar tap.
  openTodayFive: () => void;
  // Focus Lock picker (Screen 1). Callers pass a taskId; subtaskId optional.
  openFocusLockPicker: (taskId: string, subtaskId?: string | null) => void;
  // Recurring templates manager — opened from Settings.
  openRecurringTemplates: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({
  value,
  children,
}: {
  value: UIContextValue;
  children: ReactNode;
}) {
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside <UIProvider>');
  return ctx;
}
