import Image from "next/image";
import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { ProductCard } from "@/components/store/product-card";
import { StoreShell } from "@/components/store/store-shell";
import { listHomeCategories, listHomeProducts } from "@/lib/catalog/server";
import { publicMetadata } from "@/lib/seo/config";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata({
  description:
    "Discover contemporary Pakistani fashion at Bazm. Explore embroidered ensembles, refined menswear and accessories for every gathering.",
  path: "/",
  title: "Bazm — Contemporary Fashion Pakistan",
});

export default async function Home() {
  const [categories, featured, newArrivals] = await Promise.all([
    listHomeCategories(),
    listHomeProducts({ kind: "FEATURED" }),
    listHomeProducts({ kind: "NEW" }),
  ]);
  const heroProduct =
    newArrivals.find((p) => p.slug === "rose-ayla-suit") ??
    newArrivals[0] ??
    featured[0];
  return (
    <StoreShell>
      <JsonLd data={organizationJsonLd()} id="organization-json-ld" />
      <JsonLd data={websiteJsonLd()} id="website-json-ld" />
      <main>
        <section className="store-hero">
          <div className="store-hero-copy">
            <p className="store-eyebrow">THE NEW SEASON EDIT · 2026</p>
            <h1>
              For every
              <br />
              kind of <em>gathering.</em>
            </h1>
            <p className="store-hero-description">
              Soft hues. Beautiful details. Pieces that feel like you.
              <br className="hidden lg:block" /> Discover a fresh expression of
              Pakistani style.
            </p>
            <Link className="store-button" href="/shop">
              Shop the collection <span aria-hidden="true">↗</span>
            </Link>
            <Link className="store-hero-secondary" href="#categories">
              Find your next favourite <span aria-hidden="true">↓</span>
            </Link>
          </div>
          {heroProduct ? (
            <Link
              className="store-hero-image"
              href={`/product/${heroProduct.slug}`}
              aria-label={`Discover ${heroProduct.name}`}
            >
              <Image
                src={heroProduct.media[0].url}
                alt={heroProduct.media[0].alt}
                fill
                preload
                quality={80}
                sizes="(min-width: 768px) 55vw, 100vw"
                className="object-cover object-top"
              />
              <span className="store-hero-caption">
                <span>
                  The occasion edit
                  <br />
                  <strong>{heroProduct.name}</strong>
                </span>
                <span aria-hidden="true">↗</span>
              </span>
            </Link>
          ) : null}
        </section>
        <div className="store-service-strip">
          <Link href="/formal-wear">Thoughtful details</Link>
          <span aria-hidden="true">✦</span>
          <Link href="/mens-wear">Timeless silhouettes</Link>
          <span aria-hidden="true">✦</span>
          <Link href="/accessories">Finishing touches</Link>
        </div>
        <section className="store-section" id="categories">
          <div className="store-section-heading">
            <div>
              <p className="store-eyebrow">A LITTLE SOMETHING FOR YOU</p>
              <h2>Find your kind of beautiful.</h2>
            </div>
            <Link className="store-text-link" href="/shop">
              Explore all <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="store-category-grid">
            {categories.map((category) => (
              <Link
                className="store-category"
                href={`/${category.slug}`}
                key={category.id}
              >
                <div className="store-category-image">
                  {category.image ? (
                    <Image
                      alt={category.image.alt}
                      src={category.image.url}
                      fill
                      quality={75}
                      sizes="(min-width: 1280px) 400px, (min-width: 640px) 33vw, 80vw"
                      className="object-cover object-top"
                    />
                  ) : null}
                </div>
                <div className="store-category-caption">
                  <div>
                    <p>
                      {category.slug === "formal-wear"
                        ? "THE OCCASION EDIT"
                        : category.slug === "mens-wear"
                          ? "EVERYDAY, ELEVATED"
                          : "THE FINISHING TOUCH"}
                    </p>
                    <h3>{category.name}</h3>
                  </div>
                  <span aria-hidden="true">↗</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
        <section className="store-section" id="new-arrivals">
          <div className="store-section-heading">
            <div>
              <p className="store-eyebrow">JUST LANDED</p>
              <h2>New arrivals</h2>
            </div>
            <Link className="store-text-link" href="/shop?sort=NEWEST">
              Shop new in <span aria-hidden="true">↗</span>
            </Link>
          </div>
          {newArrivals.length ? (
            <div className="store-product-grid">
              {newArrivals.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-stone-400">
              Our next collection is on its way. Explore the current edit below.
            </p>
          )}
        </section>
        <section className="store-story">
          <p className="store-eyebrow">BAZM / A GATHERING</p>
          <h2>
            Some things never
            <br />
            go out of <em>feeling.</em>
          </h2>
          <p>
            The joy of dressing up. A familiar embrace. An evening that becomes
            a memory. We bring together pieces for the moments that bring us
            together.
          </p>
          <Link className="store-text-link" href="/about">
            Meet Bazm <span aria-hidden="true">↗</span>
          </Link>
        </section>
        {featured.length ? (
          <section className="store-section">
            <div className="store-section-heading">
              <div>
                <p className="store-eyebrow">THE BAZM EDIT</p>
                <h2>Worth a closer look.</h2>
              </div>
              <Link className="store-text-link" href="/shop">
                View all pieces <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <div className="store-product-grid">
              {featured.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        ) : null}
        <section className="store-care-strip" aria-label="Shopping help">
          <div>
            <span aria-hidden="true">↗</span>
            <h2>Delivered to your door</h2>
            <Link href="/shipping">Explore delivery options</Link>
          </div>
          <div>
            <span aria-hidden="true">↺</span>
            <h2>A little peace of mind</h2>
            <Link href="/returns">Our returns policy</Link>
          </div>
          <div>
            <span aria-hidden="true">♡</span>
            <h2>Here when you need us</h2>
            <Link href="/contact">Get in touch</Link>
          </div>
        </section>
      </main>
    </StoreShell>
  );
}
