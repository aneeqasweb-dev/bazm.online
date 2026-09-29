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

Released the fashion edit and account update on 2026-09-16 at https://bazm-online-frontend.vercel.app.

- Source: `9563255` (including `84f4508`).
- Verified preview: `dpl_13jixa8YU7J6BNnEeSovKkNQdmM1`.
- Production: `dpl_2syg3AT52Afuckdgfe5pU542qJCX`, READY and confirmed behind the public alias.
- All 20 hosted storefront checks passed, including the thirty-product pagination and archived-route checks. All 10 hosted account-page checks passed, including validation, password controls, navigation and WCAG A/AA checks.
- Hosted registration, verification, protected sessions, actual customer/admin browser sign-in and eight admin pages passed; temporary identities and fixtures were removed.
- Catalog schemas passed for 30 published products, 6 active categories, 77 active variants and their 77 inventory records.
- Public release smoke checks passed on all 10 paths. The public home, shop, login and register pages returned HTTP 200, displayed the released design and had no horizontal overflow at 1440px and 390px.
- The store continues to use sample products and test checkout. Live payment, transactional-email-provider activation and owner-admin setup remain separate from this design release.

## Adult collections correction

The owner pointed to the short frock images in the new-arrivals grid and asked for only men's and women's clothing, bags and accessories. The six added dresses and five shoe products are now archived. Adult men's shirts and handbags remain, alongside the original twelve-piece collection. The catalog contains nineteen products: six women's ensembles, seven men's pieces, five bags and one jewellery item. The two original evening bags now belong to Bags. Home uses four original-style collection photographs and navigation lists only Women, Men, Bags and Accessories alongside the general shopping links.

`node scripts/curate-staging-adult-collections.mjs --apply` makes the bounded catalog correction, validates documents before writes, preserves before-images in `systemSeeds/adult-collections-v1`, and leaves inventories, orders, customers and product URLs intact. Archived product and category routes return 404. The improved login/registration flow is unchanged. Frontend lint and TypeScript passed; browser verification expectations now cover the four requested collections and the excluded frock/shoe routes.

Correction released on 2026-09-16: source `f24100c`, verified preview `dpl_A2ghabQpqadYEuHzPV3aM2sbrytm`, production `dpl_7joc3WmtKRw22r2Bz3p79ZquvbK5`. Production is READY and assigned to https://bazm-online-frontend.vercel.app. All 16 hosted storefront checks passed at 1440px and 390px, including images, accessibility, category counts, search, size selection and retired routes. The size-selection check now waits for the client-only cart control before clicking, so it cannot click server-rendered controls before hydration. All 10 public smoke paths passed; public home/shop checks confirmed the four requested collections, nineteen products and removal of the rejected items on desktop and mobile. All published-product and active-category schemas passed, with each product assigned to one of the four active collections.

## Men's casual shirts removed — September 23

The four imported casual shirts are archived at the owner's request: Blue & Black
Check Shirt, Everyday Plaid Shirt, Blue Floral Short-Sleeve Shirt and Teal Check
Shirt. The Men collection now contains Sand Raahil Kurta, Navy Azlan Kurta and
Ivory Zayn Waistcoat. There are fifteen published products and eleven new arrivals.

`node scripts/remove-staging-mens-shirts.mjs --apply` applies this bounded edit.
It validates the four products, clears their homepage flags and saves their prior
documents in `systemSeeds/remove-mens-casual-shirts-v1` for restoration. Repeating
the command verifies the archived state and makes no changes. Product records,
variants, inventory and historical orders are retained. The shared catalog change
appears in both the local preview and hosted storefront without a frontend deploy.

## Original bag collection added — September 23

Six original Bazm demo bags extend the catalog to 21 products and the Bags
collection to 11 styles. The photographs were made with the built-in imagegen
workflow and saved alongside the exact prompts. See [the bag collection record](bags-edit.md)
for the product list, sample prices, image paths and repeat-safe publishing script.

## Purchase controls, demo checkout and reviews — September 23

