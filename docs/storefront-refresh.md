# Storefront refresh — September 2026

The original portfolio storefront had four sample products, a text-only hero, image-free category tiles, and a large technical filter form. This refresh adds a cream-and-olive fashion storefront, a photographic hero, three collection cards, eight new arrivals, four featured pieces, and two-column mobile product grids. The shop keeps its existing filtering and pagination and moves secondary filters into an accessible native disclosure.

## Sample catalog

Eight additional products bring the demo to twelve: six women's ensembles, three menswear pieces and three accessories. The six new clothing products have Small, Medium and Large variants; the two new accessories each have one size, for twenty new inventory records. Product routes, SKU registries and inventory are created together in one Firestore transaction. New products have no fabricated reviews or ratings.

`npm run seed:staging:expanded` previews the change; add `-- --apply` to publish it to `bazmonline-staging-aneeqa`. The script requires the original seeds and image files, refuses other projects, creates new records without overwriting existing IDs, and is a no-op after successful completion. The seed record retains previous collection images and merchandising flags. Existing stock, customers, orders and permissions are unchanged.

## Image assets and prompts

Generated with the **built-in imagegen tool**. The eight originals are saved in `scripts/assets/` and uploaded to Cloudinary at `bazm/demo/<filename without extension>`. They depict sample products for a portfolio, not actual inventory photography. These local source files are excluded from Vercel uploads; the app uses Cloudinary URLs stored in the catalog.

The first prompt, for `scripts/assets/rose-ayla-suit.png`:

> Use case: product-mockup. Create one portrait 3:4 premium fashion e-commerce catalog photo for Pakistani clothing brand Bazm portfolio demo. Full-length adult Pakistani woman wearing an elegant dusty rose pink embroidered long kurta, matching straight trousers and soft chiffon dupatta. Tasteful restrained embroidery, authentic fabric texture, natural anatomy. Pale warm limestone studio background, diffuse window lighting, muted editorial luxury styling, entire outfit visible with margin above head and below feet. No text, no logos, no watermark. Save as rose-ayla-suit.

Each remaining prompt uses this template, substituting the name and subject below:

> Use case: product-mockup. Asset: NAME, one portrait 3:4 premium e-commerce catalog photograph for Pakistani fashion brand Bazm portfolio demo. Subject: SUBJECT Pale warm limestone studio backdrop, soft diffuse window lighting, realistic high-end editorial fashion photography, restrained natural color grading, sharp fabric or material texture. Generous margins and entire product/outfit visible, anatomically natural adults. No text, no logo, no watermark.

| Local filename in `scripts/assets/` (NAME without `.png`) | SUBJECT                                                                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ivory-sahar-set.png`                                     | Full-length adult Pakistani woman wearing an ivory cotton long kurta with intricate cream tonal embroidery, straight trousers and airy ivory dupatta. Relaxed graceful pose.                      |
| `sage-inaya-suit.png`                                     | Full-length adult Pakistani woman wearing a sage green long embroidered kurta, matching straight trousers and a fine organza dupatta, delicate ivory floral embroidery.                           |
| `midnight-sitara-set.png`                                 | Full-length adult Pakistani woman wearing a midnight black formal long kurta with delicate antique-gold embellishment on neckline and cuffs, matching trousers and flowing black chiffon dupatta. |
| `sand-raahil-kurta.png`                                   | Full-length adult Pakistani man wearing a sand beige textured linen kurta with understated band collar and matching straight pajama trousers, dark brown leather sandals.                         |
| `navy-azlan-kurta.png`                                    | Full-length adult Pakistani man wearing a deep navy blue cotton kurta pajama with band collar, refined button placket, full sleeves and matching straight trousers.                               |
| `pearl-noor-earrings.png`                                 | Pair of elegant antique-gold Pakistani jhumka earrings with small ivory pearl fringes, product still life on pale cream travertine plinth, close-up realistic metal work and pearl detail.        |
| `champagne-zari-potli.png`                                | One champagne gold embroidered silk potli drawstring evening handbag with pearl tassels and rounded structured base, product still life on pale cream travertine plinth, entire bag visible.      |

## Verification

`npm run test:storefront` checks the local staging-backed site. Set `STOREFRONT_TEST_BASE_URL` for the known hosted portfolio or its Vercel preview. It checks twelve products, eight new arrivals, category counts, images, responsive overflow, size selection, search and empty-state recovery, and automated accessibility on home, shop and product pages. Screenshots are saved under `test-results/storefront/`.

Deployment and final verification results will be recorded after release.
