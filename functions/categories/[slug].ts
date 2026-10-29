import { categories } from '../../src/data/categories';
import { renderProductCards, type PublicProductRow } from '../_shared/render-product';
import type { PagesHandler } from '../_shared/types';

const columns = 'slug, name, category, description, key_features, intended_use, benefits, limitations, affiliate_url, image_url';

export const onRequest: PagesHandler = async (context) => {
  const asset = await context.next();
  if (!context.env.DB || !asset.ok || !asset.headers.get('Content-Type')?.includes('text/html')) return asset;
  const routeSlug = String(context.params.slug ?? '');
  const category = categories.find((item) => item.slug === routeSlug);
  if (!category) return asset;
  try {
    const result = await context.env.DB.prepare("SELECT " + columns + " FROM products WHERE status = 'published' AND category = ? ORDER BY published_at DESC")
      .bind(category.name).all<PublicProductRow>();
    if (!result.success) return asset;
    const html = await asset.text();
    const list = renderProductCards(result.results ?? [], context.env.AMAZON_ASSOCIATE_TAG?.trim());
    const body = html
      .replace('<section class="content-section" data-product-section hidden>', `<section class="content-section" data-product-section${list ? '' : ' hidden'}>`)
      .replace('<div data-product-feed data-category=', '<div data-product-feed data-ssr-loaded="true" data-category=')
      .replace('<div data-product-list class="product-grid" aria-live="polite"></div>', `<div data-product-list class="product-grid" aria-live="polite">${list}</div>`)
      .replace('<section class="empty-state category-empty" data-empty-feed hidden>', `<section class="empty-state category-empty" data-empty-feed${list ? ' hidden' : ''}>`)
      .replace('<section class="empty-state category-empty" data-empty-category>', `<section class="empty-state category-empty" data-empty-category${list ? ' hidden' : ''}>`);
    const headers = new Headers(asset.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(body, { status: asset.status, statusText: asset.statusText, headers });
  } catch {
    return asset;
  }
};
