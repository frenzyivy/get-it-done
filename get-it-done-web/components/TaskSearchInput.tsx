'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';

// Feature 07 — live-filter search input.
// - Local input state updates instantly (no typing lag).
// - Debounced 80ms before pushing to the Zustand store and the URL.
// - URL `?q=` is the source of truth on first paint.
// - Wrap in <Suspense> when mounting (useSearchParams requires it for SSG).

interface Props {
  // `compact` is the narrower variant used in the Schedule sidebar.
  compact?: boolean;
  placeholder?: string;
}

const DEBOUNCE_MS = 80;

export function TaskSearchInput({ compact = false, placeholder }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);

  // Local input value — drives the visible <input> and updates immediately.
  // `searchQuery` (store) is what filters; we sync local -> store on debounce.
  const [value, setValue] = useState(searchQuery);

  // On mount, seed from URL `?q=` if the store doesn't already match. This
  // makes deep links work and keeps Board/Schedule in sync when navigating.
  // Runs once per pathname change to handle nav between dashboard segments.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const urlQ = searchParams.get('q') ?? '';
    if (urlQ !== searchQuery) {
      setSearchQuery(urlQ);
      setValue(urlQ);
    }
    // We intentionally only seed once on mount; live URL changes from this
    // component itself are handled by the debounce effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External clears — empty-state "Clear search" buttons in the views call
  // setSearchQuery(''). Reflect that back into the input so the next debounce
  // doesn't re-push the stale local value.
  useEffect(() => {
    if (searchQuery === '' && value !== '') {
      setValue('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Debounce: push `value` -> store + URL after DEBOUNCE_MS of inactivity.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (value === searchQuery) return;
      setSearchQuery(value);

      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set('q', value);
      } else {
        params.delete('q');
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value, searchQuery, setSearchQuery, router, pathname, searchParams]);

  const clear = () => {
    setValue('');
  };

  const widthClass = compact ? 'w-[160px]' : 'w-[220px]';

  return (
    <div
      className={`relative inline-flex items-center ${widthClass} h-[30px] rounded-full border-[1.5px] border-[#e5e7eb] bg-white pl-7 pr-2 transition-colors focus-within:border-[#1a1a2e]`}
    >
      <span
        className="absolute left-[10px] top-1/2 -translate-y-1/2 text-[11px] text-[#9ca3af] pointer-events-none"
        aria-hidden
      >
        ⌕
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? 'Search tasks...'}
        aria-label="Search tasks"
        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[12px] text-[#1a1a2e] placeholder:text-[#9ca3af]"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="ml-1 text-[14px] leading-none text-[#9ca3af] hover:text-[#1a1a2e] bg-transparent border-0 cursor-pointer"
        >
          ×
        </button>
      )}
    </div>
  );
}
