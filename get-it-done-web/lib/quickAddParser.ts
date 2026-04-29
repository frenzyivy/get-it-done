import type { CategoryType, Filters, Priority, ProjectType } from '@/types';
import { findDateInText } from './quickAddDateParser';

// Quick-add grammar (Phase 5 step 15):
//   @name        — project (fuzzy match)
//   #name        — category
//   !!! / !! / ! — priority urgent / med / low
//   ~30m / ~2h / ~1.5h — estimate
//   today / tomorrow / mon-sun / apr 30 / in N days — due date
//   -> a; b; c   — subtasks (consumes everything after the arrow)
// Anything not matched is the title.
//
// Filter inheritance per Decision (a): inherited project_ids and category_ids
// from active filters seed the parsed result; @/# tokens override (or extend
// for multi-select).

export interface ParsedQuickAdd {
  title: string;
  projectIds: string[];
  inheritedProjectIds: Set<string>; // subset of projectIds that came from filters
  categoryIds: string[];
  inheritedCategoryIds: Set<string>;
  priority: Priority | null;
  priorityInherited: boolean;
  estimateSeconds: number | null;
  dueDate: string | null;
  subtasks: string[];
  // Tokens that didn't resolve to a project/category. Used to build the
  // "couldn't match X, Y" toast on submit (we still submit, per Decision).
  unresolvedProjectTokens: string[];
  unresolvedCategoryTokens: string[];
}

function fuzzyMatchOne<T extends { id: string; name: string }>(
  query: string,
  pool: T[],
): T | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  // 1. Exact case-insensitive match
  const exact = pool.find((p) => p.name.toLowerCase() === q);
  if (exact) return exact;
  // 2. Prefix match (only if exactly one)
  const prefixHits = pool.filter((p) => p.name.toLowerCase().startsWith(q));
  if (prefixHits.length === 1) return prefixHits[0];
  if (prefixHits.length > 1) return null;
  // 3. Substring match (only if exactly one)
  const subHits = pool.filter((p) => p.name.toLowerCase().includes(q));
  if (subHits.length === 1) return subHits[0];
  return null;
}

function parseEstimate(token: string): number | null {
  // Strips the leading ~. Accepts: 30m, 2h, 1.5h, 90m, etc.
  const m = /^([0-9]+(?:\.[0-9]+)?)(m|h)$/i.exec(token);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (!Number.isFinite(val) || val <= 0) return null;
  const unit = m[2].toLowerCase();
  return unit === 'h' ? Math.round(val * 3600) : Math.round(val * 60);
}

export function parseQuickAdd(
  input: string,
  projects: ProjectType[],
  categories: CategoryType[],
  filters: Filters,
  now: Date = new Date(),
): ParsedQuickAdd {
  // Seed inheritance from active filters.
  const projectIds: string[] = [...filters.project_ids];
  const inheritedProjectIds = new Set(filters.project_ids);
  const categoryIds: string[] = [...filters.category_ids];
  const inheritedCategoryIds = new Set(filters.category_ids);
  const priorityFromFilter = filters.priorities[0] ?? null;
  let priority: Priority | null = priorityFromFilter;
  let priorityInherited = priorityFromFilter !== null;

  let estimateSeconds: number | null = null;
  let dueDate: string | null = null;
  let subtasks: string[] = [];
  const unresolvedProjectTokens: string[] = [];
  const unresolvedCategoryTokens: string[] = [];

  // 1. Subtasks first — consume everything after `->`.
  let working = input;
  const arrowIdx = working.indexOf('->');
  if (arrowIdx >= 0) {
    const after = working.slice(arrowIdx + 2);
    subtasks = after
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    working = working.slice(0, arrowIdx);
  }

  // 2. @project tokens
  working = working.replace(/@([\w\-]+)/g, (_, name: string) => {
    const match = fuzzyMatchOne(name, projects);
    if (match) {
      // Override inherited single-project filter; otherwise extend selection.
      // If we had a single inherited project that the user is overriding,
      // drop it before adding the new one.
      if (inheritedProjectIds.size > 0 && inheritedProjectIds.has(projectIds[0]) && projectIds.length === 1) {
        projectIds.length = 0;
        inheritedProjectIds.clear();
      }
      if (!projectIds.includes(match.id)) projectIds.push(match.id);
    } else {
      unresolvedProjectTokens.push(name);
    }
    return ''; // strip from working text
  });

  // 3. #category tokens
  working = working.replace(/#([\w\-]+)/g, (_, name: string) => {
    const match = fuzzyMatchOne(name, categories);
    if (match) {
      if (inheritedCategoryIds.size > 0 && inheritedCategoryIds.has(categoryIds[0]) && categoryIds.length === 1) {
        categoryIds.length = 0;
        inheritedCategoryIds.clear();
      }
      if (!categoryIds.includes(match.id)) categoryIds.push(match.id);
    } else {
      unresolvedCategoryTokens.push(name);
    }
    return '';
  });

  // 4. Priority — !!! / !! / ! (longest first to avoid !! eating !!!)
  const priorityMatch = /(?:^|\s)(!!!|!!|!)(?:\s|$)/.exec(working);
  if (priorityMatch) {
    const bangs = priorityMatch[1];
    priority =
      bangs === '!!!' ? 'urgent' : bangs === '!!' ? 'medium' : 'low';
    priorityInherited = false;
    working = working.replace(priorityMatch[0], ' ');
  }

  // 5. Estimate — ~30m / ~2h / ~1.5h
  const estMatch = /(?:^|\s)~([0-9]+(?:\.[0-9]+)?[mh])(?:\s|$)/i.exec(working);
  if (estMatch) {
    const seconds = parseEstimate(estMatch[1]);
    if (seconds !== null) {
      estimateSeconds = seconds;
      working = working.replace(estMatch[0], ' ');
    }
  }

  // 6. Due date — first natural-language date phrase
  const dateHit = findDateInText(working, now);
  if (dateHit) {
    dueDate = dateHit.date;
    // Remove the matched substring case-insensitively. Only strip the first
    // occurrence to avoid accidentally removing the same word elsewhere.
    const i = working.toLowerCase().indexOf(dateHit.raw.toLowerCase());
    if (i >= 0) {
      working = working.slice(0, i) + working.slice(i + dateHit.raw.length);
    }
  }

  // 7. Title — whatever's left, normalized whitespace
  const title = working.replace(/\s+/g, ' ').trim();

  return {
    title,
    projectIds,
    inheritedProjectIds,
    categoryIds,
    inheritedCategoryIds,
    priority,
    priorityInherited,
    estimateSeconds,
    dueDate,
    subtasks,
    unresolvedProjectTokens,
    unresolvedCategoryTokens,
  };
}