The hosted storefront still had the September 16 frontend, while the bag and
menswear changes were already visible through the shared catalog database.
This frontend update exposes **Buy it now**, the saved guest cart and the
Easypaisa, JazzCash and card demo checkout. Buy it now saves the selected variant
and quantity and opens checkout; signing in merges the guest bag into the account.
Guests can inspect all payment forms before signing in to complete a demo order.
See [payments](payments.md) for the API, simulated delay and persistence details.

Product pages now link to **Write a review** beside the rating and in the reviews
section. `/product/[slug]/review` keeps the product in the sign-in return path,
shows that customer's delivered purchases for the selected product and reuses
the existing review service. Reviews remain pending until moderated. The form
retains its DOM reference during asynchronous saving, prevents duplicate pending
submissions, preserves text on failure and disables submission until hydration.
The latter prevents a slow-loading page from submitting review content in a URL.

Validation includes 89 frontend unit tests, lint and TypeScript; browser coverage
checks saved carts, purchase navigation, payment forms, Paid confirmation and
delivered-purchase review submission. Hosted checks use a temporary customer and
product and remove their exact records afterward.

Released on 2026-09-23 at https://bazm-online-frontend.vercel.app, deployment
`dpl_5vChRna4eeaTHZkdBvqYwaKtxa7a`. The final production build passed and the
public alias was verified against this deployment. Hosted testing confirmed
simulated Paid orders for all three payment methods, transaction IDs and order
confirmations. The corrected review form passed actual hosted submission and
pending-review persistence checks, including the 390px mobile layout. All ten
public release smoke paths passed. No real payment provider was activated.

## Easier account access — September 23

Registration now asks for name, email and one password, with the existing password
rules and show/hide control. Sign-in keeps its email/password form. Account tabs,
verification, password recovery and reset links preserve the original checkout or
product-review destination. Return paths are restricted to local pages and reject
external destinations, control characters and account-page loops.

Email verification now offers **I’ve verified my email** and resend controls. It
reloads Firebase verification, refreshes the token, synchronizes the customer
profile and creates the verified server session before returning to checkout.
Visitors using another browser receive a sign-in link to the same destination.
Email-action links carry that destination in Firebase's continue URL. Password
recovery reports connection/delivery failures and still gives the same response
for an unknown email address. Sign-out waits for its browser handler, checks that
the server session was removed and offers a retry on failure.

`node scripts/verify-auth-shopping.mjs` exercises actual temporary-account signup,
verification, cart merging, sign-out, wrong-password feedback, password reset and
return to checkout against the local staging-backed app. Set `AUTH_FLOW_BASE_URL`
to the known public portfolio or its Vercel deployment to test hosted behavior.
The script intercepts email-delivery requests, generates and redeems Firebase
action codes without sending mail, and removes only its temporary identity and
cart records. It does not place orders or change product inventory.

Released on 2026-09-23 at https://bazm-online-frontend.vercel.app, deployment
`dpl_BnKqY7twMefRFCfrP5nRxMfxjPYN`. All 114 frontend unit tests, lint, TypeScript
and the production build passed. The hosted account flow passed with an actual
temporary Firebase customer, including verification, saved-cart merging,
sign-out, wrong-password feedback, password reset and returning to checkout.
All ten hosted account-page checks passed at 1440px and 390px, including
accessibility and checkout navigation. Email delivery was intercepted for these
checks; Firebase action codes were generated and redeemed, and inbox delivery
was not tested. The temporary customer and carts were removed.
The public alias was confirmed against the released deployment; all ten public
smoke paths and desktop/mobile checks of the three-field signup and preserved
checkout destination passed.

## Customer reviews below each product — September 23

The product review section now follows the supplied reference: a full-width
heading, overall stars, five rating-distribution bars, Write a review and Ask a
question actions, review/question tabs and a sort selector. It sits between the
product details and related pieces, and adapts to desktop, tablet and mobile.
Empty products show zero reviews without sample endorsements. Published reviews
retain author names, dates, photos, verified-purchase badges and reporting.

