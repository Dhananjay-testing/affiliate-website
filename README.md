# Pickora — a product discovery publication

Pickora is the working name for a multi-category editorial shopping website for Indian readers. The public pages are built with Astro static site generation, TypeScript, Markdown content collections and CSS. Product records are stored in Cloudflare D1. Product images are not configured; product cards use Pickora’s built-in placeholder. The design is responsive, uses locally stored original SVG artwork, system fonts and minimal browser JavaScript.

> **Working brand:** Pickora has not been cleared as a final brand. Before launch, check domain availability, similar businesses and relevant trademarks. Replace the name, mark and tagline centrally in `src/config/site.ts` and `public/brand/`.

## Run the site

Install Node.js 24 (Astro requires a supported modern Node version), then in this folder run:

```powershell
npm ci
npm run dev
```

Open the local address printed by Astro. That lightweight server previews editorial pages; admin and database-backed product feeds run in Cloudflare Pages Functions. To run those locally, copy `.dev.vars.example` to `.dev.vars`, run `npm run db:migrate:local`, then run `npm run dev:pages`. Open `http://127.0.0.1:8788/admin/`. This opt-in local-only login bypass is restricted to loopback and is never used on the deployed site. Local database and image state persists under `.wrangler/`.

To validate content and TypeScript, run `npm run check`. `npm run test:admin` checks product input validation. To build the production files, run `npm run build`; the public static pages are written to `dist/`. `npm run preview` serves the static build only and does not emulate Pages Functions.

## Content and product maintenance

### Add or edit an article or buying guide

Create a Markdown file in `src/content/articles/` or `src/content/guides/`. Copy the frontmatter from an existing file. Change `draft: true` to `draft: false` only after editorial review. Drafts are excluded from published pages, search and sitemap. Use a category name from `src/data/categories.ts`, write original content, add credible source links when the facts need them, and update the publish date. The content schema checks required metadata. Articles and guides render through shared templates; no page-layout edits are needed for normal content changes.

The initial ten pieces in those folders are substantial unpublished drafts. Review and fact-check them before publication. They are intentionally not presented as live articles.

### Add a product recommendation

Use the private dashboard at `/admin/`. It is protected by a GitHub OAuth login and server-side verification of the owner's stable GitHub user ID. The dashboard saves to D1; a successful publish is visible through the public product API without a code edit or GitHub push. The public site receives only records whose status is `published`. Prices are not stored. See **Private product dashboard setup** below before using it.

Enter accurate product details yourself and verify the product URL, Special Link and claims. The dashboard validates HTTPS and Amazon India domains, but cannot verify that a Special Link belongs to your account or that product claims are true. The exact Special Link string is preserved. Use a link copied from Associates Central. Do not invent a tracking tag, price, rating, review or availability claim. Product images are currently unavailable; public cards use the built-in Pickora placeholder.

A product can be saved and published without an image. The dashboard does not upload files, accept image URLs, or require Cloudflare R2.

### Add or edit a category

Add a category record in `src/data/categories.ts`. Each record controls its slug, display name, short name, description, icon and whether it appears in the featured homepage set. Keep slugs unique and use lowercase letters and hyphens. Article/product category values should match a category name or short name. Empty categories remain browsable and show a clear empty state.

### Change the brand, contact details and social links

Edit `src/config/site.ts` for the site name, tagline, description, logo path, contact email, navigation labels, Amazon disclosure text, and social-link list. Replace the original SVG files in `public/brand/` if you change the mark or social card. `src/data/categories.ts` is the central category list. Review the privacy, affiliate and legal copy when business details change. Contact is intentionally not a fake form: set a monitored `contactEmail` to show a real email link.

## Production domain and SEO

No production domain was provided or verified. Set `PUBLIC_SITE_URL` to the final HTTPS origin (for example, `https://your-domain.in`) in a local `.env` file or the Cloudflare Pages environment-variable settings. Do not use the sample form literally. The project omits absolute canonical/social URLs and sitemap entries while the value is blank; configure and rebuild after selecting a real domain. `astro.config.mjs`, metadata and generated `/sitemap.xml` use that central value. `/robots.txt` adds an absolute sitemap location when configured. Search is `noindex`.

