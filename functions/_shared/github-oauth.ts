import { base64Url, clearSessionCookie, hasAuthSettings, randomToken, sessionCookie, sha256 } from './auth';
import { requireSameOrigin } from './auth';
import type { PagesContext } from './types';
import { json } from './types';

const STATE_SECONDS = 10 * 60;
const RATE_WINDOW_SECONDS = 15 * 60;
const RATE_LIMIT = 10;

type CallbackFailureCategory =
  | 'rate_limit_check'
  | 'state_validation'
  | 'github_code_exchange_transport'
  | 'github_code_exchange_redirect'
  | 'github_code_exchange_http'
  | 'github_code_exchange_content_type'
  | 'github_code_exchange_response'
  | 'github_profile_redirect'
  | 'github_profile_verification'
  | 'session_persistence'
  | 'session_response';

type SafeTransportErrorClass = 'TimeoutError' | 'AbortError' | 'TypeError' | 'Error' | 'Other';

function safeTransportErrorClass(error: unknown): SafeTransportErrorClass {
  if (error instanceof DOMException) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return error.name;
    return 'Other';
  }
  if (error instanceof TypeError) return 'TypeError';
  if (error instanceof Error && error.constructor === Error) return 'Error';
  return 'Other';
}

function callbackFailure(category: CallbackFailureCategory, status?: number, errorClass?: SafeTransportErrorClass): Response {
  const requestId = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  // Never log the exception, request URL, or provider response: these can contain
  // OAuth parameters or credentials. Log only fixed diagnostic fields and an
  // opaque ID; errorClass is selected from a fixed allow-list below.
  console.error('pickora_oauth_callback_failure', { category, ...(status === undefined ? {} : { status }), ...(errorClass === undefined ? {} : { errorClass }), requestId });
  return json({ error: 'Sign-in could not be completed. Please try again shortly.', requestId }, 503);
}

function noStoreRedirect(location: string, status = 302, cookie?: string): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(null, { status, headers });
}

function validConfig(context: PagesContext): { clientId: string; clientSecret: string; ownerId: string; callbackUrl: URL } | Response {
  const { GITHUB_CLIENT_ID: clientId, GITHUB_CLIENT_SECRET: clientSecret, GITHUB_OWNER_ID: ownerId, GITHUB_OAUTH_CALLBACK_URL: callbackValue } = context.env;
  if (!hasAuthSettings(context.env) || !clientId || !clientSecret || !ownerId || !callbackValue) {
    return json({ error: 'GitHub sign-in is not configured yet.' }, 503);
  }
  if (!/^\d+$/.test(ownerId) || !/^[\w.-]{1,100}$/.test(clientId) || clientSecret.length > 500) {
    return json({ error: 'GitHub sign-in configuration is invalid.' }, 503);
  }
  try {
    const callbackUrl = new URL(callbackValue);
    if (callbackUrl.protocol !== 'https:' || callbackUrl.username || callbackUrl.password || callbackUrl.search || callbackUrl.hash || callbackUrl.pathname !== '/api/admin/auth/callback') {
      return json({ error: 'GitHub sign-in callback configuration is invalid.' }, 503);
    }
    if (callbackUrl.origin !== new URL(context.request.url).origin) return json({ error: 'Sign-in is available only on the configured production hostname.' }, 403);
    return { clientId, clientSecret, ownerId, callbackUrl };
  } catch {
    return json({ error: 'GitHub sign-in callback configuration is invalid.' }, 503);
  }
}

