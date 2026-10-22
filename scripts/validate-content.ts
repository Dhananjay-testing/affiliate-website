import { categories } from '../src/data/categories';
import { products } from '../src/data/products';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { excerpt, readingMinutes } from '../src/lib/content';

const failures: string[] = [];
assert.equal(readingMinutes('one two three'), 1, 'short content should take at least one minute');
assert.equal(readingMinutes(Array.from({ length: 221 }, () => 'word').join(' ')), 2, 'reading time should round up by words');
assert.equal(excerpt('# Hello **world**'), 'Hello world', 'excerpts should remove simple Markdown syntax');
assert.equal(excerpt('A sentence that needs trimming.', 11), 'A sentence…', 'excerpts should truncate cleanly');
const categoryNames = new Set(categories.flatMap(({ name, shortName }) => shortName ? [name, shortName] : [name]));
const slugs = new Set<string>();
for (const category of categories) {
  if (slugs.has(category.slug)) failures.push(`Duplicate category slug: ${category.slug}`);
  slugs.add(category.slug);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category.slug)) failures.push(`Invalid category slug: ${category.slug}`);
}
for (const product of products) {
  if (!product.slug || !product.name || !categoryNames.has(product.category)) failures.push(`Product ${product.slug || '(missing slug)'} has missing required details or an unknown category.`);
  if (product.status === 'published' && (!product.affiliateUrl.startsWith('https://') || !product.retailer || !product.lastReviewed)) failures.push(`Published product ${product.slug} needs an HTTPS affiliate URL, retailer and last-reviewed date.`);
}

async function validateMarkdown(folder: string) {
  const files = (await readdir(folder, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.md'));
  for (const file of files) {
    const content = await readFile(join(folder, file.name), 'utf8');
    const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontmatter) { failures.push(`${file.name}: missing YAML frontmatter.`); continue; }
    const yaml = frontmatter[1]!;
    for (const key of ['title:', 'description:', 'publishDate:', 'category:', 'author:', 'draft:']) if (!yaml.includes(key)) failures.push(`${file.name}: missing ${key.slice(0, -1)}.`);
    const category = yaml.match(/^category:\s*["']?(.+?)["']?\s*$/m)?.[1];
    if (category && !categoryNames.has(category)) failures.push(`${file.name}: unknown category "${category}".`);
    if (/^draft:\s*false\s*$/m.test(yaml) && !/^sources:\s*\n(?:\s+-\s+label:|\s*\[)/m.test(yaml) && /https?:\/\//.test(content)) {
      failures.push(`${file.name}: published entry has URLs but no source declaration; review sources manually.`);
    }
  }
}
await validateMarkdown('src/content/articles');
await validateMarkdown('src/content/guides');
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Content configuration valid: ${categories.length} categories, ${products.length} product records, and editorial frontmatter checked.`);