The privacy and terms routes are clearly marked owner-review drafts, send `noindex,follow`, and stay out of the sitemap until finalized. The project uses trailing-slash routes with static directory index files, including a root `404.html`. Cloudflare Pages serves generated static routes and a custom `/404.html`. Do not add SPA fallback rewrites that would mask missing pages.

## Affiliate and editorial compliance checklist

Before publication, check current retailer program rules and the site's implementation. This checklist is guidance, not a guarantee of acceptance:

- Declare the correct website properties and keep account details accurate.
- Publish useful, original content; review the initial drafts before removing their draft status.
- Confirm the active tracking ID in Associates Central; do not reuse a rejected-account ID.
- Create links with approved retailer tools and verify every destination and format.
- Use only images you own or have permission to use.
- Display clear affiliate notices near relevant links and retain the required Amazon statement: “As an Amazon Associate I earn from qualifying purchases.”
- Do not invent reviews, tests, author credentials, prices, availability, ratings, discounts or savings claims.
- Do not imply Amazon or another retailer owns, sponsors or endorses Pickora.
- Do not offer prohibited purchase incentives, cloak affiliate destinations or manipulate clicks.
- Recheck current Associates policies and link-format requirements before launch and periodically thereafter.

The project makes no claim that Amazon or any other program has approved it.

## Checks and automation

`npm run check` runs Astro's TypeScript/content checks and the local category/product/frontmatter validator. `npm run test:admin` tests product field and URL validation. `npm run build` runs those checks, generates the static site and verifies that local HTML links/assets resolve to generated files. `npm run check:routes` repeats the route check after a build. The GitHub Actions workflow at `.github/workflows/ci.yml` runs `npm ci`, `npm run check` and `npm run build` on pushes and pull requests to `main`.

The validators check required editorial metadata, category names, unique category slugs, publication requirements for product links and local generated route targets. They cannot prove that an external retailer URL, product claim, source, licence or affiliate relationship is valid; those require editorial verification. No automated external URL crawler or formal screen-reader audit is configured.

## Private product dashboard setup

This project remains a static Astro site hosted by Cloudflare Pages. Pages Functions handle `/admin/`, `/api/admin/*`, `/api/products`, and database-backed product listings. The admin uses a server-side GitHub OAuth web flow and checks the authenticated account's stable numeric GitHub user ID against `GITHUB_OWNER_ID`. No password is collected, and no repository scope is requested. The OAuth client secret is a Cloudflare Pages secret; the browser receives only an opaque `HttpOnly`, `Secure`, `SameSite=Lax` session cookie. D1 stores hashes of OAuth state and session tokens, never the raw values. The random state and session tokens require no additional signing secret. Sessions expire after eight hours and are revoked on logout. Same-origin checks and a custom CSRF header protect data-changing requests. OAuth requests are rate-limited in D1 per HMAC-hashed Cloudflare client IP. Duplicate product submissions use idempotency keys; product slugs are unique.

The dashboard uses the existing category list, with Electronics selected initially. Additional current site categories are selectable, and new categories can be added to `src/data/categories.ts` as the editorial site expands; they become selectable after a build.

### Cloudflare dashboard steps

