import { PhotonImage } from '@cf-wasm/photon';
import { productImagePath } from '../../src/lib/product-image-url';

export const MAX_PRODUCT_IMAGE_BYTES = 1024 * 1024;
export const MAX_PRODUCT_IMAGE_DIMENSION = 2048;
export const MAX_NORMALIZED_IMAGE_BYTES = 1024 * 1024;
export type ProductImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export class ProductImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductImageError';
  }
}

function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function dimensions(bytes: Uint8Array, type: ProductImageType): { width: number; height: number } | null {
  if (type === 'image/png') {
    if (bytes.length < 24 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++]!;
      if (marker === 0xd9 || marker === 0xda) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = u16be(bytes, offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) return null;
        return { height: u16be(bytes, offset + 3), width: u16be(bytes, offset + 5) };
      }
      offset += length;
    }
    return null;
  }
  if (bytes.length < 25 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP') return null;
  const riffSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  if (riffSize + 8 !== bytes.length) return null;
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8X') {
    if (bytes.length < 30) return null;
    if (bytes[20]! & 0x02) return null; // Animated WebP is outside this upload feature.
    return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
  }
  if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    if (bytes.length < 30) return null;
    return { width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff, height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const b1 = bytes[21]!, b2 = bytes[22]!, b3 = bytes[23]!, b4 = bytes[24]!;
    return { width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)) };
  }
  return null;
}

function detectImageType(bytes: Uint8Array): ProductImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && String.fromCharCode(...bytes.subarray(1, 4)) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
      if (offset + 12 + length > bytes.length) return null;
      if (String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === 'acTL') return null; // Reject animated PNG.
      if (String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === 'IEND') break;
      offset += 12 + length;
    }
    return 'image/png';
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

/** Fully decodes with Photon and re-encodes to metadata-free WebP. */
export function normalizeProductImage(bytes: Uint8Array, declaredType = ''): { bytes: Uint8Array; width: number; height: number } {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PRODUCT_IMAGE_BYTES) throw new ProductImageError('Choose an image no larger than 1 MiB.');
  const type = detectImageType(bytes);
  if (!type) throw new ProductImageError('Use a valid, non-animated JPG, PNG, or WebP image.');
  if (declaredType && declaredType.toLowerCase() !== type) throw new ProductImageError('The selected file type does not match its image content.');
  const headerDimensions = dimensions(bytes, type);
  if (!headerDimensions || !headerDimensions.width || !headerDimensions.height) throw new ProductImageError('The image file is malformed or unsupported.');
  if (headerDimensions.width > MAX_PRODUCT_IMAGE_DIMENSION || headerDimensions.height > MAX_PRODUCT_IMAGE_DIMENSION) throw new ProductImageError('Image width and height must each be 2,048 pixels or less.');
  let image: PhotonImage | undefined;
  try {
    image = PhotonImage.new_from_byteslice(bytes);
    const width = image.get_width();
    const height = image.get_height();
    if (!width || !height || width !== headerDimensions.width || height !== headerDimensions.height) throw new ProductImageError('The image dimensions could not be verified.');
    if (width > MAX_PRODUCT_IMAGE_DIMENSION || height > MAX_PRODUCT_IMAGE_DIMENSION) throw new ProductImageError('Image width and height must each be 2,048 pixels or less.');
    const normalized = image.get_bytes_webp();
    if (!normalized.length || normalized.byteLength > MAX_NORMALIZED_IMAGE_BYTES) throw new ProductImageError('The processed image is too large to store.');
    return { bytes: normalized, width, height };
  } catch (error) {
    if (error instanceof ProductImageError) throw error;
    throw new ProductImageError('The image could not be decoded. Choose a valid JPG, PNG, or WebP file.');
  } finally {
    image?.free();
  }
}

export { productImagePath };
