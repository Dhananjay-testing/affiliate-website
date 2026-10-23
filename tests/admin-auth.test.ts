import assert from 'node:assert/strict';
import { getIdentity, sessionTokenFrom, sha256 } from '../functions/_shared/auth';
import { handleAdminApi } from '../functions/_shared/admin-api';
import { handleGitHubOAuth, oauthInternals } from '../functions/_shared/github-oauth';
import type { D1Database, D1Statement, PagesContext } from '../functions/_shared/types';

type Row = Record<string, unknown>;
class MemoryD1 implements D1Database {
  states = new Map<string, Row>();
  sessions = new Map<string, Row>();
  limits = new Map<string, Row>();
  prepare(sql: string): D1Statement {
    const store = this;
    const values: unknown[] = [];
    const statement = {
      bind(...params: unknown[]) { values.splice(0, values.length, ...params); return statement; },
      async first<T>() {
        if (sql.includes('DELETE FROM admin_oauth_states') && sql.includes('RETURNING')) {
          const [key, now] = values as [string, number];
          const row = store.states.get(key);
          store.states.delete(key);
          return (row && Number(row.expires_at) > now ? row : null) as T | null;
        }
        if (sql.includes('SELECT github_user_id')) return (store.sessions.get(String(values[0])) ?? null) as T | null;
        if (sql.includes('RETURNING request_count')) {
          const [key, now, expires, cutoff] = values as [string, number, number, number, number, number];
          const previous = store.limits.get(key);
          const reset = !previous || Number(previous.window_started_at) <= cutoff;
          const row = { bucket_key: key, window_started_at: reset ? now : previous!.window_started_at, request_count: reset ? 1 : Number(previous!.request_count) + 1, expires_at: reset ? expires : previous!.expires_at };
          store.limits.set(key, row);
          return { request_count: row.request_count } as T;
        }
        return null;
      },
      async all<T>() { return { success: true, results: [] as T[] }; },
      async run() {
        if (sql.includes('INSERT INTO admin_oauth_states')) {
          const [key, expires, created] = values as [string, number, number];
          store.states.set(key, { state_hash: key, expires_at: expires, created_at: created });
        } else if (sql.includes('INSERT INTO admin_sessions')) {
          const [hash, id, login, expires, created] = values as [string, string, string, number, number];
          store.sessions.set(hash, { token_hash: hash, github_user_id: id, github_login: login, expires_at: expires, created_at: created });
        } else if (sql.includes('DELETE FROM admin_sessions WHERE token_hash = ? AND expires_at <= ?')) {
          const [hash] = values as [string, number]; store.sessions.delete(hash);
        } else if (sql.includes('DELETE FROM admin_sessions WHERE token_hash = ?')) {
          const [hash] = values as [string]; store.sessions.delete(hash);
        } else if (sql.includes('DELETE FROM admin_oauth_states WHERE expires_at')) {
          const [now] = values as [number]; for (const [key, row] of store.states) if (Number(row.expires_at) <= now) store.states.delete(key);
        } else if (sql.includes('DELETE FROM admin_sessions WHERE expires_at')) {
          const [now] = values as [number]; for (const [key, row] of store.sessions) if (Number(row.expires_at) <= now) store.sessions.delete(key);
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return statement;
  }
  async batch<T = unknown>() { return [{ success: true, results: [] as T[] }]; }
}

const ownerId = '12345678';
const env: PagesContext['env'] = {
  DB: new MemoryD1(),
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'server-only-secret',
  GITHUB_OWNER_ID: ownerId,
  GITHUB_OAUTH_CALLBACK_URL: 'https://affiliate-website-a1v.pages.dev/api/admin/auth/callback',
};
const origin = 'https://affiliate-website-a1v.pages.dev';
function context(path: string, options: { method?: string; headers?: HeadersInit; env?: PagesContext['env'] } = {}): PagesContext {
  return {
    request: new Request(`${origin}${path}`, { method: options.method ?? 'GET', headers: options.headers }),
    env: options.env ?? env,
    params: {},
    next: async () => new Response('next'),
    waitUntil: () => {},
  };
}
function db(): MemoryD1 { return env.DB as MemoryD1; }
async function withFetch(responder: (url: string, init?: RequestInit) => Response | Promise<Response>, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => responder(String(input), init)) as typeof fetch;
  return run().finally(() => { globalThis.fetch = original; });
}
async function beginLogin(): Promise<{ state: string; authorizeUrl: URL }> {
  const response = await handleGitHubOAuth(context('/api/admin/auth/login', { headers: { 'CF-Connecting-IP': '192.0.2.10' } }));
  assert.equal(response?.status, 302);
  const authorizeUrl = new URL(response!.headers.get('Location')!);
  const state = authorizeUrl.searchParams.get('state')!;
  assert.equal(authorizeUrl.searchParams.has('scope'), false);
  return { state, authorizeUrl };
}

const tests: Array<[string, () => void | Promise<void>]> = [
  ['completes owner OAuth login and sets secure opaque session cookie', async () => {
    await withFetch(async (url, init) => {
      if (url === 'https://github.com/login/oauth/access_token') {
        assert.equal(init?.method, 'POST');
        assert.match(String(init?.body), /server-only-secret/);
        return Response.json({ access_token: 'github-access-token-long', token_type: 'bearer', scope: '' });
      }
      assert.equal(url, 'https://api.github.com/user');
      assert.match(new Headers(init?.headers).get('Authorization') ?? '', /^Bearer github-access-token-long$/);
      return Response.json({ id: Number(ownerId), login: 'pickora-owner' });
    }, async () => {
      const { state } = await beginLogin();
      const response = await handleGitHubOAuth(context(`/api/admin/auth/callback?code=one-time-code&state=${state}`, { headers: { 'CF-Connecting-IP': '192.0.2.10' } }));
      assert.equal(response?.status, 303);
      assert.equal(response?.headers.get('Location'), '/admin/');
      const cookie = response?.headers.get('Set-Cookie') ?? '';
      assert.match(cookie, /^__Host-pickora_session=[A-Za-z0-9_-]{43};/);
      assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\//);
      assert.doesNotMatch(await response!.text(), /server-only-secret|github-access-token-long/);
      const token = sessionTokenFrom(new Request(origin, { headers: { Cookie: cookie.split(';')[0]! } }));
      assert.ok(token);
      const hash = await sha256(token!);
      assert.ok(db().sessions.has(hash));
      assert.notEqual(hash, token);
      assert.deepEqual(await getIdentity(context('/api/admin/session', { headers: { Cookie: cookie.split(';')[0]! } })), { githubUserId: ownerId, login: 'pickora-owner' });
    });
  }],
  ['rejects a different GitHub numeric user ID', async () => {
    await withFetch((url) => url.endsWith('/access_token')
      ? Response.json({ access_token: 'github-access-token-long', token_type: 'bearer' })
      : Response.json({ id: Number(ownerId) + 1, login: 'not-owner' }), async () => {
      const { state } = await beginLogin();
      const response = await handleGitHubOAuth(context(`/api/admin/auth/callback?code=code&state=${state}`, { headers: { 'CF-Connecting-IP': '192.0.2.11' } }));
      assert.equal(response?.status, 403);
      assert.equal(response?.headers.has('Set-Cookie'), false);
      assert.equal(db().sessions.size, 1);
    });
  }],
  ['rejects invalid, missing, expired, and reused OAuth state', async () => {
    const missing = await handleGitHubOAuth(context('/api/admin/auth/callback?code=code', { headers: { 'CF-Connecting-IP': '192.0.2.12' } }));
    assert.equal(missing?.status, 400);
    const { state } = await beginLogin();
    const invalid = await handleGitHubOAuth(context(`/api/admin/auth/callback?code=code&state=${'A'.repeat(43)}`, { headers: { 'CF-Connecting-IP': '192.0.2.13' } }));
    assert.equal(invalid?.status, 400);
    const hash = await sha256(state);
    db().states.set(hash, { state_hash: hash, expires_at: 1, created_at: 0 });
    assert.equal(await oauthInternals.consumeState(context('/'), state), false);
    const { state: singleUse } = await beginLogin();
    assert.equal(await oauthInternals.consumeState(context('/'), singleUse), true);
    assert.equal(await oauthInternals.consumeState(context('/'), singleUse), false);
  }],
  ['rejects expired sessions', async () => {
    const token = 'A'.repeat(43); const hash = await sha256(token);
    db().sessions.set(hash, { token_hash: hash, github_user_id: ownerId, github_login: 'pickora-owner', expires_at: 1, created_at: 0 });
    const identity = await getIdentity(context('/api/admin/session', { headers: { Cookie: `__Host-pickora_session=${token}` } }));
    assert.equal(identity, null);
    assert.equal(db().sessions.has(hash), false);
  }],
  ['rejects unauthenticated admin API requests', async () => {
    const response = await handleAdminApi(context('/api/admin/products', { env: {} }));
    assert.equal(response.status, 401);
  }],
  ['retains CSRF rejection for data-changing admin API requests', async () => {
    const local = context('/api/admin/products', { method: 'POST', env: { PICKORA_LOCAL_AUTH: 'true' } });
    local.request = new Request('http://127.0.0.1/api/admin/products', { method: 'POST' });
    const response = await handleAdminApi(local);
    assert.equal(response.status, 403);
  }],
  ['logout revokes the session and clears the secure cookie', async () => {
    const token = 'B'.repeat(43); const hash = await sha256(token);
    db().sessions.set(hash, { token_hash: hash, github_user_id: ownerId, github_login: 'pickora-owner', expires_at: Math.floor(Date.now() / 1000) + 1000, created_at: 1 });
    const response = await handleGitHubOAuth(context('/api/admin/auth/logout', { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'X-Pickora-CSRF': '1', Cookie: `__Host-pickora_session=${token}` } }));
    assert.equal(response?.status, 204);
    assert.match(response?.headers.get('Set-Cookie') ?? '', /Max-Age=0/);
    assert.match(response?.headers.get('Set-Cookie') ?? '', /HttpOnly; Secure; SameSite=Lax/);
    assert.equal(db().sessions.has(hash), false);
    assert.equal(await getIdentity(context('/api/admin/session', { headers: { Cookie: `__Host-pickora_session=${token}` } })), null);
  }],
  ['prevents the local bypass from authenticating production Pages URLs', async () => {
    const productionEnv = { PICKORA_LOCAL_AUTH: 'true' };
    assert.equal(await getIdentity(context('/api/admin/session', { env: productionEnv })), null);
    const response = await handleAdminApi(context('/api/admin/products', { env: productionEnv }));
    assert.equal(response.status, 401);
  }],
  ['limits repeated login attempts using D1-backed counters', async () => {
    let response: Response | null = null;
    for (let i = 0; i < oauthInternals.rateLimit; i++) {
      response = await handleGitHubOAuth(context('/api/admin/auth/login', { headers: { 'CF-Connecting-IP': '192.0.2.44' } }));
      assert.equal(response?.status, 302);
    }
    response = await handleGitHubOAuth(context('/api/admin/auth/login', { headers: { 'CF-Connecting-IP': '192.0.2.44' } }));
    assert.equal(response?.status, 429);
  }],
];

for (const [name, run] of tests) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}
console.log(`Admin authentication tests passed: ${tests.length}.`);
