import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const editorialEntry = z.object({
  title: z.string(), description: z.string(), publishDate: z.coerce.date(), updatedDate: z.coerce.date().optional(),
  category: z.string(), tags: z.array(z.string()).default([]), author: z.string(), coverImage: z.string().optional(),
  imageAlt: z.string().optional(), sources: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
  draft: z.boolean().default(true), related: z.array(z.string()).default([]), affiliateLinks: z.boolean().default(false),
});

const articles = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/articles' }), schema: editorialEntry });
const guides = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/guides' }), schema: editorialEntry });

export const collections = { articles, guides };
