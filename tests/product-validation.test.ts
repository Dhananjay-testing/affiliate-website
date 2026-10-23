import assert from 'node:assert/strict';
import { isAllowedAmazonUrl, isAmazonSpecialLink, normalizeProductInput, slugify } from '../functions/_shared/product-validation';
import { handleAdminApi } from '../functions/_shared/admin-api';
import { renderProductCard } from '../functions/_shared/render-product';
import type { PagesContext } from '../functions/_shared/types';

const valid = {
  name: 'Example study device',
  category: 'Electronics',
  description: 'A product description supplied by the owner.',
  keyFeatures: ['Owner-verified feature'],
  intendedUse: 'A use entered by the owner.',
  benefits: ['A supported benefit entered by the owner.'],
  limitations: ['A limitation entered by the owner.'],
  productUrl: 'https://www.amazon.in/',
  affiliateUrl: 'https://www.amazon.in/?tag=local-test',
  status: 'published',
};

const tests: Array<[string, () => void | Promise<void>]> = [
['accepts a complete record and preserves the affiliate URL exactly', () => {
  const { product, issues } = normalizeProductInput(valid);
  assert.deepEqual(issues, []);
  assert.equal(product?.affiliateUrl, valid.affiliateUrl);
  assert.equal(product?.name, valid.name);
}],

['rejects non-HTTPS and non-Amazon URLs, credentials, and ports', () => {
  for (const affiliateUrl of [
    'javascript:alert(1)',
    'http://www.amazon.in/',
    'https://amazon.com/',
    'https://attacker.example/amazon.in',
    'https://user:password@amazon.in/',
    'https://amazon.in:444/',
  ]) {
    assert.equal(isAllowedAmazonUrl(affiliateUrl), false, affiliateUrl);
  }
}],
['requires a configured Amazon Associates tag before public links are accepted', () => {
  assert.equal(isAmazonSpecialLink('https://www.amazon.in/'), false);
  assert.equal(isAmazonSpecialLink('https://www.amazon.in/?tag=valid', ''), false);
  assert.equal(isAmazonSpecialLink('https://www.amazon.in/?tag=valid', 'different'), false);
  assert.equal(isAmazonSpecialLink(valid.affiliateUrl, 'local-test'), true);
}],

['accepts products without images and rejects supplied image paths or URLs', () => {
  assert.ok(normalizeProductInput(valid).product);
  assert.ok(normalizeProductInput({ ...valid, imageUrl: null }).product);
  for (const imageUrl of ['https://images.example/photo.jpg', '/images/products/123e4567-e89b-12d3-a456-426614174000.webp']) {
    const result = normalizeProductInput({ ...valid, imageUrl });
    assert.equal(result.product, undefined);
    assert.ok(result.issues.some((issue) => issue.field === 'imageUrl'));
  }
}],

['renders a product placeholder when no image is present', () => {
  const card = renderProductCard({
    slug: 'example-product', name: 'Example product', category: 'Electronics', description: 'Owner supplied description.',
    key_features: '["Feature"]', intended_use: 'Owner supplied use.', benefits: '["Benefit"]', limitations: '["Limitation"]',
    affiliate_url: valid.affiliateUrl,
  }, 'local-test');
  assert.match(card ?? '', /class="product-placeholder" aria-hidden="true"><span>✳<\/span>/);
  assert.doesNotMatch(card ?? '', /<img\b/);
}],

['requires owner-supplied features, benefits, limitations, and a supported category', () => {
  const { product, issues } = normalizeProductInput({ ...valid, keyFeatures: [], benefits: [], limitations: [], category: 'Made up' });
  assert.equal(product, undefined);
  assert.deepEqual(new Set(issues.map((issue) => issue.field)), new Set(['keyFeatures', 'benefits', 'limitations', 'category']));
}],

['creates a stable URL-safe slug', () => {
  assert.equal(slugify('  Study Lamp: Model 2!  '), 'study-lamp-model-2');
  assert.equal(slugify('✳'), '');
}],
['denies admin API requests without a valid session', async () => {
  const context = makeContext('https://pickora.example/api/admin/session');
  const response = await handleAdminApi(context);
  assert.equal(response.status, 401);
}],
['requires a same-origin CSRF header on data-changing requests', async () => {
  const context = makeContext('http://127.0.0.1/api/admin/products', { PICKORA_LOCAL_AUTH: 'true' }, 'POST');
  const response = await handleAdminApi(context);
  assert.equal(response.status, 403);
}],
['reports missing D1 configuration without claiming a write succeeded', async () => {
  const context = makeContext('http://127.0.0.1/api/admin/products', { PICKORA_LOCAL_AUTH: 'true' });
  const response = await handleAdminApi(context);
  const body = await response.json() as { error: string };
  assert.equal(response.status, 503);
  assert.match(body.error, /storage is not connected/i);
}],
['blocks publishing until the owner configures the confirmed tracking tag', async () => {
  const body = JSON.stringify({ ...valid, status: 'published' });
  const context = makeContext('http://127.0.0.1/api/admin/products', { PICKORA_LOCAL_AUTH: 'true', DB: { prepare() { throw new Error('Database must not be queried before the publishing gate.'); }, async batch() { throw new Error('Database must not be queried before the publishing gate.'); } } }, 'POST');
  context.request = new Request(context.request.url, { method: 'POST', headers: { Origin: 'http://127.0.0.1', 'X-Pickora-CSRF': '1', 'Idempotency-Key': crypto.randomUUID() }, body });
  const response = await handleAdminApi(context);
  assert.equal(response.status, 503);
  assert.match((await response.text()), /confirmed Amazon India tracking tag/i);
}],
['reports a D1 query failure as an error, not a successful empty listing', async () => {
  const failingStatement = { bind() { return this; }, async all() { throw new Error('simulated database outage'); }, async first() { throw new Error('simulated database outage'); }, async run() { throw new Error('simulated database outage'); } };
  const context = makeContext('http://127.0.0.1/api/admin/products', { PICKORA_LOCAL_AUTH: 'true', DB: { prepare() { return failingStatement; }, async batch() { throw new Error('simulated database outage'); } } });
  const response = await handleAdminApi(context);
  assert.equal(response.status, 500);
  assert.match((await response.text()), /no success was recorded/i);
}],
];

function makeContext(url: string, env: PagesContext['env'] = {}, method = 'GET'): PagesContext {
  return {
    request: new Request(url, { method }),
    env,
    params: {},
    next: async () => new Response('next'),
    waitUntil: () => {},
  };
}

for (const [name, run] of tests) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
console.log(`Product validation tests passed: ${tests.length}.`);
