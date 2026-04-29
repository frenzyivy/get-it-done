// Phase 6 polish — Dashboard chrome reskin.
//
// The redesign palette is strict B&W for chrome. User-chosen category /
// project / tag colors are part of the data model and keep their hue.
// Semantic colors (success green, warning yellow, error red, info blue,
// streak orange) also stay — they're not "chrome".
//
// This module exists primarily as a documentation anchor for the swap. Most
// existing components use inline hex literals, not these constants — the
// reskin pass replaced those literals directly. New code should import from
// here so the next refresh is a one-stop change.

/** System ink — primary text, primary action background, "current focus" black surfaces. */
export const INK = '#1a1a2e';

/** Mid-grey for secondary text. */
export const INK_SOFT = '#5b5674';

/** Lighter grey for placeholder + de-emphasized labels. */
export const INK_MUTE = '#9ca3af';

/** Border / hairline divider. */
export const LINE = '#e5e7eb';

/** Neutral very-soft background for inactive pills, hover panels. */
export const LINE_SOFT = '#f3f4f6';

/** Page background per spec §design-system. */
export const PAGE_BG = '#e8e8ea';

/** White card surface. */
export const CARD = '#ffffff';

// ---- Chrome tints (replace rgba(139,92,246, X) calls) -------------------
// Black-on-translucent gives the same tint shape as the old purple alphas.

export const INK_TINT_05 = 'rgba(0,0,0,0.05)';
export const INK_TINT_08 = 'rgba(0,0,0,0.08)';
export const INK_TINT_12 = 'rgba(0,0,0,0.12)';
export const INK_TINT_18 = 'rgba(0,0,0,0.18)';
export const INK_TINT_25 = 'rgba(0,0,0,0.25)';
