import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

const dist = resolve('dist');
const htmlFiles: string[] = [];
async function walk(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.name.endsWith('.html')) htmlFiles.push(full);
  }
}
await walk(dist);
const failures: string[] = [];
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const value = match[1];
    if (!value || value.startsWith('#') || value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('tel:')) continue;
    let url: URL;
    try { url = new URL(value, 'https://pickora.invalid'); } catch { failures.push(`${file}: invalid local URL ${value}`); continue; }
    if (url.origin !== 'https://pickora.invalid') continue;
    if (url.pathname.startsWith('/cdn-cgi/')) continue; // Cloudflare may supply system routes at deploy time.
    const decoded = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const candidates = decoded
      ? [resolve(dist, decoded), resolve(dist, decoded, 'index.html')]
      : [join(dist, 'index.html')];
    for (const candidate of candidates) {
      const rel = relative(dist, candidate);
      if (rel.startsWith('..') || isAbsolute(rel)) failures.push(`${file}: unsafe local URL ${value}`);
    }
    let exists = false;
    for (const candidate of candidates) {
      try { if ((await stat(candidate)).isFile()) { exists = true; break; } } catch { /* try the next static-route form */ }
    }
    if (!exists) failures.push(`${file}: missing local target ${value}`);
  }
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Static route validation passed for ${htmlFiles.length} generated HTML pages.`);
