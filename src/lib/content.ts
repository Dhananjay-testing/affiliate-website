import type { CollectionEntry } from 'astro:content';

export type EditorialEntry = CollectionEntry<'articles'> | CollectionEntry<'guides'>;
export const published = <T extends EditorialEntry>(items: T[]) => items.filter((item) => !item.data.draft);
export const readingMinutes = (body: string) => Math.max(1, Math.ceil(body.trim().split(/\s+/).length / 220));
export const excerpt = (body: string, limit = 170) => {
  const plain = body.replace(/[#>*_`\[\]()]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > limit ? `${plain.slice(0, limit).trimEnd()}…` : plain;
};
