# Risk register

| ID  | Risk                                                    | Likelihood / impact | Mitigation                                                                                 | Owner / trigger                     |
| --- | ------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------- |
| R1  | Provider unavailable or merchant ineligible in Pakistan | Medium / High       | Provider interfaces, early sandbox/merchant validation, COD policy fallback                | Product owner before Payments phase |
| R2  | Inventory oversell under concurrent checkout            | Medium / High       | SKU inventory, Firestore transactions, reservations, expiry, idempotency tests             | Backend owner before Checkout       |
| R3  | Privilege escalation through client/profile role        | Medium / Critical   | Claims-only authority, server checks, negative Rules tests, audited claim flow             | Security owner before Auth gate     |
| R4  | Personal/payment data leakage                           | Low / Critical      | Data minimization, no card storage, secret manager, log redaction, least privilege         | Security owner continuously         |
| R5  | Firestore cost/query growth                             | Medium / High       | Cursor limits, bounded arrays, index review, budgets/alerts, query tests                   | Backend owner per collection        |
| R6  | Webhook replay or duplicate fulfillment                 | Medium / High       | Signature/timestamp verification, event uniqueness, idempotent transactions                | Payments owner before sandbox E2E   |
| R7  | Catalog images infringe rights or degrade performance   | Medium / Medium     | Asset provenance, upload validation, derivatives, dimensions/alt metadata                  | Catalog owner before launch         |
| R8  | Pakistan tax/returns policy is inaccurate               | Medium / High       | Accountant/legal review, versioned policy/settings, no premature claims                    | Product owner before Checkout       |
| R9  | Firebase project/environment data crosses boundaries    | Low / High          | Separate projects, aliases, protected deploy workflow, synthetic non-prod data             | Platform owner before cloud setup   |
| R10 | Vendor lock-in impedes future expansion                 | Medium / Medium     | Domain services, provider/repository adapters, exportable snapshots/events                 | Architecture owner at scale review  |
| R11 | Accessibility regressions                               | Medium / Medium     | Semantic components, automated checks, keyboard/screen-reader E2E gates                    | Frontend owner per feature          |
| R12 | Dependency or supply-chain vulnerability                | Medium / High       | Lockfile, Dependabot/audit review, minimal dependencies, pinned CI actions                 | Platform owner continuously         |
| R13 | Stale custom claims or old ID tokens retain access      | Medium / Critical   | Versioned claims, session claim checks, server-side active-profile guard, revocation tests | Security owner before audit gate    |
| R14 | Browser XSS/clickjacking/header regression              | Medium / High       | Global CSP/security headers, single escaped JSON-LD sink, static security gate             | Frontend owner before launch        |

## Review cadence

Review at every phase gate and before any production deployment. A risk closes
only with recorded evidence; accepting a high/critical residual risk requires the
product owner and the relevant technical owner.
