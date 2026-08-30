# MVP scope and delivery order

## Included capabilities

1. Firebase email/password authentication, verification, recovery, profiles,
   addresses, and role enforcement; optional Google sign-in only when configured.
2. Hierarchical categories; products, media, variants, unique SKUs, inventory,
   reservations, and an append-only inventory ledger.
3. Server-rendered catalog, search/filter/sort, product details, cart, wishlist,
   responsive navigation, accessibility, and SEO metadata/structured data.
4. Trusted checkout, coupons, address/delivery selection, immutable order
   snapshots, lifecycle tracking, cancellation eligibility, and notifications.
5. Provider-neutral payment creation, signed webhook verification, status,
   refunds, transactional email, and a configurable shipping-fee strategy.
6. Admin dashboards for catalog, inventory, orders, customers, payments, coupons,
   reviews, returns, reports, settings, and audit logs.
7. Verified-purchase reviews, return/refund workflows, CRM notes/tags/support,
   analytics, security hardening, automated tests, and deployment documentation.

## Explicit non-goals for the MVP

Multi-vendor sellers, native mobile apps, multi-language/currency, international
shipping, loyalty/referrals/gift cards, live chat, AI recommendations, advanced
personalization, marketing automation, and microservices remain future work.

## Dependency order

Planning → foundation → authentication → core models → categories → products →
storefront → cart/wishlist → inventory → checkout/orders → payments → email →
admin → CRM → reviews → returns → SEO/performance → audits/testing → deployment.

A phase begins only when the previous phase gate has evidence. UI alone never
completes a feature: trusted backend, schema, validation, authorization, states,
tests, accessibility, documentation, lint, typecheck, and build all apply.
