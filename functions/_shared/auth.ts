import type { PagesContext } from './types';

export interface Identity { githubUserId: string; login: string; }

const SESSION_COOKIE = '__Host-pickora_session';
const SESSION_SECONDS = 8 * 60 * 60;

function loopback(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie') ?? '';
  for (const part of cookie.split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    return part.slice(index + 1).trim() || null;
  }
  return null;
}

export function sessionCookie(token: string, maxAge = SESSION_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return sessionCookie('', 0);
}

export function sessionTokenFrom(request: Request): string | null {
  const token = cookieValue(request, SESSION_COOKIE);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(bytes));
}

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

export async function getIdentity(context: PagesContext): Promise<Identity | null> {
  const { request, env } = context;
  const hostname = new URL(request.url).hostname;
  // This bypass is deliberately restricted to a loopback URL. A production Pages
  // hostname can never satisfy this condition, even if the variable is mis-set.
  if (env.PICKORA_LOCAL_AUTH === 'true' && loopback(hostname)) {
    return { githubUserId: 'local-owner', login: 'local-owner' };
  }

  const token = sessionTokenFrom(request);
  const db = env.DB;
  if (!token || !db) return null;
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  const session = await db.prepare(
    'SELECT github_user_id, github_login, expires_at FROM admin_sessions WHERE token_hash = ?'
  ).bind(tokenHash).first<{ github_user_id: string; github_login: string; expires_at: number }>();
  if (!session) return null;
  if (session.expires_at <= now) {
    await db.prepare('DELETE FROM admin_sessions WHERE token_hash = ? AND expires_at <= ?').bind(tokenHash, now).run();
    return null;
  }
  if (!/^\d+$/.test(session.github_user_id) || !session.github_login) return null;
  return { githubUserId: session.github_user_id, login: session.github_login };
}

export async function requireIdentity(context: PagesContext): Promise<Identity | Response> {
  const identity = await getIdentity(context);
  if (identity) return identity;
  return new Response(JSON.stringify({ error: 'Authentication required.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export function requireSameOrigin(context: PagesContext): Response | null {
  const { request } = context;
  const origin = request.headers.get('Origin');
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  const csrfHeader = request.headers.get('X-Pickora-CSRF');
  if (!origin || origin !== new URL(request.url).origin || (fetchSite && fetchSite !== 'same-origin') || csrfHeader !== '1') {
    return new Response(JSON.stringify({ error: 'Request origin could not be verified. Refresh the page and try again.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  return null;
}

export function hasAuthSettings(env: PagesContext['env']): boolean {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.GITHUB_OWNER_ID);
}

export { SESSION_COOKIE, SESSION_SECONDS };
