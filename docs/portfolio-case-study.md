# Bazm portfolio case study

## Project summary

Bazm is a Pakistan-first fashion commerce application designed to demonstrate
full-stack product engineering rather than only static frontend work. The system
covers customer shopping journeys and the operational workflows required to run
the catalog after launch.

## What the implementation demonstrates

### Frontend engineering

- Next.js App Router, React, TypeScript, responsive layouts, loading/error states,
  metadata, canonical routes, sitemap, and structured data.
- Accessible forms and navigation with automated desktop/mobile journeys.
- Catalog search and filters, cart, wishlist, checkout, account management,
  reviews, returns, and customer support.

### Backend and data engineering

- Authenticated Next.js route handlers reuse transaction-focused service modules.
- Firestore schemas, converters, composite indexes, bounded queries, cursor
  pagination, idempotency records, immutable audit logs, and inventory ledgers.
- Transactional checkout reserves stock and snapshots prices instead of trusting
  browser totals.
- Provider adapters keep sandbox payments, COD, email, and future integrations
  separate from commerce rules.

### Security engineering

- Firebase ID tokens are exchanged for secure server session cookies.
- Verified email, active-account state, role, permission, and claims-version
  checks protect private pages and mutations.
- Firestore rules deny by default, while server operations perform explicit
  authorization because Admin SDK access bypasses those rules.
- Media uploads validate purpose, role, MIME type, binary signature, ownership,
  and size before reaching Cloudinary.
- Secrets remain server-only and environment audits scan configuration boundaries.

### Reliability and quality

- Shared Zod schemas validate data at browser, API, service, and persistence
  boundaries.
- Emulator flows cover authentication, authorization, commerce transactions,
  payments, CRM, reviews, returns, rules, and security regressions.
- Unit tests, strict TypeScript, ESLint, Prettier, production builds, Playwright,
  accessibility checks, and release smoke tests form the quality gate.

## Free-tier engineering decision

New Firebase Storage/Functions usage would require billing for this project.
Bazm therefore keeps Firebase Authentication and Firestore on Spark, stores its
small portfolio image set in Cloudinary, and runs trusted server routes on
Vercel Hobby. Existing Firebase Functions and Storage emulator code is retained
as architectural and testing evidence rather than erased.

This migration demonstrates a practical engineering tradeoff: preserve domain
logic and security boundaries while changing infrastructure adapters to meet a
zero-cost operating constraint.

## Current staging evidence

- Dedicated staging Firestore project in `asia-south1` with deployed indexes.
- Three categories and four original-image products with variants and inventory.
- Cloudinary upload/delete verification and idempotent staging seed scripts.
- Forty production routes compile successfully.
- Thirty-five frontend unit tests currently pass alongside lint and strict
  TypeScript checks.

## Honest limitations

- Payments use COD or a sandbox adapter; no real card details are collected.
- Transactional email uses an adapter and requires a selected provider for live
  delivery.
- The portfolio catalog is deliberately small to remain inside free quotas.
- Firebase email/password Authentication is enabled; the owner account must
  complete email verification before administrator access is granted.
- Legal, tax, courier, and merchant-provider approval would still be required
  before operating Bazm as a real business.

## Resume-ready description

Built a full-stack fashion commerce platform with Next.js, TypeScript, Firebase,
and Cloudinary, implementing secure session authentication, role-based admin
workflows, transactional inventory and checkout, server-validated media uploads,
Firestore indexing/rules, and automated unit, emulator, accessibility, security,
and end-to-end testing. Migrated paid Firebase Storage/Functions dependencies to
free-tier Cloudinary and Vercel adapters while preserving shared domain services
and historical test coverage.
