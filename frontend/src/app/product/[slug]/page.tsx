import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FirebaseBrowserIntegrations } from "@/components/providers/firebase-browser-integrations";
import { JsonLd } from "@/components/seo/json-ld";
import { ProductCard } from "@/components/store/product-card";
import { ProductDetail } from "@/components/store/product-detail";
import { ProductReviews } from "@/components/store/product-reviews";
import { StoreShell } from "@/components/store/store-shell";
import { listRelatedProducts } from "@/lib/catalog/server";
import { getActiveCategoryBreadcrumbsByIds } from "@/lib/categories/server";
import { publicMetadata } from "@/lib/seo/config";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo/structured-data";
import {
  getPublishedProductBySlug,
  listPublishedProductReviews,
} from "@/lib/storefront/server";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reviewsAfter?: string | string[] }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: ProductPageProps): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const result = await getPublishedProductBySlug(slug);
  return result
    ? publicMetadata({
        description:
          result.product.seo.description ?? result.product.description,
        images: result.product.media.slice(0, 1).map((image) => ({
          alt: image.alt,
          height: image.height,
          url: image.url,
          width: image.width,
        })),
        noIndex: typeof query.reviewsAfter === "string",
        path: `/product/${result.product.slug}`,
        title: result.product.seo.title ?? result.product.name,
      })
    : { title: "Product not found" };
}

export default async function ProductPage({
  params,
  searchParams,
}: ProductPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const result = await getPublishedProductBySlug(slug);
  if (!result) notFound();
  const reviewsAfter =
    typeof query.reviewsAfter === "string" ? query.reviewsAfter : null;
  const [related, reviews, breadcrumbs] = await Promise.all([
    listRelatedProducts({
      categoryId: result.product.categoryId,
      productId: result.product.id,
    }),
    listPublishedProductReviews({
      productId: result.product.id,
      after: reviewsAfter,
    }),
    getActiveCategoryBreadcrumbsByIds(result.product.categoryPath),
  ]);
  const breadcrumbItems = [
    { name: "Bazm", path: "/" },
    ...breadcrumbs.map((crumb, index) => ({
      name: crumb.name,
      path: `/${breadcrumbs
        .slice(0, index + 1)
        .map((item) => item.slug)
        .join("/")}`,
    })),
    { name: result.product.name, path: `/product/${result.product.slug}` },
  ];
  return (
    <StoreShell>
      <FirebaseBrowserIntegrations />
      <JsonLd
        data={productJsonLd(result.product, result.variants)}
        id="product-json-ld"
      />
      <JsonLd
        data={breadcrumbJsonLd(breadcrumbItems)}
        id="product-breadcrumb-json-ld"
      />
      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-sm text-stone-400">
          <ol className="flex flex-wrap gap-2">
            {breadcrumbItems.map((item, index) => (
              <li className="flex gap-2" key={item.path}>
                {index ? <span aria-hidden="true">/</span> : null}
                {index === breadcrumbItems.length - 1 ? (
                  <span className="text-stone-200">{item.name}</span>
                ) : (
                  <Link className="hover:text-amber-300" href={item.path}>
                    {item.name}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <Link
          className="mt-5 inline-flex text-sm text-stone-400 hover:text-amber-300"
          href="/shop"
        >
          ← Back to shop
        </Link>
        <div className="mt-8">
          <ProductDetail product={result.product} variants={result.variants} />
        </div>
        <ProductReviews
          nextCursor={reviews.nextCursor}
          productSlug={result.product.slug}
          reviews={reviews.items}
        />
        <section aria-labelledby="related-products" className="mt-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm tracking-[0.25em] text-amber-300 uppercase">
                Continue the edit
              </p>
              <h2 className="mt-3 text-3xl font-semibold" id="related-products">
                Related pieces
              </h2>
            </div>
            <Link
              className="text-sm text-amber-200 hover:text-amber-100"
              href="/shop"
            >
              View all →
            </Link>
          </div>
          {related.length ? (
            <div className="store-product-grid mt-6">
              {related.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-stone-400">
              More pieces from this collection will appear here soon.
            </p>
          )}
        </section>
      </main>
    </StoreShell>
  );
}
