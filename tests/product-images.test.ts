import assert from 'node:assert/strict';
import { PhotonImage } from '@cf-wasm/photon';
import { handleAdminApi } from '../functions/_shared/admin-api';
import { normalizeProductImage, ProductImageError, MAX_PRODUCT_IMAGE_BYTES } from '../functions/_shared/product-images';
import { onRequest as serveImage } from '../functions/api/product-images/[key]';
import type { D1Database, D1Result, D1Statement, KVNamespace, PagesContext } from '../functions/_shared/types';

const baseProduct = {
  name: 'Upload test product', category: 'Electronics', description: 'Owner supplied description.',
  keyFeatures: ['Verified feature'], intendedUse: 'Owner supplied use.', benefits: ['Supported benefit'],
  limitations: ['Known limitation'], productUrl: 'https://www.amazon.in/example',
  affiliateUrl: 'https://www.amazon.in/?tag=local-test', status: 'draft',
};

function fixtureImages() {
  const source = new PhotonImage(new Uint8Array([200, 40, 30, 255]), 1, 1);
  try {
    return { png: source.get_bytes(), jpeg: source.get_bytes_jpeg(80), webp: source.get_bytes_webp() };
  } finally { source.free(); }
}
const fixtures = fixtureImages();

function throwsProductImage(run: () => unknown, pattern: RegExp) {
  assert.throws(run, (error: unknown) => error instanceof ProductImageError && pattern.test(error.message));
}

interface TestProduct extends Record<string, unknown> {
  id: string; slug: string; name: string; category: string; description: string; key_features: string;
  intended_use: string; benefits: string; limitations: string; product_url: string; affiliate_url: string;
  image_url: string | null; status: 'draft' | 'published'; created_at: string; updated_at: string; published_at: string | null;
}

class MemoryKV implements KVNamespace {
  values = new Map<string, Uint8Array>();
  async get(key: string, _options: { type: 'arrayBuffer' }) { const value = this.values.get(key); return value ? value.slice().buffer : null; }
  async put(key: string, value: ArrayBuffer | ArrayBufferView) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    this.values.set(key, bytes.slice());
  }
  async delete(key: string) { this.values.delete(key); }
}

