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

Released on 2026-09-15 at https://bazm-online-frontend.vercel.app.

- Source commit: `efccdb1` (the follow-up `d2ec2e9` adjusts only the browser test timeout).
- Verified preview: `dpl_Fsb3s2WtgW93UaCXEDJrTtFCL45Q`.
- Production deployment: `dpl_6tjKJTpwBseqboCo3soECYVGhdLF`, ready and assigned to the public alias.
- Frontend lint, strict TypeScript, 35 unit tests, and the Vercel production build passed.
- All 14 storefront browser checks passed locally and on the hosted preview at 1440px and 390px. Images loaded, no horizontal overflow, search/clear/empty results and size selection worked, and home/shop/product pages passed the configured WCAG A/AA axe checks.
- All 12 products, 24 variants/inventory records, and 3 categories passed the domain schemas. Re-running the seed correctly made no changes.
- After the production alias became ready, all 10 public smoke paths passed.
  Public home and shop pages returned HTTP 200 and showed the new design and
  all 12 product cards at both 1440px and 390px.
- The existing administrative, payment and email-provider setup is unchanged.

## Fashion edit and account access — September 16

The owner selected the cream-and-olive design again and removed the kids and general-store expansion. The superseded UI is preserved locally on `draft/marketplace-exploration-20260916`; it was not deployed. The active edit keeps the original twelve pieces and adds eighteen fashion products: six women's dresses, four men's shirts, five pairs of shoes and three bags. There are thirty sample products in six collections. Home retains the Rose Ayla hero and original three collection photographs, adds three collection cards, and shows twelve arrivals drawn across collections plus four original featured pieces. Shop pagination remains twenty-four products per page.

`node scripts/curate-staging-fashion.mjs --apply` archives thirty-four products and six categories from the superseded seed. It restores the original collection metadata and keeps eighteen additions. The script validates each final document before committing atomically, checks concurrent catalog modifications, refuses other projects, and retains before-images in `systemSeeds/fashion-curation-v1`. Existing variants, inventory, orders and customers are preserved. Archived product/category routes return 404. `scripts/refine-staging-fashion-labels.mjs` improves five sample product names and records before-images separately.

Seventeen added product photos come from the MIT-licensed DummyJSON sample catalog; original image URLs and selected descriptions are recorded in `scripts/fashion-additions-source.json`, with its license in `docs/licenses/dummyjson.txt`. They were uploaded to Cloudinary, so the live app does not depend on DummyJSON. The source photographs remain in the preserved draft branch. The eighteenth product uses a built-in imagegen image copied to `scripts/assets/everyday-white-sneakers.png` and uploaded as `bazm/marketplace/everyday-white-sneakers`. Its prompt requested a square, clean e-commerce product photograph of white low-top chunky sneakers with beige sole accents, realistic materials, a plain warm-white background, and no logos, text or watermark. These images and prices describe a portfolio sample catalog.

Login, registration, password recovery and email verification now use a shared cream-and-olive layout. Sign-in and create-account navigation is explicit; inputs support browser autofill and password visibility, validation focuses the first invalid field, and registration explains verification and resend steps. Email/password authentication, verification requirements, protected sessions and pre-hydration POST safeguards remain in place. Google sign-in is only displayed when configured.

Local verification: 44 frontend unit tests, lint and TypeScript passed. Twenty storefront browser checks passed at desktop and mobile widths, including six category counts, photos, search, size selection and accessibility. Actual temporary-customer registration, email verification and browser sign-in passed, as did admin sign-in and eight admin pages; the test fixtures were removed. `npm run test:auth-design` covers the account pages, error states, password visibility, navigation, responsive layout and accessibility. `npm run test:storefront` also checks pagination across all thirty products and archived routes.

The expanded catalog exposed an existing pagination problem: the generic search-parameter reader cut signed cursors to eighty characters, so the second page silently restarted at the beginning. Cursor parameters now allow 2,048 characters while ordinary filter limits stay unchanged. A browser check confirms twenty-four products on the first page, six distinct products on the second, and 404 responses for retired departments and products. Shared field errors also retain readable contrast on the existing dark account-profile screen.