1. **Create D1.** In Cloudflare, open **Workers & Pages → D1 SQL Database → Create database**. Name it `pickora-products`. Open its **Console** and run the SQL in `migrations/0001_products.sql` once. It creates product and duplicate-submission tables; it adds no sample products.
2. **Connect D1.** Open the existing Pages project, then **Settings → Bindings → Add → D1 database**. Set the binding name to `DB` and select `pickora-products`. Configure Production and Preview if you use Preview deployments. The project does not require an R2 binding.
3. **Register the GitHub OAuth app.** Sign in to GitHub as the account that will own the dashboard. Open **Settings → Developer settings → OAuth Apps → New OAuth App**. Set the application name to `Pickora Admin`, Homepage URL to `https://affiliate-website-a1v.pages.dev`, Authorization callback URL to exactly `https://affiliate-website-a1v.pages.dev/api/admin/auth/callback`, then register it. Do not add repository permissions or scopes; this app requests no OAuth scope and reads only the signed-in account's public profile. Copy the generated Client ID and create a Client secret. Do not put the secret in source, `.env`, chat, or browser code.
4. **Set the allowed account ID.** Open `https://api.github.com/users/YOUR-GITHUB-USERNAME` in a browser, replacing the final path segment with the intended owner's GitHub username. Copy the numeric `id` field from the public JSON. This is a public identity number, not a credential. Do not enter the username in place of the ID; the code checks the stable numeric value.
5. **Configure Cloudflare Pages.** Open **Workers & Pages → affiliate-website → Settings → Variables and Secrets → Production**. Add `GITHUB_CLIENT_ID`, `GITHUB_OWNER_ID`, and `GITHUB_OAUTH_CALLBACK_URL` as server-side text variables. Set the callback value to exactly `https://affiliate-website-a1v.pages.dev/api/admin/auth/callback`. Add `GITHUB_CLIENT_SECRET` as a **Secret**, not a plain variable. Keep these out of `PUBLIC_*` variables. Do not copy production credentials into Preview. The app validates that the request hostname matches the configured callback origin. Keep the existing `DB` binding pointing to `pickora-products`. `AMAZON_ASSOCIATE_TAG` remains a separate server-side value; only enter the confirmed active tag from Associates Central. Until it is configured, publishing remains blocked.
6. **Apply the additive database migration.** `migrations/0002_admin_auth.sql` adds only OAuth state, admin session, and rate-limit tables and indexes; it does not modify product tables. This migration has already been applied to the production `pickora-products` database and verified. Do not run it there again. For a separate new database, review the target carefully before applying the migration; for local testing, `npm run db:migrate:local` applies the existing products migration and then the auth migration to the local Wrangler database.
7. **Test sign-in and access.** After the code is deployed to the Pages project, open `https://affiliate-website-a1v.pages.dev/admin/`, choose the intended GitHub account, and confirm the dashboard shows its GitHub login. Try another account and confirm it is denied. Confirm logout returns you to sign-in and that reloading the admin requires authentication. Verify unauthenticated `/api/admin/products` returns 401 and product editing still works. Do not publish an unverified product as a test.

For local Functions development, Wrangler uses a local-only database identifier in `wrangler.jsonc`; it is not a Cloudflare production database ID. This config intentionally omits `pages_build_output_dir`, so Cloudflare treats it as local development configuration rather than Pages deployment configuration. Keep the production D1 binding in the Cloudflare dashboard. Copy `.dev.vars.example` to the ignored `.dev.vars` to opt into a local authentication bypass restricted to loopback hostnames. The bypass cannot authenticate requests on the production Pages hostname, even if accidentally configured there. Run `npm run db:migrate:local`, then `npm run dev:pages`; local dashboard use does not require GitHub OAuth credentials. For production, unset `PICKORA_LOCAL_AUTH`.

### How product publishing works

1. Open `/admin/` and sign in with the configured GitHub owner account.
2. Enter the exact product name and the facts you checked. Electronics is selected initially.
3. Paste the Amazon India product page and the complete Special Link copied from Associates Central. The server accepts only HTTPS Amazon India hosts and stores the Special Link string without rebuilding it.
4. Images are optional and currently unavailable. Product cards use the built-in placeholder.
5. Choose **Publish now** and click **Publish product**. The dashboard reports success only after D1 confirms the write. Published products appear on the product page and matching category page on the next request; the product API disables edge caching.
6. Use **Edit**, **Unpublish**, or **Delete** later. Unpublish and delete ask for confirmation. Repeated submission delivery is idempotent and duplicate product slugs are rejected.

