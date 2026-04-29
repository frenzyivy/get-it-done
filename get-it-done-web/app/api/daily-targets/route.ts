import 'server-only';
import {
  requireUser,
  withCors,
  preflight,
  badRequest,
  serverError,
} from '../_shared';

export const runtime = 'nodejs';

export const OPTIONS = () => preflight();

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Day = (typeof DAYS)[number];

const VALID_PRESETS = new Set([
  'balanced',
  'weekend-off',
  'hustle',
  'custom',
]);

// DB defaults from migration 0024 — the "Balanced" preset.
const DEFAULTS = {
  mon: 16, tue: 16, wed: 18, thu: 16, fri: 14, sat: 12, sun: 8,
  preset_name: 'balanced' as const,
};

// GET /api/daily-targets — read this user's row, lazy-creating defaults if
// missing. Returns the full row in canonical shape.
export async function GET() {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const { data, error: qErr } = await supa
    .from('daily_targets')
    .select('user_id, mon, tue, wed, thu, fri, sat, sun, preset_name')
    .eq('user_id', user.id)
    .maybeSingle();
  if (qErr) return withCors(serverError(qErr.message));

  if (!data) {
    const { data: inserted, error: insErr } = await supa
      .from('daily_targets')
      .insert({ user_id: user.id, ...DEFAULTS })
      .select('user_id, mon, tue, wed, thu, fri, sat, sun, preset_name')
      .single();
    if (insErr) return withCors(serverError(insErr.message));
    return withCors(Response.json({ daily_targets: inserted }));
  }

  return withCors(Response.json({ daily_targets: data }));
}

// PUT /api/daily-targets — full upsert. Body: { mon?, tue?, … sun?, preset_name? }.
// Each numeric field must be 0..24. preset_name must be one of the 4 valid values.
export async function PUT(req: Request) {
  const { user, supa, error } = await requireUser();
  if (error) return withCors(error);

  const body = (await req.json().catch(() => null)) as
    | (Partial<Record<Day, number>> & { preset_name?: string | null })
    | null;
  if (!body) return withCors(badRequest('invalid body'));

  const updates: Record<string, unknown> = {};
  for (const day of DAYS) {
    const v = body[day];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 24) {
      return withCors(badRequest(`${day}: must be a number 0..24`));
    }
    updates[day] = v;
  }
  if (body.preset_name !== undefined) {
    if (body.preset_name === null) {
      updates.preset_name = null;
    } else if (
      typeof body.preset_name !== 'string' ||
      !VALID_PRESETS.has(body.preset_name)
    ) {
      return withCors(badRequest('invalid preset_name'));
    } else {
      updates.preset_name = body.preset_name;
    }
  }
  if (Object.keys(updates).length === 0) {
    return withCors(badRequest('nothing to update'));
  }

  // Upsert so the first write succeeds even if the row was never lazy-created.
  const { data, error: upErr } = await supa
    .from('daily_targets')
    .upsert({ user_id: user.id, ...DEFAULTS, ...updates }, { onConflict: 'user_id' })
    .select('user_id, mon, tue, wed, thu, fri, sat, sun, preset_name')
    .single();
  if (upErr) return withCors(serverError(upErr.message));
  return withCors(Response.json({ daily_targets: data }));
}
