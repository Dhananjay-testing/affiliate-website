/** Only application-issued same-origin image paths are valid product-card sources. */
export function productImagePath(value: unknown): string | null {
  return typeof value === 'string' && /^\/api\/product-images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

const SAMSUNG_MODEL_NAME = 'Samsung Galaxy M47 5G';
const SAMSUNG_MODEL_IMAGE = 'https://m.media-amazon.com/images/I/71ZhfgiBUbL._SL1500_.jpg';

/** A single owner-approved display override; arbitrary external URLs remain rejected. */
export function productImageUrl(value: unknown, productName: unknown): string | null {
  const uploadedImage = productImagePath(value);
  if (uploadedImage) return uploadedImage;
  return productName === SAMSUNG_MODEL_NAME ? SAMSUNG_MODEL_IMAGE : null;
}
