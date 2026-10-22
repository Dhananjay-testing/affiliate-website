export type Product = {
  slug: string; name: string; category: string; description: string; intendedUse: string;
  selectionCriteria: string[]; benefits: string[]; limitations: string[]; image?: string;
  imageAlt?: string; affiliateUrl: string; retailer: string; status: 'draft' | 'published';
  lastReviewed?: string; editorialNotes?: string;
};

// Keep products in draft until product details and direct affiliate links are verified.
export const products: Product[] = [];
export const publishedProducts = products.filter((product) => product.status === 'published' && product.affiliateUrl.startsWith('https://'));
