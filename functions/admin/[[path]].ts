import { getIdentity } from '../_shared/auth';
import type { PagesHandler } from '../_shared/types';

export const onRequest: PagesHandler = async (context) => {
  const identity = await getIdentity(context);
  if (!identity) {
    if (context.request.headers.get('Accept')?.includes('text/html')) {
      return new Response(null, { status: 302, headers: { Location: '/api/admin/auth/login', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    }
    return new Response('Authentication required. Sign in with the configured GitHub account.', {
      status: 401,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
