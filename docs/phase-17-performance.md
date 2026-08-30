# Phase 17 performance baseline

Date: 2026-08-29

## What changed

- Removed global Firebase browser initialization from the root layout so
  anonymous public routes do not load Firebase client code by default.
- Kept Firebase browser integrations on auth, account, cart, checkout, admin,
  wishlist, and product routes where callable actions/App Check may be needed.
- Lazy-loaded Firebase browser integrations and product purchase action buttons.
- Replaced deprecated product image `priority` with Next 16 `preload` for the
  product LCP image.
- Added explicit private `Cache-Control` headers for account, admin, auth
  session, cart, checkout, and wishlist routes.
- Added short public cache headers for `robots.txt` and `sitemap.xml`.
- Tightened remote image patterns, image sizes, image quality allow-list, and
  image cache TTL.
- Reduced the admin dashboard recent-document sample window from 200 to 100 per
  collection.

## Build baseline

Measured from `frontend/.next/diagnostics/route-bundle-stats.json` after
`npm run build --workspace frontend`.

| Route stats key      | First-load JS gzip | First-load JS raw | Chunks | Budget result                                     |
| -------------------- | -----------------: | ----------------: | -----: | ------------------------------------------------- |
| `/`                  |          142,739 B |         478,101 B |      7 | Pass                                              |
| `/shop`              |          142,739 B |         478,101 B |      7 | Pass                                              |
| `/[...categoryPath]` |          142,739 B |         478,101 B |      7 | Pass                                              |
| `/product/[slug]`    |          388,249 B |       1,393,197 B |      9 | Pass with approved Firebase action-code exception |
| `/cart`              |          386,008 B |       1,386,989 B |      9 | Pass with approved Firebase action-code exception |
| `/checkout`          |          382,001 B |       1,375,206 B |      9 | Pass with approved Firebase action-code exception |
| `/admin`             |          380,797 B |       1,370,785 B |      9 | Pass with approved admin exception                |

## Caching and privacy decision

Public catalog pages remain request-rendered because catalog mutations do not yet
publish revalidation events. The performance work therefore focuses on:

- bounded Firestore reads;
- per-request React memoization already present in server data helpers;
- not loading Firebase client code on anonymous public catalog routes;
- explicit no-store headers on private/authenticated pages.

Persistent cross-request caching is intentionally not used for private data.

## Firestore read profile

The key journeys are bounded by document/query limits:

- Home: root categories plus two 20-document product windows, all filtered by
  slug registry before linking.
- Shop: category options plus a 96-product scan window; matching product routes
  are slug-registry checked.
- Category: up to 4 breadcrumb segments, 100 child categories, and a 25-document
  product page.
- Product: slug lookup, one product, up to 50 variants, 5 reviews, category
  breadcrumbs, and a related-products bounded catalog scan.
- Cart/checkout: user-scoped reads with 50 cart items or 20 saved addresses.
- Admin: paginated tables are 25 rows; dashboard samples are capped at 100 recent
  documents per collection.

The Phase 17 gate checks these source-level limits, route bundle budgets, private
cache headers, product LCP image priority, and emulator-rendered response/HTML
budgets.