class MemoryStatement implements D1Statement {
  values: unknown[] = [];
  constructor(private readonly db: MemoryDb, readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() { return this.db.first<T>(this.sql, this.values); }
  async all<T>() { return this.db.all<T>(this.sql, this.values); }
  async run<T>() { return this.db.run<T>(this.sql, this.values); }
}

class MemoryDb implements D1Database {
  products = new Map<string, TestProduct>();
  submissions = new Map<string, string>();
  failBatch = false;
  prepare(query: string) { return new MemoryStatement(this, query); }
  async batch<T>(statements: D1Statement[]) { if (this.failBatch) throw new Error('simulated write failure'); const results: D1Result<T>[] = []; for (const statement of statements) results.push(await statement.run<T>()); return results; }
  async first<T>(sql: string, values: unknown[]) {
    if (sql.includes('FROM product_submissions')) {
      const productId = this.submissions.get(String(values[0]));
      return (productId ? { product_id: productId } : null) as T | null;
    }
    if (sql.includes('FROM products WHERE id = ?')) return ([...this.products.values()].find((row) => row.id === values[0]) ?? null) as T | null;
    if (sql.includes('FROM products WHERE slug = ?')) return (this.products.get(String(values[0])) ?? null) as T | null;
    return null;
  }
  async all<T>(sql: string, _values: unknown[] = []) { return { success: true, results: (sql.includes('FROM products') ? [...this.products.values()] : []) as T[] }; }
  async run<T>(sql: string, values: unknown[]) {
    const result = (changes: number): D1Result<T> => ({ success: true, meta: { changes } });
    if (sql.startsWith('INSERT INTO products')) {
      const [id, slug, name, category, description, keyFeatures, intendedUse, benefits, limitations, productUrl, affiliateUrl, imageUrl, status, createdAt, updatedAt, publishedAt] = values;
      this.products.set(String(slug), { id: String(id), slug: String(slug), name: String(name), category: String(category), description: String(description), key_features: String(keyFeatures), intended_use: String(intendedUse), benefits: String(benefits), limitations: String(limitations), product_url: String(productUrl), affiliate_url: String(affiliateUrl), image_url: imageUrl === null ? null : String(imageUrl), status: status as 'draft' | 'published', created_at: String(createdAt), updated_at: String(updatedAt), published_at: publishedAt === null ? null : String(publishedAt) });
      return result(1);
    }
    if (sql.startsWith('INSERT INTO product_submissions')) { this.submissions.set(String(values[0]), String(values[1])); return result(1); }
    if (sql.startsWith('UPDATE products SET')) {
      const [slug, name, category, description, keyFeatures, intendedUse, benefits, limitations, productUrl, affiliateUrl, imageUrl, status, updatedAt, publishedAt, id] = values;
      const row = [...this.products.values()].find((item) => item.id === id);
      if (!row) return result(0);
      this.products.delete(row.slug);
      Object.assign(row, { slug, name, category, description, key_features: keyFeatures, intended_use: intendedUse, benefits, limitations, product_url: productUrl, affiliate_url: affiliateUrl, image_url: imageUrl, status, updated_at: updatedAt, published_at: publishedAt });
      this.products.set(String(slug), row);
      return result(1);
    }
    if (sql.startsWith('DELETE FROM products')) { const id = String(values[0]); const row = [...this.products.values()].find((item) => item.id === id); if (row) this.products.delete(row.slug); return result(row ? 1 : 0); }
    return result(0);
  }
}

function context(_path: string, env: PagesContext['env'], request: Request): PagesContext {
  return { request, env, params: {}, next: async () => new Response(), waitUntil: () => {} };
}

function apiRequest(method: string, body: BodyInit, contentType?: string, extras: Record<string, string> = {}) {
  const headers = new Headers({ Origin: 'http://127.0.0.1', 'X-Pickora-CSRF': '1', ...extras });
  if (contentType) headers.set('Content-Type', contentType);
  return new Request('http://127.0.0.1/api/admin/products', { method, headers, body });
}

function productForm(imageAction: 'upload' | 'remove' | 'keep', file?: File) {
  const form = new FormData();
  form.set('product', JSON.stringify(baseProduct));
  form.set('imageAction', imageAction);
  if (file) form.set('image', file);
  return form;
}

const tests: Array<[string, () => void | Promise<void>]> = [
  ['fully decodes and normalizes valid JPG, PNG and WebP to WebP', () => {
    for (const [bytes, type] of [[fixtures.jpeg, 'image/jpeg'], [fixtures.png, 'image/png'], [fixtures.webp, 'image/webp']] as const) {
      const normalized = normalizeProductImage(bytes, type);
      assert.equal(normalized.width, 1); assert.equal(normalized.height, 1);
      assert.deepEqual([...normalized.bytes.subarray(0, 4)], [0x52, 0x49, 0x46, 0x46]);
    }
  }],
  ['rejects files larger than 1 MiB before decoding', () => throwsProductImage(() => normalizeProductImage(new Uint8Array(MAX_PRODUCT_IMAGE_BYTES + 1)), /1 MiB/i)],
  ['rejects spoofed MIME, unsupported formats, malformed signatures and truncated images', () => {
    throwsProductImage(() => normalizeProductImage(fixtures.png, 'image/jpeg'), /does not match/i);
    throwsProductImage(() => normalizeProductImage(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), 'image/gif'), /JPG, PNG, or WebP/i);
    throwsProductImage(() => normalizeProductImage(fixtures.png.subarray(0, 28), 'image/png'), /valid|malformed|decoded/i);
    const fake = new Uint8Array(fixtures.jpeg); fake.fill(0, 3);
    throwsProductImage(() => normalizeProductImage(fake, 'image/jpeg'), /malformed|decoded/i);
  }],
  ['rejects header dimensions over 2,048 pixels before decoding', () => {
    const large = new Uint8Array(fixtures.png);
    new DataView(large.buffer).setUint32(16, 2049);
    throwsProductImage(() => normalizeProductImage(large, 'image/png'), /2,048/);
  }],
  ['creates products without images and keeps image paths out of user-controlled JSON', async () => {
    const db = new MemoryDb(); const env = { DB: db, PICKORA_LOCAL_AUTH: 'true' };
    const payload = JSON.stringify({ ...baseProduct, imageUrl: 'https://unapproved.example/image.png' });
    const request = apiRequest('POST', payload, 'application/json', { 'Idempotency-Key': crypto.randomUUID() });
    const response = await handleAdminApi(context(request.url, env, request));
    assert.equal(response.status, 422);
    const validRequest = apiRequest('POST', JSON.stringify(baseProduct), 'application/json', { 'Idempotency-Key': crypto.randomUUID() });
    const created = await handleAdminApi(context(validRequest.url, env, validRequest));
    assert.equal(created.status, 201);
    assert.equal([...db.products.values()][0]?.image_url, null);
  }],
  ['creates and serves a validated upload from KV with safe headers', async () => {
    const db = new MemoryDb(); const kv = new MemoryKV(); const env = { DB: db, PRODUCT_IMAGES: kv, PICKORA_LOCAL_AUTH: 'true' };
    const file = new File([fixtures.png.buffer.slice(fixtures.png.byteOffset, fixtures.png.byteOffset + fixtures.png.byteLength) as ArrayBuffer], 'not-trusted.png', { type: 'image/png' });
    const form = productForm('upload', file);
    const request = apiRequest('POST', form, undefined, { 'Idempotency-Key': crypto.randomUUID() });
    const response = await handleAdminApi(context(request.url, env, request));
    assert.equal(response.status, 201);
    const product = [...db.products.values()][0]!;
    assert.match(product.image_url ?? '', /^\/api\/product-images\/[0-9a-f-]{36}$/i);
    assert.doesNotMatch(product.image_url ?? '', /RIFF|UklGR/);
    assert.equal(kv.values.size, 1);
    const key = product.image_url!.split('/').at(-1)!;
    const imageRequest = new Request(`https://pickora.example/api/product-images/${key}`);
    const imageResponse = await serveImage({ ...context(imageRequest.url, { PRODUCT_IMAGES: kv }, imageRequest), params: { key } });
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get('Content-Type'), 'image/webp');
    assert.equal(imageResponse.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(imageResponse.headers.get('Cache-Control') ?? '', /immutable/);
    assert.deepEqual(new Uint8Array(await imageResponse.arrayBuffer()).subarray(0, 4), new Uint8Array([0x52, 0x49, 0x46, 0x46]));
  }],
  ['rejects upload attempts without KV and rejects unauthorized or CSRF-less uploads', async () => {
    const noStorage = new MemoryDb(); const file = new File([fixtures.png.buffer.slice(fixtures.png.byteOffset, fixtures.png.byteOffset + fixtures.png.byteLength) as ArrayBuffer], 'x.png', { type: 'image/png' });
    const request = apiRequest('POST', productForm('upload', file), undefined, { 'Idempotency-Key': crypto.randomUUID() });
    const unavailable = await handleAdminApi(context(request.url, { DB: noStorage, PICKORA_LOCAL_AUTH: 'true' }, request));
    assert.equal(unavailable.status, 503);
    const unauthenticatedRequest = new Request(request.url, { method: 'POST', headers: { Origin: 'http://127.0.0.1', 'X-Pickora-CSRF': '1', 'Idempotency-Key': crypto.randomUUID() }, body: productForm('upload', file) });
    const unauthenticated = await handleAdminApi(context(unauthenticatedRequest.url, { DB: noStorage }, unauthenticatedRequest));
    assert.equal(unauthenticated.status, 401);
    const csrfRequest = new Request(request.url, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: productForm('upload', file) });
    const csrf = await handleAdminApi(context(csrfRequest.url, { DB: noStorage, PICKORA_LOCAL_AUTH: 'true' }, csrfRequest));
    assert.equal(csrf.status, 403);
  }],
  ['keeps the publishing gate ahead of an otherwise valid upload', async () => {
    const db = new MemoryDb(); const kv = new MemoryKV();
    const file = new File([fixtures.png.buffer.slice(fixtures.png.byteOffset, fixtures.png.byteOffset + fixtures.png.byteLength) as ArrayBuffer], 'x.png', { type: 'image/png' });
    const published = { ...baseProduct, status: 'published' };
    const form = productForm('upload', file); form.set('product', JSON.stringify(published));
    const request = apiRequest('POST', form, undefined, { 'Idempotency-Key': crypto.randomUUID() });
    const response = await handleAdminApi(context(request.url, { DB: db, PRODUCT_IMAGES: kv, PICKORA_LOCAL_AUTH: 'true' }, request));
    assert.equal(response.status, 503);
    assert.equal(kv.values.size, 0);
    assert.equal(db.products.size, 0);
  }],
  ['cleans up a newly uploaded object when the product database write fails', async () => {
    const db = new MemoryDb(); db.failBatch = true; const kv = new MemoryKV();
    const file = new File([fixtures.png.buffer.slice(fixtures.png.byteOffset, fixtures.png.byteOffset + fixtures.png.byteLength) as ArrayBuffer], 'x.png', { type: 'image/png' });
    const request = apiRequest('POST', productForm('upload', file), undefined, { 'Idempotency-Key': crypto.randomUUID() });
    const response = await handleAdminApi(context(request.url, { DB: db, PRODUCT_IMAGES: kv, PICKORA_LOCAL_AUTH: 'true' }, request));
    assert.equal(response.status, 500);
    assert.equal(db.products.size, 0);
    assert.equal(kv.values.size, 0);
  }],
  ['removes an image reference without deleting a possibly shared KV object', async () => {
    const db = new MemoryDb(); const kv = new MemoryKV(); const id = crypto.randomUUID(); const path = `/api/product-images/${id}`;
    const key = `product-images:${id}`; await kv.put(key, fixtures.webp);
    const createdAt = new Date().toISOString();
    db.products.set('upload-test-product', { id: crypto.randomUUID(), slug: 'upload-test-product', name: baseProduct.name, category: baseProduct.category, description: baseProduct.description, key_features: JSON.stringify(baseProduct.keyFeatures), intended_use: baseProduct.intendedUse, benefits: JSON.stringify(baseProduct.benefits), limitations: JSON.stringify(baseProduct.limitations), product_url: baseProduct.productUrl, affiliate_url: baseProduct.affiliateUrl, image_url: path, status: 'draft', created_at: createdAt, updated_at: createdAt, published_at: null });
    const form = new FormData(); form.set('product', JSON.stringify(baseProduct)); form.set('imageAction', 'remove');
    const request = new Request('http://127.0.0.1/api/admin/products/upload-test-product', { method: 'PUT', headers: { Origin: 'http://127.0.0.1', 'X-Pickora-CSRF': '1' }, body: form });
    const response = await handleAdminApi(context(request.url, { DB: db, PRODUCT_IMAGES: kv, PICKORA_LOCAL_AUTH: 'true' }, request));
    assert.equal(response.status, 200);
    assert.equal(db.products.get('upload-test-product')?.image_url, null);
    assert.equal(kv.values.has(key), true);
  }],
  ['replaces an image without deleting the prior object', async () => {
    const db = new MemoryDb(); const kv = new MemoryKV(); const id = crypto.randomUUID(); const oldPath = `/api/product-images/${id}`;
    const oldKey = `product-images:${id}`; await kv.put(oldKey, fixtures.webp);
    const createdAt = new Date().toISOString();
    db.products.set('upload-test-product', { id: crypto.randomUUID(), slug: 'upload-test-product', name: baseProduct.name, category: baseProduct.category, description: baseProduct.description, key_features: JSON.stringify(baseProduct.keyFeatures), intended_use: baseProduct.intendedUse, benefits: JSON.stringify(baseProduct.benefits), limitations: JSON.stringify(baseProduct.limitations), product_url: baseProduct.productUrl, affiliate_url: baseProduct.affiliateUrl, image_url: oldPath, status: 'draft', created_at: createdAt, updated_at: createdAt, published_at: null });
    const file = new File([fixtures.jpeg.buffer.slice(fixtures.jpeg.byteOffset, fixtures.jpeg.byteOffset + fixtures.jpeg.byteLength) as ArrayBuffer], 'replacement.jpg', { type: 'image/jpeg' });
    const request = new Request('http://127.0.0.1/api/admin/products/upload-test-product', { method: 'PUT', headers: { Origin: 'http://127.0.0.1', 'X-Pickora-CSRF': '1' }, body: productForm('upload', file) });
    const response = await handleAdminApi(context(request.url, { DB: db, PRODUCT_IMAGES: kv, PICKORA_LOCAL_AUTH: 'true' }, request));
    assert.equal(response.status, 200);
    const newPath = db.products.get('upload-test-product')?.image_url;
    assert.ok(newPath && newPath !== oldPath);
    assert.equal(kv.values.has(oldKey), true);
    assert.equal(kv.values.size, 2);
  }],
  ['returns safe 404 responses for missing or malformed image keys', async () => {
    const kv = new MemoryKV();
    for (const key of ['bad-key', 'not-a-uuid']) {
      const request = new Request(`https://pickora.example/api/product-images/${key}`);
      const response = await serveImage({ ...context(request.url, { PRODUCT_IMAGES: kv }, request), params: { key } });
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    }
  }],
];

for (const [name, run] of tests) { await run(); console.log(`PASS ${name}`); }
console.log(`Product image tests passed: ${tests.length}.`);
