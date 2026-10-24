import { categories } from '../../src/data/categories';
import { getIdentity, requireSameOrigin } from './auth';
import { isAmazonSpecialLink, normalizeProductInput, slugify } from './product-validation';
import type { D1Database, PagesContext } from './types';
import { json } from './types';

interface ProductRow {
  id: string; slug: string; name: string; category: string; description: string;
  key_features: string; intended_use: string; benefits: string; limitations: string;
  product_url: string; affiliate_url: string; status: 'draft' | 'published';
  created_at: string; updated_at: string; published_at: string | null;
}

function safeProduct(row: ProductRow, includeAdmin: boolean) {
  const item = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    description: row.description,
    keyFeatures: JSON.parse(row.key_features) as string[],
    intendedUse: row.intended_use,
    benefits: JSON.parse(row.benefits) as string[],
    limitations: JSON.parse(row.limitations) as string[],
    affiliateUrl: row.affiliate_url,
    retailer: 'Amazon India',
  };
  return includeAdmin ? { ...item, productUrl: row.product_url, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, publishedAt: row.published_at } : item;
}

function slugFrom(context: PagesContext): string[] {
  return new URL(context.request.url).pathname.replace(/^\/api\/admin\/?/, '').split('/').filter(Boolean).map((part) => decodeURIComponent(part));
}

function badMethod(allow: string): Response {
  return json({ error: 'Method not allowed.' }, 405, { Allow: allow });
}

async function readJson(request: Request): Promise<{ data?: unknown; response?: Response }> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
  if (declaredLength > 30_000) return { response: json({ error: 'The submitted details are too large.' }, 413) };
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 30_000) return { response: json({ error: 'The submitted details are too large.' }, 413) };
    return { data: JSON.parse(body) as unknown };
  } catch {
    return { response: json({ error: 'Send a valid JSON request.' }, 400) };
  }
}

function requireDb(context: PagesContext): D1Database | Response {
  return context.env.DB ?? json({ error: 'Product storage is not connected yet. Ask the site owner to finish Cloudflare setup.' }, 503);
}

async function listProducts(db: D1Database, status?: 'published'): Promise<ProductRow[]> {
  const query = status
    ? db.prepare('SELECT * FROM products WHERE status = ? ORDER BY updated_at DESC').bind(status)
    : db.prepare('SELECT * FROM products ORDER BY updated_at DESC');
  const result = await query.all<ProductRow>();
  if (!result.success) throw new Error('database query failed');
  return result.results ?? [];
}

async function readProduct(db: D1Database, slug: string): Promise<ProductRow | null> {
  return db.prepare('SELECT * FROM products WHERE slug = ?').bind(slug).first<ProductRow>();
}

export async function handleAdminApi(context: PagesContext): Promise<Response> {
  const identity = await getIdentity(context);
  if (!identity) return json({ error: 'Authentication required.' }, 401);
  const { request } = context;
  const path = slugFrom(context);

  if (request.method !== 'GET') {
    const csrf = requireSameOrigin(context);
    if (csrf) return csrf;
  }

  if (path.length === 1 && path[0] === 'session') {
    return request.method === 'GET' ? json({ login: identity.login }) : badMethod('GET');
  }

  if (path.length === 1 && path[0] === 'categories') {
    return request.method === 'GET'
      ? json(categories.map(({ slug, name, shortName }) => ({ slug, name, shortName })))
      : badMethod('GET');
  }

  const database = requireDb(context);
  if (database instanceof Response) return database;
  const db = database;

  try {
    if (path.length === 1 && path[0] === 'products') {
      if (request.method === 'GET') {
        const products = await listProducts(db);
        return json(products.map((product) => safeProduct(product, true)));
      }
      if (request.method === 'POST') return createProduct(context, db);
      return badMethod('GET, POST');
    }

    if (path.length === 2 && path[0] === 'products') {
      const slug = path[1]!;
      const product = await readProduct(db, slug);
      if (!product) return json({ error: 'This product could not be found.' }, 404);
      if (request.method === 'GET') return json(safeProduct(product, true));
      if (request.method === 'PUT') return updateProduct(context, db, slug);
      if (request.method === 'DELETE') return deleteProduct(context, db, product);
      return badMethod('GET, PUT, DELETE');
    }
    return json({ error: 'Admin endpoint not found.' }, 404);
  } catch {
    return json({ error: 'The request could not be completed. Product storage may be unavailable; no success was recorded.' }, 500);
  }
}

