import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/seo/json-ld";
import { ProductCard } from "@/components/store/product-card";
import { StoreShell } from "@/components/store/store-shell";
import {
  getActiveCategoryPath,
  listActiveCategoryChildren,
  listPublishedProductsForCategory,
} from "@/lib/categories/server";
import { publicMetadata } from "@/lib/seo/config";
import { breadcrumbJsonLd } from "@/lib/seo/structured-data";

type CategoryPageProps = {
  params: Promise<{ categoryPath: string[] }>;
  searchParams: Promise<{ cursor?: string | string[] }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: CategoryPageProps): Promise<Metadata> {
  const { categoryPath } = await params;
  const result = await getActiveCategoryPath(categoryPath);
  if (!result) return { title: "Category not found | Bazm" };
  const { category } = result;
  return publicMetadata({
    description:
      category.seo.description ??
      `Explore ${category.name} and related contemporary fashion pieces at Bazm.`,
    images: category.image
      ? [
          {
            alt: category.image.alt,
            height: category.image.height,
            url: category.image.url,
            width: category.image.width,
          },
        ]
      : undefined,
    noIndex: typeof (await searchParams).cursor === "string",
    path: `/${categoryPath.join("/")}`,
    title: category.seo.title ?? `${category.name} collection`,
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const [{ categoryPath }, query] = await Promise.all([params, searchParams]);
  const result = await getActiveCategoryPath(categoryPath);
  if (!result) notFound();
  const cursor = typeof query.cursor === "string" ? query.cursor : null;
  const [children, products] = await Promise.all([
    listActiveCategoryChildren(result.category.id),
    listPublishedProductsForCategory(result.category.id, { limit: 24, cursor }),
  ]);
  const breadcrumbItems = [
    { name: "Bazm", path: "/" },
    ...result.breadcrumbs.map((crumb, index) => ({
      name: crumb.name,
      path: `/${result.breadcrumbs
        .slice(0, index + 1)
        .map((item) => item.slug)
        .join("/")}`,
    })),
  ];

  return (
    <StoreShell>
      <JsonLd
        data={breadcrumbJsonLd(breadcrumbItems)}
        id="category-breadcrumb-json-ld"
      />
      <main className="px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <nav aria-label="Breadcrumb" className="text-sm text-stone-400">
            <ol className="flex flex-wrap gap-2">
              <li>
                <Link className="hover:text-amber-300" href="/">
                  Bazm
                </Link>
              </li>
              {result.breadcrumbs.map((crumb, index) => (
                <li className="flex gap-2" key={crumb.id}>
                  <span aria-hidden="true">/</span>
                  {index === result.breadcrumbs.length - 1 ? (
                    <span className="text-stone-200">{crumb.name}</span>
                  ) : (
                    <Link
                      className="hover:text-amber-300"
                      href={`/${result.breadcrumbs
                        .slice(0, index + 1)
                        .map((item) => item.slug)
                        .join("/")}`}
                    >
                      {crumb.name}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <header className="store-catalog-header mt-8">
            <p className="text-sm tracking-[0.28em] text-amber-300 uppercase">
              Bazm collection
            </p>
            <h1 className="mt-3 text-4xl">{result.category.name}</h1>
            <p className="mt-4 leading-7 text-stone-400">
              {result.category.seo.description ??
                "Beautiful pieces, thoughtful details. Discover your next favourite from the collection."}
            </p>
          </header>
          {children.length ? (
            <section className="mt-10" aria-labelledby="child-categories">
              <h2 className="text-xl font-semibold" id="child-categories">
                Explore {result.category.name}
              </h2>
              <div className="store-product-grid mt-6">
                {children.map((child) => (
                  <Link
                    className="rounded-2xl border border-stone-800 bg-stone-900 p-5 transition hover:border-amber-300"
                    href={`/${[...categoryPath, child.slug].join("/")}`}
                    key={child.id}
                  >
                    <h3 className="font-semibold">{child.name}</h3>
                    <p className="mt-2 text-sm text-stone-400">
                      View collection →
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
          <section className="mt-12" aria-labelledby="category-products">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold" id="category-products">
                Available now
              </h2>
              <p className="text-sm text-stone-400">
                {products.items.length} shown
              </p>
            </div>
            {products.items.length ? (
              <div className="store-product-grid mt-6">
                {products.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-stone-700 p-6 text-stone-400">
                There are no published products in this category yet.
              </p>
            )}
            {products.nextCursor ? (
              <Link
                className="mt-6 inline-flex rounded-full border border-stone-700 px-5 py-3 text-sm hover:border-amber-300"
                href={`/${categoryPath.join("/")}?cursor=${encodeURIComponent(products.nextCursor)}`}
              >
                Load more products
              </Link>
            ) : null}
          </section>
        </div>
      </main>
    </StoreShell>
  );
}
