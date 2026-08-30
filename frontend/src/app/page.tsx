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
    "Discover contemporary fashion at Bazm: considered silhouettes, lasting textiles, and modern pieces for gatherings across Pakistan.",
  path: "/",
  title: "Bazm — Contemporary Fashion Pakistan",
});

export default async function Home() {
  const [categories, featured, newArrivals] = await Promise.all([
    listHomeCategories(),
    listHomeProducts({ kind: "FEATURED" }),
    listHomeProducts({ kind: "NEW" }),
  ]);
  return (
    <StoreShell>
      <JsonLd data={organizationJsonLd()} id="organization-json-ld" />
      <JsonLd data={websiteJsonLd()} id="website-json-ld" />
      <main className="px-5 py-16 sm:px-8 lg:py-24">
        <section className="mx-auto max-w-7xl rounded-[2rem] border border-stone-800 bg-gradient-to-br from-stone-900 to-stone-950 px-7 py-16 sm:px-14">
          <p className="text-sm font-medium tracking-[0.34em] text-amber-300 uppercase">
            Bazm · Pakistan
          </p>
          <h1 className="mt-6 max-w-4xl text-5xl leading-[0.98] font-semibold tracking-[-0.04em] sm:text-7xl">
            A new gathering of contemporary style.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-stone-300">
            Pieces chosen for the way life is actually lived—easy silhouettes,
            lasting textiles, and thoughtful detail.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-amber-300 px-6 py-3 font-semibold text-stone-950"
              href="/shop"
            >
              Shop the collection
            </Link>
            <Link
              className="rounded-full border border-stone-600 px-6 py-3 font-semibold"
              href="#categories"
            >
              Explore categories
            </Link>
          </div>
        </section>
        <section className="mx-auto mt-16 max-w-7xl" id="categories">
          <p className="text-sm tracking-[0.25em] text-amber-300 uppercase">
            Featured categories
          </p>
          <h2 className="mt-3 text-3xl font-semibold">
            Made for every gathering.
          </h2>
          {categories.length ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {categories.map((category) => (
                <Link
                  className="rounded-2xl border border-stone-800 bg-stone-900 p-6 transition hover:border-amber-300"
                  href={`/${category.slug}`}
                  key={category.id}
                >
                  <p className="text-sm text-amber-200">Collection</p>
                  <h3 className="mt-2 text-xl font-semibold">
                    {category.name}
                  </h3>
                  <p className="mt-3 text-sm text-stone-400">
                    Explore the edit →
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-6 rounded-2xl border border-dashed border-stone-700 p-6 text-stone-400">
              New collections will appear here as they are published.
            </p>
          )}
        </section>
        <section className="mx-auto mt-16 max-w-7xl">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm tracking-[0.25em] text-amber-300 uppercase">
                Trending now
              </p>
              <h2 className="mt-3 text-3xl font-semibold">Featured pieces</h2>
            </div>
            <Link
              className="text-sm text-amber-200 hover:text-amber-100"
              href="/shop"
            >
              View all →
            </Link>
          </div>
          {featured.length ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <p className="mt-6 rounded-2xl border border-dashed border-stone-700 p-6 text-stone-400">
              Featured pieces are being prepared.
            </p>
          )}
        </section>
        <section className="mx-auto mt-16 grid max-w-7xl gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <p className="text-sm tracking-[0.25em] text-amber-300 uppercase">
              New in
            </p>
            <h2 className="mt-3 text-3xl font-semibold">Fresh arrivals</h2>
            {newArrivals.length ? (
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {newArrivals.slice(0, 2).map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <p className="mt-6 rounded-2xl border border-dashed border-stone-700 p-6 text-stone-400">
                The next edit is almost here.
              </p>
            )}
          </div>
          <aside className="rounded-2xl border border-amber-300/40 bg-amber-300 p-7 text-stone-950">
            <p className="text-sm font-semibold tracking-[0.18em] uppercase">
              Bazm notes
            </p>
            <h2 className="mt-3 text-3xl font-semibold">First look, always.</h2>
            <p className="mt-4 leading-7">
              Get new collection notes and considered styling ideas. No noise.
            </p>
            <form className="mt-6">
              <label className="sr-only" htmlFor="newsletter-email">
                Email address
              </label>
              <input
                className="w-full rounded-xl bg-stone-950 px-4 py-3 text-stone-50"
                id="newsletter-email"
                name="email"
                placeholder="you@example.com"
                type="email"
              />
              <button
                className="mt-3 rounded-full bg-stone-950 px-5 py-3 font-semibold text-stone-50"
                type="button"
              >
                Newsletter coming soon
              </button>
            </form>
          </aside>
        </section>
      </main>
    </StoreShell>
  );
}