async function createProduct(context: PagesContext, db: D1Database): Promise<Response> {
  const parsed = await readJson(context.request);
  if (parsed.response) return parsed.response;
  const { product, issues } = normalizeProductInput(parsed.data);
  if (!product) return json({ error: 'Please correct the highlighted product details.', issues }, 422);
  const publicationError = validatePublication(product.status, product.affiliateUrl, context.env.AMAZON_ASSOCIATE_TAG, context.request);
  if (publicationError) return publicationError;

  const idempotencyKey = context.request.headers.get('Idempotency-Key') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) return json({ error: 'Refresh the form and try submitting once more.' }, 400);
  const previous = await db.prepare('SELECT product_id FROM product_submissions WHERE idempotency_key = ?').bind(idempotencyKey).first<{ product_id: string }>();
  if (previous) {
    const saved = await db.prepare('SELECT * FROM products WHERE id = ?').bind(previous.product_id).first<ProductRow>();
    if (saved) return json({ product: safeProduct(saved, true), duplicate: true }, 200);
  }

  const slug = slugify(product.name);
  if (!slug) return json({ error: 'This name cannot be used to make a product URL. Add a letter or number.' }, 422);
  if (await readProduct(db, slug)) return json({ error: 'A product with this name already exists. Add a distinguishing word to the product name.' }, 409);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const publishedAt = product.status === 'published' ? now : null;
  try {
    const batchResults = await db.batch([
      db.prepare('INSERT INTO products (id, slug, name, category, description, key_features, intended_use, benefits, limitations, product_url, affiliate_url, image_url, status, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, slug, product.name, product.category, product.description, JSON.stringify(product.keyFeatures), product.intendedUse, JSON.stringify(product.benefits), JSON.stringify(product.limitations), product.productUrl, product.affiliateUrl, null, product.status, now, now, publishedAt),
      db.prepare('INSERT INTO product_submissions (idempotency_key, product_id, created_at) VALUES (?, ?, ?)').bind(idempotencyKey, id, now),
    ]);
    if (batchResults.some((result) => !result.success)) throw new Error('database batch was not successful');
  } catch {
    const retry = await db.prepare('SELECT product_id FROM product_submissions WHERE idempotency_key = ?').bind(idempotencyKey).first<{ product_id: string }>();
    if (retry) {
      const saved = await db.prepare('SELECT * FROM products WHERE id = ?').bind(retry.product_id).first<ProductRow>();
      if (saved) return json({ product: safeProduct(saved, true), duplicate: true }, 200);
    }
    if (await readProduct(db, slug)) return json({ error: 'A product with this name already exists. Add a distinguishing word to the product name.' }, 409);
    return json({ error: 'The database could not save this product. Nothing was published; please try again.' }, 500);
  }
  const saved = await readProduct(db, slug);
  if (!saved) return json({ error: 'The database did not confirm the saved product. Refresh the list before trying again.' }, 500);
  return json({ product: safeProduct(saved, true) }, 201);
}

async function updateProduct(context: PagesContext, db: D1Database, oldSlug: string): Promise<Response> {
  const parsed = await readJson(context.request);
  if (parsed.response) return parsed.response;
  const { product, issues } = normalizeProductInput(parsed.data);
  if (!product) return json({ error: 'Please correct the highlighted product details.', issues }, 422);
  const publicationError = validatePublication(product.status, product.affiliateUrl, context.env.AMAZON_ASSOCIATE_TAG, context.request);
  if (publicationError) return publicationError;
  const current = await readProduct(db, oldSlug);
  if (!current) return json({ error: 'This product could not be found.' }, 404);
  const slug = slugify(product.name);
  if (!slug) return json({ error: 'This name cannot be used to make a product URL.' }, 422);
  const collision = await readProduct(db, slug);
  if (collision && collision.id !== current.id) return json({ error: 'Another product already uses this name. Add a distinguishing word.' }, 409);
  const now = new Date().toISOString();
  const publishedAt = product.status === 'published' ? current.published_at ?? now : null;
  const result = await db.prepare('UPDATE products SET slug = ?, name = ?, category = ?, description = ?, key_features = ?, intended_use = ?, benefits = ?, limitations = ?, product_url = ?, affiliate_url = ?, image_url = ?, status = ?, updated_at = ?, published_at = ? WHERE id = ?')
    .bind(slug, product.name, product.category, product.description, JSON.stringify(product.keyFeatures), product.intendedUse, JSON.stringify(product.benefits), JSON.stringify(product.limitations), product.productUrl, product.affiliateUrl, null, product.status, now, publishedAt, current.id).run();
  if (!result.success || !result.meta?.changes) return json({ error: 'The database did not confirm the update. No success was recorded.' }, 500);
  const saved = await readProduct(db, slug);
  if (!saved) return json({ error: 'The update could not be confirmed. Refresh the product list.' }, 500);
  return json({ product: safeProduct(saved, true) });
}

function validatePublication(status: 'draft' | 'published', affiliateUrl: string, configuredTag: string | undefined, request: Request): Response | null {
  if (status !== 'published') return null;
  const tag = configuredTag?.trim();
  const rayId = request.headers.get('cf-ray');
  const requestId = rayId && /^[\da-f]{16}(?:-[a-z]{3})?$/i.test(rayId) ? rayId : undefined;
  console.info({ event: 'pickora_publish_tag_check', present: Boolean(tag), ...(requestId ? { requestId } : {}) });
  if (!tag) return json({ error: 'Publishing is not enabled yet. The site owner must configure the confirmed Amazon India tracking tag in Cloudflare first.' }, 503);
  if (!isAmazonSpecialLink(affiliateUrl, tag)) return json({ error: 'The Special Link tracking tag does not match the one configured for this site. Check Associates Central; the link was not published.' }, 422);
  return null;
}

async function deleteProduct(context: PagesContext, db: D1Database, product: ProductRow): Promise<Response> {
  const parsed = await readJson(context.request);
  if (parsed.response) return parsed.response;
  const body = parsed.data && typeof parsed.data === 'object' ? parsed.data as Record<string, unknown> : {};
  if (body.confirmProductName !== product.name) return json({ error: 'The product name did not match. Nothing was deleted.' }, 422);
  const result = await db.prepare('DELETE FROM products WHERE id = ?').bind(product.id).run();
  if (!result.success || !result.meta?.changes) return json({ error: 'The database did not confirm deletion. No success was recorded.' }, 500);
  return json({ deleted: true });
}
