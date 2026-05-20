'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const setSearchAnchorRect = useStore((s) => s.setSearchAnchorRect);
  const setSearchDropdownOpen = useStore((s) => s.setSearchDropdownOpen);

  // Local input value — drives the visible <input> and updates immediately.
  // `searchQuery` (store) is what filters; we sync local -> store on debounce.
  const [value, setValue] = useState(searchQuery);

  // Wrapper ref — its bounding rect anchors the SearchResultsDropdown
  // (rendered inside each view's DndContext, see SearchResultsDropdown.tsx).
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

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

  // Publish the input's bounding rect to the store so each view's rendered
  // <SearchResultsDropdown> can position itself underneath. We re-measure on
  // focus, on value change (the clear-× button changes width), and on window
  // resize.
  const publishAnchor = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSearchAnchorRect({
      top: r.bottom,
      left: r.left,
      width: r.width,
    });
  }, [setSearchAnchorRect]);

  useEffect(() => {
    if (!focused) return;
    publishAnchor();
    window.addEventListener('resize', publishAnchor);
    window.addEventListener('scroll', publishAnchor, true);
    return () => {
      window.removeEventListener('resize', publishAnchor);
      window.removeEventListener('scroll', publishAnchor, true);
    };
  }, [focused, publishAnchor]);

  // Dropdown is open while the input is focused AND the query is non-empty.
  // Blur is debounced (~150ms) so a click on a dropdown row lands first.
  const hasQuery = value.trim().length > 0;
  const shouldOpen = focused && hasQuery;
  useEffect(() => {
    setSearchDropdownOpen(shouldOpen);
  }, [shouldOpen, setSearchDropdownOpen]);

  // Cleanup on unmount — never leave a stale "open" flag behind if the input
  // gets unmounted while focused (e.g. view switch from Today to Calendar).
  useEffect(() => {
    return () => {
      setSearchDropdownOpen(false);
      setSearchAnchorRect(null);
    };
  }, [setSearchDropdownOpen, setSearchAnchorRect]);

  const clear = () => {
    setValue('');
  };

  const widthClass = compact ? 'w-[160px]' : 'w-[220px]';

  return (
    <div
      ref={wrapperRef}
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
        onFocus={() => setFocused(true)}
        // Delay blur — gives a row click / drag inside the dropdown time to
        // fire before we tear down the open state. The dropdown's own
        // onMouseDown also calls preventDefault to keep focus here, but
        // Safari can still drop focus on certain drag starts.
        onBlur={() => {
          setTimeout(() => setFocused(false), 180);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setFocused(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
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
