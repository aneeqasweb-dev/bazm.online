# Bazm bag collection — September 23, 2026

Six original sample styles extend the existing five bags. The collection takes
general styling cues from the structured, shoulder and tote categories at
[RTW Creation](https://rtwcreation.com/collections) and the textured shoulder bags at
[Charles & Keith](https://www.charleskeith.com/catalog/bags/shoulder-bags).
The published products use the **Bazm** brand, original names and generated photos.
Prices and inventory are sample values for the portfolio's demo checkout.

| Product                        | Color    | Sample price (PKR) |
| ------------------------------ | -------- | -----------------: |
| Ivory Meher Top-Handle Bag     | Ivory    |              6,490 |
| Burgundy Ayla Crescent Bag     | Burgundy |              4,790 |
| Mocha Mira Woven Tote          | Mocha    |              6,990 |
| Noir Sana Quilted Shoulder Bag | Black    |              5,490 |
| Caramel Rumi Bucket Bag        | Caramel  |              4,990 |
| Blush Lila Mini Bow Bag        | Blush    |              3,990 |

## Assets and prompts

Generated with the **built-in image_gen tool**, one image per product. The exact
final prompt set is saved in [`scripts/bags-edit-prompts.json`](../scripts/bags-edit-prompts.json).
Original image outputs are copied into the project without modifying them:

- `scripts/assets/bags-edit-v1/ivory-meher-top-handle-bag.png`
- `scripts/assets/bags-edit-v1/burgundy-ayla-crescent-bag.png`
- `scripts/assets/bags-edit-v1/mocha-mira-woven-tote.png`
- `scripts/assets/bags-edit-v1/noir-sana-quilted-shoulder-bag.png`
- `scripts/assets/bags-edit-v1/caramel-rumi-bucket-bag.png`
- `scripts/assets/bags-edit-v1/blush-lila-mini-bow-bag.png`

Each photograph shows one unbranded bag against a warm cream studio background,
with soft lighting and full product framing. The storefront serves the photos
through the existing Cloudinary image loader.

## Catalog update

Product definitions live in [`scripts/bags-edit-source.json`](../scripts/bags-edit-source.json).

```sh
node scripts/seed-staging-bags-edit.mjs
node scripts/seed-staging-bags-edit.mjs --apply
```

The first command previews the exact products. The second uploads images with
stable Cloudinary IDs and creates products, one-size variants, SKU/slug registry
entries and twelve demo stock units per bag. Records are validated with the
domain schemas and committed in one Firestore transaction. The script checks
for existing IDs both before upload and before commit, accepts only the known
staging project, and records its changes in `systemSeeds/bags-edit-v1`.
Repeating the seed makes no changes. Existing products and inventory remain intact.

The resulting catalog has 21 published products, including 11 bags. New bags are
marked as new arrivals and use the existing cart, Buy it now and payment flow.
The shared catalog is visible on both the local preview and hosted storefront.
