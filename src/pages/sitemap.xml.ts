import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { categories } from '../data/categories';
import { published } from '../lib/content';
import { site } from '../config/site';

export const GET: APIRoute = async () => {
  // The policy and terms routes remain available for review but are drafts until the owner approves their final wording.
  const staticPaths = ['/', '/categories/', '/products/', '/guides/', '/articles/', '/deals/', '/about/', '/contact/', '/affiliate-disclosure/', '/editorial-policy/'];
  const [articles, guides] = await Promise.all([getCollection('articles'), getCollection('guides')]);
  const dynamicPaths = [...categories.map((category) => `/categories/${category.slug}/`), ...published(articles).map((item) => `/articles/${item.id}/`), ...published(guides).map((item) => `/guides/${item.id}/`)];
  const urls = site.url ? [...staticPaths, ...dynamicPaths].map((path) => `<url><loc>${new URL(path, site.url).toString()}</loc></url>`).join('') : '';
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