Counts use database aggregations over every published review. Most recent,
highest-rated and lowest-rated sorting runs on the server with stable cursor
pagination; switching the sort resets the cursor. Three additive Firestore
indexes in `firebase/firestore.indexes.json` support the rating queries.

Write a review keeps the existing delivered-purchase and moderation flow. The
Questions tab lets verified customers submit a private product question through
the existing support service, with the product name and URL included. Guests
return to the Questions tab after signing in. Success links to the customer's
support conversations, where the team can reply. Questions are not presented as
public reviews or included in review counts.

`node scripts/verify-product-reviews.mjs` checks all three screen sizes,
accessibility and keyboard tabs, then creates an isolated temporary product with
12 published and three unpublished review fixtures to check every sort and page.
It also signs in a temporary customer, sends a product question, checks its
stored contents and opens the account conversation. It removes only its own
fixtures afterward. Set `REVIEWS_TEST_BASE_URL` to test a known hosted Bazm URL.

Released on 2026-09-23 at https://bazm-online-frontend.vercel.app, deployment
`dpl_G9CYiqzvB5h4iHUWxr7o3ANqj4F1`. All 119 frontend unit tests, lint, TypeScript
and the production build passed. The three additive database indexes finished
building before release. Hosted browser checks passed at 1440px, 768px and 390px,
including accessibility, keyboard tabs and the empty state. All three sorting
modes returned the correct 12 published fixtures across three pages, excluded
unpublished fixtures and retained complete counts. Actual signed-in question
submission, database persistence and the account conversation passed. Temporary
products, reviews, support tickets and test customers were removed. The public
alias was verified, all ten public smoke paths passed, and desktop/mobile checks
confirmed the new review section, sorting and question navigation on the live
store.

## Review reference layout and clearer typography — September 23

The follow-up review design matches the supplied reference more closely: a wide
product strip with thumbnail, current price and Add to cart sits above Customer
Reviews; the rating summary and right-aligned actions use wider spacing, and the
related-products heading is centered. The empty review panel retains its message
for screen readers while keeping the reference's uncluttered visual space.

The review area uses Arial/Helvetica with bold headings, heavier tabs, counts and
buttons, larger text and darker secondary copy. Layouts are checked at 1920,
1440, 768, 390 and 320 pixels. The product strip reuses the existing cart action
with the currently selected variant and quantity; its request was intercepted in
the browser check to verify the payload without changing customer carts.

Released at https://bazm-online-frontend.vercel.app as
`dpl_DEEYtZMUfsKDLp6tcLG4yBqbnWpj`. The nine relevant existing component tests,
frontend lint, TypeScript and production build passed. Hosted checks passed at
all five widths, including computed font weights, accessibility, question-tab
navigation and the product-strip cart payload. The public alias, live mobile
typography and all ten public smoke paths were verified after promotion.

## Compact product cards and clearer storefront — September 23

The homepage now uses shorter, four-product edits with centered View all links,
a dedicated bag collection and a smaller hero. A dark announcement strip, visible
Home navigation and stronger buttons make the shopping paths easier to find.
Existing Bazm photography, product names and actual prices remain the source of
the content.

Product grids across the homepage, catalog and related products are capped at
1280px. They show four columns on desktop, three on tablet and two on phones,
with consistent 4:5 images. Cards stay about 307px wide even on large displays.
Category tiles also use a compact grid on phones. Arial/Helvetica storefront
copy, heavier product names and larger prices address the earlier readability
feedback; redundant card tags and the hidden image overlay have been removed.

The homepage shows four new arrivals, four bags and four featured pieces; the
full catalog still contains all 21 published products. Existing cart, Buy it now,
review, account and demo-payment flows are retained.

Local frontend lint and TypeScript checks passed. The existing storefront audit
passed all 16 desktop/mobile route and interaction checks, including loaded
images, accessibility, search, filters and product-size selection. Additional
layout checks passed at 1920, 1024, 768, 390 and 320px, confirming card dimensions,
font sizes/weights and no horizontal overflow; related products remain compact
at 1920px and catalog filters fit at 320px.
