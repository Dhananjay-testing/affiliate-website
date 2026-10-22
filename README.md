# Pickora — a product discovery publication

Pickora is the working name for a multi-category editorial shopping website for Indian readers. It is built with Astro static site generation, TypeScript, Markdown content collections and CSS. Product records and categories are maintained as data. The design is responsive, uses locally stored original SVG artwork, system fonts and minimal browser JavaScript.

> **Working brand:** Pickora has not been cleared as a final brand. Before launch, check domain availability, similar businesses and relevant trademarks. Replace the name, mark and tagline centrally in `src/config/site.ts` and `public/brand/`.

## Run the site

Install Node.js 24 (Astro requires a supported modern Node version), then in this folder run:

```powershell
npm ci
npm run dev
```

Open the local address printed by Astro. To validate content and TypeScript, run `npm run check`. To build the production files, run `npm run build`; the static website is written to `dist/`. `npm run preview` serves that built version locally.

## Content and product maintenance

### Add or edit an article or buying guide

Create a Markdown file in `src/content/articles/` or `src/content/guides/`. Copy the frontmatter from an existing file. Change `draft: true` to `draft: false` only after editorial review. Drafts are excluded from published pages, search and sitemap. Use a category name from `src/data/categories.ts`, write original content, add credible source links when the facts need them, and update the publish date. The content schema checks required metadata. Articles and guides render through shared templates; no page-layout edits are needed for normal content changes.

The initial ten pieces in those folders are substantial unpublished drafts. Review and fact-check them before publication. They are intentionally not presented as live articles.

### Add a product recommendation

Add a record to `src/data/products.ts` with a unique slug, exact product name, category, original description, intended use, selection criteria, supported benefits, limitations, retailer, direct verified affiliate URL, `status: 'draft'`, and review date. Set `status: 'published'` only after the product details, image rights and link have been checked. A published record must have an HTTPS destination, retailer name and `lastReviewed` date or `npm run check` will fail. Do not enter a fabricated URL, tracking tag, price, rating or review. Optional product images must be owned/licensed and have descriptive alt text. Do not add remote product images without permission.

The current tracking ID setting in `src/config/site.ts` is blank by design. Confirm the active Amazon India tracking ID in Associates Central before configuring it. Create Amazon Special Links using the permitted Associates tools and verify the destination; this site does not make affiliate links from ordinary product URLs.

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

`npm run check` runs Astro's TypeScript/content checks and the local category/product/frontmatter validator. `npm run build` runs those checks, generates the static site and verifies that local HTML links/assets resolve to generated files. `npm run check:routes` repeats the route check after a build. The GitHub Actions workflow at `.github/workflows/ci.yml` runs `npm ci`, `npm run check` and `npm run build` on pushes and pull requests to `main`.

The validators check required editorial metadata, category names, unique category slugs, publication requirements for product links and local generated route targets. They cannot prove that an external retailer URL, product claim, source, licence or affiliate relationship is valid; those require editorial verification. No automated external URL crawler or formal screen-reader audit is configured.

## Deployment: Cloudflare Pages

Astro's static build works as plain HTML and assets; it does not require an Astro Cloudflare adapter. Cloudflare Pages serves static directory routes and a custom `404.html` as required by this build ([routing details](https://developers.cloudflare.com/pages/configuration/serving-pages/)). Cloudflare recommends Workers for new full-stack projects, but this site is static-only. I reviewed Cloudflare's current [Developer Platform service-specific terms](https://www.cloudflare.com/service-specific-terms-developer-platform/) on 21 October 2026; they cover Pages hosting and restrict illegal/harmful content, but I found no affiliate-specific prohibition. This is a limited terms review, not account-level confirmation or legal advice. Amazon India's [Operating Agreement](https://affiliate-program.amazon.in/help/operating/agreement) requires approved site enrollment, properly formatted Special Links and conspicuous identification as an Associate. Review its current [linking requirements](https://affiliate-program.amazon.in/help/operating/linking) and [participation requirements](https://affiliate-program.amazon.in/help/operating/participation/) before launch. Cloudflare, Amazon and account eligibility terms can change.

To connect it after the repo is pushed to GitHub:

1. Sign in to Cloudflare and open **Workers & Pages**. Choose **Create application → Pages → Connect to Git** and authorize/select this GitHub repository.
2. Set production branch to `main`, framework preset to **Astro**, build command to `npm run build`, and build output directory to `dist`.
3. Set the Node version to 24 if a version setting is shown. Add `PUBLIC_SITE_URL` only after choosing the actual production domain; add no affiliate ID until confirmed.
4. Save the project and review the first deployment. Git-connected Pages deployments then rebuild on pushes; the included GitHub workflow separately checks each push/PR.
5. If adding a custom domain later, choose one only after brand/domain checks. Add it under the Pages project’s custom-domain settings, follow Cloudflare's displayed DNS instructions, wait for domain validation and HTTPS provisioning, then set `PUBLIC_SITE_URL` to the final HTTPS origin and trigger a fresh build.

No Cloudflare account, GitHub authorization, domain, paid resource or live deployment has been created from this workspace. Cloudflare or GitHub sign-in and repo authorization are account-level steps for you.

## Privacy and launch review

No analytics, advertising scripts, server, database, user accounts or contact form are configured. Local search stays in the browser. Hosting providers may process request logs. The privacy policy and terms are drafts; complete and review them for the actual host, business, contact channel, affiliate programs and applicable law before public launch.

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