async function rateKey(context: PagesContext, kind: string): Promise<string> {
  const ip = context.request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const secret = context.env.GITHUB_CLIENT_SECRET!;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${kind}\0${ip.slice(0, 100)}`));
  return `${kind}:${base64Url(new Uint8Array(digest))}`;
}

async function allowAttempt(context: PagesContext, kind: string): Promise<boolean> {
  const db = context.env.DB;
  if (!db) return false;
  const now = Math.floor(Date.now() / 1000);
  const bucket = await rateKey(context, kind);
  await db.prepare('DELETE FROM admin_auth_rate_limits WHERE expires_at <= ?').bind(now).run();
  const result = await db.prepare(`
    INSERT INTO admin_auth_rate_limits (bucket_key, window_started_at, request_count, expires_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET
      window_started_at = CASE WHEN admin_auth_rate_limits.window_started_at <= ? THEN excluded.window_started_at ELSE admin_auth_rate_limits.window_started_at END,
      request_count = CASE WHEN admin_auth_rate_limits.window_started_at <= ? THEN 1 ELSE admin_auth_rate_limits.request_count + 1 END,
      expires_at = CASE WHEN admin_auth_rate_limits.window_started_at <= ? THEN excluded.expires_at ELSE admin_auth_rate_limits.expires_at END
    RETURNING request_count
  `).bind(bucket, now, now + RATE_WINDOW_SECONDS, now - RATE_WINDOW_SECONDS, now - RATE_WINDOW_SECONDS, now - RATE_WINDOW_SECONDS).first<{ request_count: number }>();
  return Boolean(result && result.request_count <= RATE_LIMIT);
}

async function startLogin(context: PagesContext): Promise<Response> {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  const config = validConfig(context);
  if (config instanceof Response) return config;
  const db = context.env.DB;
  if (!db) return json({ error: 'Admin database is not connected.' }, 503);
  try {
    if (!await allowAttempt(context, 'login')) return json({ error: 'Too many sign-in attempts. Wait 15 minutes and try again.' }, 429, { 'Retry-After': String(RATE_WINDOW_SECONDS) });
    const now = Math.floor(Date.now() / 1000);
    await db.prepare('DELETE FROM admin_oauth_states WHERE expires_at <= ?').bind(now).run();
    await db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now).run();
    const state = randomToken();
    await db.prepare('INSERT INTO admin_oauth_states (state_hash, expires_at, created_at) VALUES (?, ?, ?)')
      .bind(await sha256(state), now + STATE_SECONDS, now).run();
    const authorize = new URL('https://github.com/login/oauth/authorize');
    authorize.searchParams.set('client_id', config.clientId);
    authorize.searchParams.set('redirect_uri', config.callbackUrl.toString());
    authorize.searchParams.set('state', state);
    // No scope parameter: the app only reads the signed-in account's public identity.
    return noStoreRedirect(authorize.toString());
  } catch {
    return json({ error: 'Could not start sign-in. Please try again shortly.' }, 503);
  }
}

async function consumeState(context: PagesContext, state: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !context.env.DB) return false;
  const now = Math.floor(Date.now() / 1000);
  const result = await context.env.DB.prepare(
    'DELETE FROM admin_oauth_states WHERE state_hash = ? AND expires_at > ? RETURNING state_hash'
  ).bind(await sha256(state), now).first<{ state_hash: string }>();
  return Boolean(result);
}

async function callback(context: PagesContext): Promise<Response> {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  const config = validConfig(context);
  if (config instanceof Response) return config;
  const db = context.env.DB;
  if (!db) return json({ error: 'Admin database is not connected.' }, 503);
  let failureCategory: CallbackFailureCategory = 'rate_limit_check';
  let failureStatus: number | undefined;
  try {
    if (!await allowAttempt(context, 'callback')) return json({ error: 'Too many sign-in attempts. Wait 15 minutes and try again.' }, 429, { 'Retry-After': String(RATE_WINDOW_SECONDS) });
    const url = new URL(context.request.url);
    const state = url.searchParams.get('state') ?? '';
    failureCategory = 'state_validation';
    if (!await consumeState(context, state)) return json({ error: 'Sign-in state is missing, expired, invalid, or already used. Start again.' }, 400);
    if (url.searchParams.has('error')) return json({ error: 'GitHub sign-in was cancelled. You can close this page and try again.' }, 401);
    const code = url.searchParams.get('code') ?? '';
    if (!code || code.length > 512 || !/^[A-Za-z0-9._-]+$/.test(code)) return json({ error: 'GitHub did not return a valid authorization code.' }, 400);

    const tokenBody = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callbackUrl.toString(),
    });
    failureCategory = 'github_code_exchange_transport';
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Pickora-Admin' },
      body: tokenBody.toString(),
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    failureStatus = tokenResponse.status;
    if (failureStatus >= 300 && failureStatus < 400) {
      await tokenResponse.body?.cancel();
      return callbackFailure('github_code_exchange_redirect', failureStatus);
    }
    if (!tokenResponse.ok) return callbackFailure('github_code_exchange_http', failureStatus);
    failureCategory = 'github_code_exchange_content_type';
    const contentType = tokenResponse.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json' && !contentType?.endsWith('+json')) {
      return callbackFailure('github_code_exchange_content_type', failureStatus);
    }
    failureCategory = 'github_code_exchange_response';
    const tokenData = await tokenResponse.json() as { access_token?: unknown; token_type?: unknown; scope?: unknown; error?: unknown };
    if (typeof tokenData.access_token !== 'string' || tokenData.access_token.length < 10 || tokenData.access_token.length > 4096 || tokenData.token_type !== 'bearer') {
      return callbackFailure('github_code_exchange_response', failureStatus);
    }

    failureStatus = undefined;
    failureCategory = 'github_profile_verification';
    const userResponse = await fetch('https://api.github.com/user', {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${tokenData.access_token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Pickora-Admin' },
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    if (userResponse.status >= 300 && userResponse.status < 400) {
      await userResponse.body?.cancel();
      return callbackFailure('github_profile_redirect', userResponse.status);
    }
    if (!userResponse.ok) return json({ error: 'GitHub sign-in could not be verified. Please start again.' }, 502);
    const user = await userResponse.json() as { id?: unknown; login?: unknown };
    if (!Number.isSafeInteger(user.id) || typeof user.login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(user.login)) {
      return json({ error: 'GitHub returned an invalid account identity.' }, 401);
    }
    if (String(user.id) !== config.ownerId) return json({ error: 'This GitHub account is not authorized for Pickora admin.' }, 403);

    const token = randomToken();
    const now = Math.floor(Date.now() / 1000);
    failureCategory = 'session_persistence';
    await db.prepare('INSERT INTO admin_sessions (token_hash, github_user_id, github_login, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256(token), String(user.id), user.login, now + 8 * 60 * 60, now).run();
    failureCategory = 'session_response';
    return noStoreRedirect('/admin/', 303, sessionCookie(token));
  } catch (error) {
    const errorClass = failureCategory === 'github_code_exchange_transport' ? safeTransportErrorClass(error) : undefined;
    return callbackFailure(failureCategory, failureStatus, errorClass);
  }
}

async function logout(context: PagesContext): Promise<Response> {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  const csrf = requireSameOrigin(context);
  if (csrf) return csrf;
  try {
    const token = context.request.headers.get('Cookie')?.split(';')
      .map((part) => part.trim()).find((part) => part.startsWith('__Host-pickora_session='))?.slice('__Host-pickora_session='.length);
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token) && context.env.DB) {
      await context.env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    }
    return new Response(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return json({ error: 'Could not end the session. Please try again.' }, 503);
  }
}

export async function handleGitHubOAuth(context: PagesContext): Promise<Response | null> {
  const path = new URL(context.request.url).pathname;
  if (path === '/api/admin/auth/login') return startLogin(context);
  if (path === '/api/admin/auth/callback') return callback(context);
  if (path === '/api/admin/auth/logout') return logout(context);
  return null;
}

export const oauthInternals = { consumeState, allowAttempt, validConfig, rateLimit: RATE_LIMIT, rateWindowSeconds: RATE_WINDOW_SECONDS };
