import { defineConfig } from 'astro/config';
try { process.loadEnvFile(); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || undefined,
  output: 'static',
  trailingSlash: 'always',
});
