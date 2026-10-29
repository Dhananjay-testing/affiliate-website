/** Only application-issued same-origin image paths are valid product-card sources. */
export function productImagePath(value: unknown): string | null {
  return typeof value === 'string' && /^\/api\/product-images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
