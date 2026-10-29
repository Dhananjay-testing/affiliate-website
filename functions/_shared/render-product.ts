import { isAmazonSpecialLink } from './product-validation';
import { productImagePath } from '../../src/lib/product-image-url';

export interface PublicProductRow {
  slug: string; name: string; category: string; description: string;
  key_features: string; intended_use: string; benefits: string; limitations: string;
  affiliate_url: string; image_url: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function listItems(serialized: string): string[] {
  const value: unknown = JSON.parse(serialized);
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : [];
}

function listHtml(items: string[]): string {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

export function renderProductCard(row: PublicProductRow, expectedTag?: string): string | null {
  if (!expectedTag || !isAmazonSpecialLink(row.affiliate_url, expectedTag)) return null;
  const imageUrl = productImagePath(row.image_url);
  const image = imageUrl
    ? `<img src="${imageUrl}" alt="Product image for ${escapeHtml(row.name)}" data-product-image><span aria-hidden="true" hidden>✳</span>`
    : '<span aria-hidden="true">✳</span>';
  const features = listItems(row.key_features);
  const benefits = listItems(row.benefits);
  const limitations = listItems(row.limitations);
  return `<article class="product-card"><div class="product-placeholder">${image}</div><div class="product-card-body"><p class="eyebrow">${escapeHtml(row.category)}</p><h3>${escapeHtml(row.name)}</h3><p>${escapeHtml(row.description)}</p><p class="product-note"><strong>Intended use:</strong> ${escapeHtml(row.intended_use)}</p><details class="product-details"><summary>Selection notes</summary><div><strong>Key features</strong><ul>${listHtml(features)}</ul></div><div><strong>Potential benefits</strong><ul>${listHtml(benefits)}</ul></div><div><strong>Limitations</strong><ul>${listHtml(limitations)}</ul></div></details><span class="disclosure">Affiliate link: We may earn a commission from qualifying purchases.</span><a class="button button-secondary" href="${escapeHtml(row.affiliate_url)}" target="_blank" rel="sponsored nofollow noopener noreferrer">View at Amazon India<span aria-hidden="true">↗</span></a></div></article>`;
}

export function renderProductCards(rows: PublicProductRow[], expectedTag?: string): string {
  return rows.map((row) => renderProductCard(row, expectedTag)).filter((card): card is string => card !== null).join('');
}
