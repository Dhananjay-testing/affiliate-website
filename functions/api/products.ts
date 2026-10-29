import type { PagesHandler } from '../_shared/types';
import { json } from '../_shared/types';
import { isAmazonSpecialLink } from '../_shared/product-validation';
import { productImagePath } from '../../src/lib/product-image-url';

export const onRequest: PagesHandler = async ({ request, env }) => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  if (!env.DB) return json({ error: 'Product recommendations are temporarily unavailable.' }, 503);
  try {
    const result = await env.DB.prepare("SELECT slug, name, category, description, key_features, intended_use, benefits, limitations, affiliate_url, image_url FROM products WHERE status = 'published' ORDER BY published_at DESC").all<Record<string, string | null>>();
    if (!result.success) return json({ error: 'Product recommendations are temporarily unavailable.' }, 503);
    const expectedTag = env.AMAZON_ASSOCIATE_TAG?.trim() ?? '';
    const products = (result.results ?? []).filter((row) => typeof row.affiliate_url === 'string' && isAmazonSpecialLink(row.affiliate_url, expectedTag)).map((row) => ({
      slug: row.slug,
      name: row.name,
      category: row.category,
      description: row.description,
      keyFeatures: JSON.parse(row.key_features ?? '[]') as string[],
      intendedUse: row.intended_use,
      benefits: JSON.parse(row.benefits ?? '[]') as string[],
      limitations: JSON.parse(row.limitations ?? '[]') as string[],
      affiliateUrl: row.affiliate_url,
      retailer: 'Amazon India',
      imageUrl: productImagePath(row.image_url),
    }));
    return json(products, 200, { 'Cache-Control': 'no-store' });
  } catch {
    return json({ error: 'Product recommendations are temporarily unavailable.' }, 503);
  }
};