There is no current-price field or price column. Do not publish a price unless a future change adds a permitted Amazon-authorized data source. Domain validation cannot prove that a Special Link belongs to your account, resolve the final destination of a shortened URL, validate product claims, or grant image rights. The owner remains responsible for those checks. The app does not scrape Amazon or copy customer reviews.

## Deployment: Cloudflare Pages

Astro's static build works as plain HTML and assets; it does not require an Astro Cloudflare adapter. Cloudflare Pages serves static directory routes and a custom `404.html` as required by this build ([routing details](https://developers.cloudflare.com/pages/configuration/serving-pages/)). The existing public pages remain static; Pages Functions run on the admin, product-listing, API and image routes. I reviewed Cloudflare's current [Developer Platform service-specific terms](https://www.cloudflare.com/service-specific-terms-developer-platform/) on 21 October 2026; they cover Pages hosting and restrict illegal/harmful content, but I found no affiliate-specific prohibition. This is a limited terms review, not account-level confirmation or legal advice. Amazon India's [Operating Agreement](https://affiliate-program.amazon.in/help/operating/agreement) requires approved site enrollment, properly formatted Special Links and conspicuous identification as an Associate. Review its current [linking requirements](https://affiliate-program.amazon.in/help/operating/linking) and [participation requirements](https://affiliate-program.amazon.in/help/operating/participation/) before launch. Cloudflare, Amazon and account eligibility terms can change.

To connect it after the repo is pushed to GitHub:

1. Sign in to Cloudflare and open **Workers & Pages**. Choose **Create application → Pages → Connect to Git** and authorize/select this GitHub repository.
2. Set production branch to `main`, framework preset to **Astro**, build command to `npm run build`, and build output directory to `dist`.
3. Set the Node version to 24 if a version setting is shown. Add `PUBLIC_SITE_URL` only after choosing the actual production domain; add no affiliate ID until confirmed.
4. Save the project and review the first deployment. Git-connected Pages deployments then rebuild on pushes; the included GitHub workflow separately checks each push/PR.
5. If adding a custom domain later, choose one only after brand/domain checks. Add it under the Pages project’s custom-domain settings, follow Cloudflare's displayed DNS instructions, wait for domain validation and HTTPS provisioning, then set `PUBLIC_SITE_URL` to the final HTTPS origin and trigger a fresh build.

No Cloudflare account, GitHub authorization, domain, paid resource or live deployment has been created from this workspace. Cloudflare or GitHub sign-in and repo authorization are account-level steps for you.

## Privacy and launch review

No analytics, advertising scripts, visitor accounts or contact form are configured. Local search stays in the browser. The private admin stores product details in D1. Product images are not collected or stored. Hosting providers may process request logs. The privacy policy and terms are drafts; complete and review them for the actual host, business, contact channel, affiliate programs and applicable law before public launch.

## Troubleshooting

- **`npm ci` fails:** use Node.js 24 and rerun after checking your connection to npm. Keep `package-lock.json` committed; do not delete it to work around errors.
- **Astro flags a content entry:** compare its frontmatter with the collection schema in `src/content.config.ts`, then run `npm run check` again.
- **A category is missing:** verify the category is in `src/data/categories.ts` and is marked `featured` if you expect it on the home page.
- **A product does not appear:** check `status: 'published'`, the exact category value, HTTPS affiliate URL, retailer and review date. Published product URLs still need human verification.
- **Canonical URLs or sitemap locations are blank:** configure `PUBLIC_SITE_URL` with your real HTTPS production origin and rebuild.
- **A route works locally but not in hosting:** keep trailing slashes and folder/index output; inspect Pages build logs and confirm output directory is exactly `dist`.

## Still required before a public launch

- Confirm brand name, domain and trademarks; supply the real production URL.
- Review the ten editorial drafts, complete sources, and decide which entries are publishable.
- Confirm permitted affiliate program enrollment, website property declarations, tracking ID, Special Links and imagery rights.
- Configure a monitored contact address and review legal/privacy wording.
- Connect GitHub to a static host, inspect the deployment and verify domain/HTTPS and metadata on the live site.
