import type { APIRoute } from 'astro';
import { site } from '../config/site';

export const GET: APIRoute = () => {
  const body = `User-agent: *\nAllow: /\n${site.url ? `Sitemap: ${new URL('/sitemap.xml', site.url).toString()}\n` : ''}`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
