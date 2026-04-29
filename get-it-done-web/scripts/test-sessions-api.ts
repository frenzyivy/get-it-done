/**
 * Phase 1, step 2 — integration tests for the sessions/time-summary API.
 *
 * These tests hit a *running* `next dev` server backed by a *throwaway*
 * Supabase project. They prove the routes in app/api/sessions/** and
 * app/api/tasks/[id]/time-summary work end-to-end against real RLS, real
 * tracked_sessions writes, and real auth.
 *
 * SETUP
 * -----
 * 1. Create a fresh Supabase project (free tier, name it whatever — e.g.,
 *    "getitdone-throwaway-2026-04-25"). Apply the bundle:
 *      supabase/tests/full_bundle.sql
 *    in the SQL Editor.
 * 2. Copy the project's URL, anon key, and service-role key into a local
 *    .env.local in get-it-done-web/:
 *      NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *      NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
 *      SUPABASE_SERVICE_ROLE_KEY=eyJ...
 * 3. Start the dev server:    npm run dev    (defaults to http://localhost:3000)
 * 4. In a second terminal:
 *      cd get-it-done-web
 *      node --experimental-strip-types scripts/test-sessions-api.ts
 *
 * The script will:
 *   - mint two synthetic test users via auth.admin
 *   - seed each with a task, two subtasks
 *   - hit every route, asserting status codes + response shape + DB side-effects
 *   - tear down the test users (cascades to all their data) at the end
 *
 * SAFETY
 * ------
 * Idempotent and self-cleaning: any leftover users with email matching
 * `getitdone-test-*@example.invalid` are deleted at start AND at end.
 * Re-running this against a real production DB is GUARDED — it bails if
 * the URL contains the substring "prod" or doesn't have ".supabase.co".
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = mustEnv('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_KEY = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = mustEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000';

// Guard against pointing this at the wrong DB.
if (!SUPABASE_URL.includes('.supabase.co')) {
  throw new Error(`refusing to run: NEXT_PUBLIC_SUPABASE_URL doesn't look like a Supabase project URL: ${SUPABASE_URL}`);
}
if (/prod/i.test(SUPABASE_URL)) {
  throw new Error(`refusing to run: NEXT_PUBLIC_SUPABASE_URL contains 'prod'. Use a throwaway project.`);
}

const TEST_EMAIL_DOMAIN = 'example.invalid';
const TEST_EMAIL_PREFIX = 'getitdone-test-';
const TEST_PASSWORD = 'integration-test-password-9c2f4b'; // arbitrary

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  taskId: string;
  subtaskAId: string;
  subtaskBId: string;
}

async function createTestUser(suffix: string): Promise<TestUser> {
  const a = admin();
  const email = `${TEST_EMAIL_PREFIX}${suffix}-${Date.now()}@${TEST_EMAIL_DOMAIN}`;

  // 1. Create the auth user (this fires handle_new_user → seeds profiles,
  //    user_preferences, user_profiles, automation_rules).
  const { data: created, error: createErr } = await a.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`createUser failed for ${email}: ${createErr?.message}`);
  }
  const user: User = created.user;

  // 2. Sign in via anon client to get an access token usable as Bearer.
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signedIn, error: signInErr } = await anon.auth.signInWithPassword({
    email, password: TEST_PASSWORD,
  });
  if (signInErr || !signedIn.session) {
    throw new Error(`signIn failed for ${email}: ${signInErr?.message}`);
  }
  const accessToken = signedIn.session.access_token;

  // 3. Seed a task + two subtasks via service role (bypassing RLS).
  const { data: task, error: taskErr } = await a
    .from('tasks')
    .insert({ user_id: user.id, title: `__test__ task for ${suffix}` })
    .select('id')
    .single();
  if (taskErr || !task) throw new Error(`seed task: ${taskErr?.message}`);

  const { data: subs, error: subErr } = await a
    .from('subtasks')
    .insert([
      { task_id: task.id, title: '__test__ subtask A', sort_order: 0 },
      { task_id: task.id, title: '__test__ subtask B', sort_order: 1 },
    ])
    .select('id, sort_order')
    .order('sort_order', { ascending: true });
  if (subErr || !subs || subs.length !== 2) throw new Error(`seed subtasks: ${subErr?.message}`);

  return {
    id: user.id,
    email,
    accessToken,
    taskId: task.id as string,
    subtaskAId: subs[0].id as string,
    subtaskBId: subs[1].id as string,
  };
}

async function cleanupTestUsers(): Promise<void> {
  const a = admin();
  // List all users with our test prefix and delete them. Free-tier projects
  // cap at 50/page; we paginate just in case but bail after a few pages.
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await a.auth.admin.listUsers({ page, perPage: 50 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    if (!data.users.length) break;
    const stale = data.users.filter(
      (u) => u.email && u.email.startsWith(TEST_EMAIL_PREFIX),
    );
    for (const u of stale) {
      await a.auth.admin.deleteUser(u.id);
    }
    if (data.users.length < 50) break;
  }
}

interface ApiCallOpts {
  token: string;
  method?: string;
  body?: unknown;
}

async function api(path: string, opts: ApiCallOpts): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
  };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body,
  });
}

interface SessionShape {
  id: string;
  user_id: string;
  task_id: string | null;
  subtask_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  mode: string;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let alice: TestUser;
let bob: TestUser;

test('setup: prerequisites reachable', async () => {
  // Reach the dev server. /api/sessions/active without auth must 401, not
  // return HTML or 404 — that's the cheapest "is the server up + are routes
  // mounted" check.
  const res = await fetch(`${API_BASE}/api/sessions/active`);
  assert.equal(res.status, 401, `expected 401 from unauth call, got ${res.status} (is next dev running on ${API_BASE}?)`);
});

test('setup: clean stale test users', async () => {
  await cleanupTestUsers();
});

test('setup: seed two test users', async () => {
  alice = await createTestUser('alice');
  bob = await createTestUser('bob');
  assert.ok(alice.id);
  assert.ok(bob.id);
  assert.notEqual(alice.id, bob.id);
});

// ---------------------------------------------------------------------------
// POST /api/sessions/start
// ---------------------------------------------------------------------------

test('POST /api/sessions/start — happy path opens a session', async () => {
  const res = await api('/api/sessions/start', {
    token: alice.accessToken,
    method: 'POST',
    body: { task_id: alice.taskId, subtask_id: alice.subtaskAId, mode: 'open' },
  });
  assert.equal(res.status, 201);
  const json = await res.json() as { session: SessionShape; reused: boolean };
  assert.equal(json.reused, false);
  assert.equal(json.session.user_id, alice.id);
  assert.equal(json.session.task_id, alice.taskId);
  assert.equal(json.session.subtask_id, alice.subtaskAId);
  assert.equal(json.session.ended_at, null);
});

test('POST /api/sessions/start — idempotent on (task, subtask) pair', async () => {
  const res = await api('/api/sessions/start', {
    token: alice.accessToken,
    method: 'POST',
    body: { task_id: alice.taskId, subtask_id: alice.subtaskAId, mode: 'open' },
  });
  assert.equal(res.status, 200);
  const json = await res.json() as { session: SessionShape; reused: boolean };
  assert.equal(json.reused, true);
});

test('POST /api/sessions/start — concurrent timer on different subtask', async () => {
  // Same task, different subtask should produce a SECOND active row. This
  // proves migration 0015's intentional dropping of the unique-active index
  // still holds at the API layer.
  const res = await api('/api/sessions/start', {
    token: alice.accessToken,
    method: 'POST',
    body: { task_id: alice.taskId, subtask_id: alice.subtaskBId, mode: 'open' },
  });
  assert.equal(res.status, 201);
  const json = await res.json() as { session: SessionShape; reused: boolean };
  assert.equal(json.reused, false);

  // Confirm via DB that two rows are now active.
  const a = admin();
  const { data, error } = await a
    .from('tracked_sessions')
    .select('id')
    .eq('user_id', alice.id)
    .is('ended_at', null);
  assert.ifError(error);
  assert.equal(data?.length, 2);
});

test('POST /api/sessions/start — missing task_id → 400', async () => {
  const res = await api('/api/sessions/start', {
    token: alice.accessToken,
    method: 'POST',
    body: { mode: 'open' },
  });
  assert.equal(res.status, 400);
});

test('POST /api/sessions/start — invalid mode → 400', async () => {
  const res = await api('/api/sessions/start', {
    token: alice.accessToken,
    method: 'POST',
    body: { task_id: alice.taskId, mode: 'galaxy_brain' },
  });
  assert.equal(res.status, 400);
});

test('POST /api/sessions/start — no auth → 401', async () => {
  const res = await fetch(`${API_BASE}/api/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: alice.taskId }),
  });
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// GET /api/sessions/active
// ---------------------------------------------------------------------------

test('GET /api/sessions/active — returns both open sessions, oldest first', async () => {
  const res = await api('/api/sessions/active', { token: alice.accessToken });
  assert.equal(res.status, 200);
  const json = await res.json() as { sessions: SessionShape[] };
  assert.equal(json.sessions.length, 2);
  // Ordered ascending by started_at — earlier insert first.
  assert.equal(json.sessions[0].subtask_id, alice.subtaskAId);
  assert.equal(json.sessions[1].subtask_id, alice.subtaskBId);
});

test('GET /api/sessions/active — Bob sees zero (RLS isolation)', async () => {
  const res = await api('/api/sessions/active', { token: bob.accessToken });
  assert.equal(res.status, 200);
  const json = await res.json() as { sessions: SessionShape[] };
  assert.equal(json.sessions.length, 0);
});

// ---------------------------------------------------------------------------
// POST /api/sessions/[id]/stop
// ---------------------------------------------------------------------------

let firstSessionId: string;

test('POST /api/sessions/[id]/stop — closes one session, computes duration', async () => {
  // Grab the first session id.
  const listRes = await api('/api/sessions/active', { token: alice.accessToken });
  const list = await listRes.json() as { sessions: SessionShape[] };
  firstSessionId = list.sessions[0].id;

  // Wait long enough that duration_seconds is provably > 0.
  await new Promise((r) => setTimeout(r, 1100));

  const res = await api(`/api/sessions/${firstSessionId}/stop`, {
    token: alice.accessToken,
    method: 'POST',
  });
  assert.equal(res.status, 200);
  const json = await res.json() as { session: SessionShape };
  assert.equal(json.session.id, firstSessionId);
  assert.notEqual(json.session.ended_at, null);
  assert.ok((json.session.duration_seconds ?? 0) >= 1);
});

test('POST /api/sessions/[id]/stop — already-stopped session → 400', async () => {
  const res = await api(`/api/sessions/${firstSessionId}/stop`, {
    token: alice.accessToken,
    method: 'POST',
  });
  assert.equal(res.status, 400);
});

test('POST /api/sessions/[id]/stop — Bob cannot stop Alice\'s session → 400', async () => {
  // RLS hides Alice's row from Bob's session. The route fetches with the
  // user-bound client first, so Bob sees nothing → 400 "session not found".
  // Crucially NOT 200 (would be a security issue) and NOT 500.
  const listRes = await api('/api/sessions/active', { token: alice.accessToken });
  const list = await listRes.json() as { sessions: SessionShape[] };
  // Alice has one open session left.
  assert.equal(list.sessions.length, 1);
  const aliceSessionId = list.sessions[0].id;

  const res = await api(`/api/sessions/${aliceSessionId}/stop`, {
    token: bob.accessToken,
    method: 'POST',
  });
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// GET /api/tasks/[id]/time-summary
// ---------------------------------------------------------------------------

test('GET /api/tasks/[id]/time-summary — sums closed + live sessions', async () => {
  const res = await api(`/api/tasks/${alice.taskId}/time-summary`, {
    token: alice.accessToken,
  });
  assert.equal(res.status, 200);
  const json = await res.json() as {
    task_id: string;
    total_seconds: number;
    by_subtask: { subtask_id: string | null; total_seconds: number; is_active: boolean }[];
  };
  assert.equal(json.task_id, alice.taskId);
  // total_seconds: at least 1s from the closed session above (we slept >1s);
  // the still-open session on subtaskB also contributes live time.
  assert.ok(json.total_seconds >= 1, `expected total_seconds >= 1, got ${json.total_seconds}`);

  // by_subtask must include three buckets: null, A, B (zero buckets stable).
  const ids = json.by_subtask.map((b) => b.subtask_id).sort();
  const expected = [null, alice.subtaskAId, alice.subtaskBId].sort();
  assert.deepEqual(ids, expected);

  // The B bucket is the still-active one.
  const bBucket = json.by_subtask.find((b) => b.subtask_id === alice.subtaskBId);
  assert.ok(bBucket);
  assert.equal(bBucket!.is_active, true);

  // Null bucket has zero — we never tracked at the task level.
  const nullBucket = json.by_subtask.find((b) => b.subtask_id === null);
  assert.equal(nullBucket?.total_seconds, 0);
});

test('GET /api/tasks/[id]/time-summary — wrong task id → 400', async () => {
  // Bob asking for Alice's task → 400 (RLS hides it).
  const res = await api(`/api/tasks/${alice.taskId}/time-summary`, {
    token: bob.accessToken,
  });
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// GET /api/sessions/by-hour-of-week
// ---------------------------------------------------------------------------

test('GET /api/sessions/by-hour-of-week — returns 7x24 matrix', async () => {
  const res = await api('/api/sessions/by-hour-of-week?range=30d', {
    token: alice.accessToken,
  });
  assert.equal(res.status, 200);
  const json = await res.json() as {
    range: string; timezone: string; seconds_by_day_hour: number[][];
  };
  assert.equal(json.range, '30d');
  assert.equal(json.seconds_by_day_hour.length, 7);
  for (const row of json.seconds_by_day_hour) assert.equal(row.length, 24);

  // Sum of all cells should equal the closed-session duration we have on file.
  // (Open sessions don't have duration_seconds yet, so they're excluded.)
  const total = json.seconds_by_day_hour.flat().reduce((a, b) => a + b, 0);
  assert.ok(total >= 1, `expected at least 1s in matrix, got ${total}`);
});

test('GET /api/sessions/by-hour-of-week — bad range → 400', async () => {
  const res = await api('/api/sessions/by-hour-of-week?range=garbage', {
    token: alice.accessToken,
  });
  assert.equal(res.status, 400);
});

test('GET /api/sessions/by-hour-of-week — defaults to 30d when no range', async () => {
  const res = await api('/api/sessions/by-hour-of-week', {
    token: alice.accessToken,
  });
  assert.equal(res.status, 200);
  const json = await res.json() as { range: string };
  assert.equal(json.range, '30d');
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

test('teardown: delete test users (cascades to all data)', async () => {
  await cleanupTestUsers();
});
