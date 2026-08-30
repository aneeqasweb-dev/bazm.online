# Phase 14 Reviews

Phase 14 implements verified-purchase product reviews with a trusted moderation
boundary.

## What is included

- Customers can create one review for a delivered order line identified by
  `orderId`, `productId`, and `variantId`.
- Review creation rejects non-owner orders, wrong products, premature delivery
  states, duplicates, and image paths outside the signed-in customer's review
  folder.
- Reviews and owner edits always enter `PENDING` moderation. The existing
  `PUBLISHED` status represents an approved public review.
- Owners can edit reviews for 30 days unless the review has been hidden.
- Review image uploads are constrained by Storage rules to active owners,
  JPEG/PNG/WebP content, and files below 3 MB.
- Public product pages render only `PUBLISHED` reviews, with cursor pagination.
- Product `ratingSummary` is recalculated from `PUBLISHED` reviews after
  publish, edit, reject, or hide moderation changes.
- Customers can report published reviews. Reports increment the review report
  count, create a `reviewReports` record, and write an audit log entry.
- Admin review moderation displays reported counts and continues to write audit
  logs for publish/reject/hide actions.

## Verification coverage

- Domain schema coverage for review media and public review DTOs.
- Storage rules tests for owner-only review image uploads, type checks, size
  checks, disabled accounts, and deletes.
- `tests/phase-14-review-flow.mjs` covers eligibility failures, successful
  create/edit lifecycle, duplicate prevention, reporting, moderation, aggregate
  recalculation, public pagination, account UI rendering, and admin report
  visibility.

Run the full gate with:

```bash
npm run check
npm run test:emulators
```
