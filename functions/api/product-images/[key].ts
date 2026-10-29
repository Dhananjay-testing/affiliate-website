import type { PagesHandler } from '../../_shared/types';

const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const onRequest: PagesHandler = async ({ request, env, params }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed.', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  const key = String(params.key ?? '');
  if (!keyPattern.test(key)) return new Response('Not found.', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  if (!env.PRODUCT_IMAGES) return new Response('Product images are temporarily unavailable.', { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  try {
    const value = await env.PRODUCT_IMAGES.get(`product-images:${key}`, { type: 'arrayBuffer' });
    if (!value) return new Response('Not found.', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    const headers = {
      'Content-Type': 'image/webp',
      'Content-Length': String(value.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    };
    return new Response(request.method === 'HEAD' ? null : value, { status: 200, headers });
  } catch {
    return new Response('Product images are temporarily unavailable.', { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
};
