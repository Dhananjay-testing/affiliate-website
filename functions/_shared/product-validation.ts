import { categories } from '../../src/data/categories';

export interface ProductInput {
  name: string;
  category: string;
  description: string;
  keyFeatures: string[];
  intendedUse: string;
  benefits: string[];
  limitations: string[];
  productUrl: string;
  affiliateUrl: string;
  status: 'draft' | 'published';
}

export interface ValidationIssue { field: string; message: string; }

const amazonHosts = new Set(['amazon.in', 'www.amazon.in']);
function amazonUrl(value: string): boolean {
  if (value !== value.trim() || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && amazonHosts.has(url.hostname.toLowerCase()) && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned.length > 0 && cleaned.length <= maxLength ? cleaned : null;
}

function list(value: unknown, maxItems = 12): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) return null;
  const output = value.map((item) => text(item, 300));
  return output.every((item): item is string => item !== null) ? output : null;
}

export function normalizeProductInput(value: unknown): { product?: ProductInput; issues: ValidationIssue[] } {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const issues: ValidationIssue[] = [];
  const name = text(raw.name, 160);
  const category = text(raw.category, 100);
  const description = text(raw.description, 500);
  const keyFeatures = list(raw.keyFeatures);
  const intendedUse = text(raw.intendedUse, 300);
  const benefits = list(raw.benefits);
  const limitations = list(raw.limitations);
  const productUrl = typeof raw.productUrl === 'string' ? raw.productUrl : '';
  const affiliateUrl = typeof raw.affiliateUrl === 'string' ? raw.affiliateUrl : '';
  const status = raw.status === 'draft' ? 'draft' : raw.status === 'published' ? 'published' : null;

  if (!name) issues.push({ field: 'name', message: 'Enter a product name (up to 160 characters).' });
  if (!category || !categories.some((item) => item.name === category || item.shortName === category)) issues.push({ field: 'category', message: 'Choose one of the available categories.' });
  if (!description) issues.push({ field: 'description', message: 'Enter a short description (up to 500 characters).' });
  if (!keyFeatures) issues.push({ field: 'keyFeatures', message: 'Add one or more key features, one per line (up to 12).' });
  if (!intendedUse) issues.push({ field: 'intendedUse', message: 'Describe the intended use.' });
  if (!benefits) issues.push({ field: 'benefits', message: 'Add one or more supported benefits, one per line.' });
  if (!limitations) issues.push({ field: 'limitations', message: 'Add one or more limitations, one per line.' });
  if (!amazonUrl(productUrl)) issues.push({ field: 'productUrl', message: 'Use a complete HTTPS Amazon India product URL (amazon.in or www.amazon.in). No credentials or other sites are accepted.' });
  if (!isAmazonSpecialLink(affiliateUrl)) issues.push({ field: 'affiliateUrl', message: 'Use the complete HTTPS Amazon India Special Link with its tracking tag from Associates Central.' });
  if (!status) issues.push({ field: 'status', message: 'Choose Publish now or Save as draft.' });
  if (raw.imageUrl !== undefined && raw.imageUrl !== null && raw.imageUrl !== '') issues.push({ field: 'imageUrl', message: 'Image paths are assigned by Pickora. Use the dashboard image controls.' });

  if (issues.length || !name || !category || !description || !keyFeatures || !intendedUse || !benefits || !limitations || !status) return { issues };
  return {
    issues,
    product: { name, category, description, keyFeatures, intendedUse, benefits, limitations, productUrl, affiliateUrl, status },
  };
}

export function slugify(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-+$/g, '');
}

export function isAllowedAmazonUrl(value: string): boolean { return amazonUrl(value); }

export function isAmazonSpecialLink(value: string, expectedTag?: string): boolean {
  if (!amazonUrl(value)) return false;
  try {
    const tags = new URL(value).searchParams.getAll('tag');
    if (tags.length !== 1 || !/^[A-Za-z0-9_-]{1,64}$/.test(tags[0]!)) return false;
    return expectedTag === undefined ? true : expectedTag.length > 0 && tags[0] === expectedTag;
  } catch {
    return false;
  }
}
