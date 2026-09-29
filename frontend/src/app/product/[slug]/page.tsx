import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FirebaseBrowserIntegrations } from "@/components/providers/firebase-browser-integrations";
import { JsonLd } from "@/components/seo/json-ld";
import { ProductCard } from "@/components/store/product-card";
import { ProductDetail } from "@/components/store/product-detail";
import { ProductReviews } from "@/components/store/product-reviews";
import reviewStyles from "@/components/store/product-reviews.module.css";
import { StoreShell } from "@/components/store/store-shell";
import { listRelatedProducts } from "@/lib/catalog/server";
import { getActiveCategoryBreadcrumbsByIds } from "@/lib/categories/server";
import { publicMetadata } from "@/lib/seo/config";
import { getAuthorizedSession } from "@/lib/auth/server-session";
import { parseReviewSort } from "@/lib/reviews/presentation";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo/structured-data";
import {
  getPublishedProductBySlug,
  getPublishedProductReviewSummary,
  listPublishedProductReviews,
} from "@/lib/storefront/server";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    reviewsAfter?: string | string[];
    reviewSort?: string | string[];
    reviewTab?: string | string[];
  }>;
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
        noIndex:
          typeof query.reviewsAfter === "string" ||
          typeof query.reviewSort === "string" ||
          typeof query.reviewTab === "string",
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
  const sort = parseReviewSort(query.reviewSort);
  const [related, reviews, breadcrumbs, summary, session] = await Promise.all([
    listRelatedProducts({
      categoryId: result.product.categoryId,
      productId: result.product.id,
    }),
    listPublishedProductReviews({
      productId: result.product.id,
      after: reviewsAfter,
      sort,
    }),
    getActiveCategoryBreadcrumbsByIds(result.product.categoryPath),
    getPublishedProductReviewSummary(result.product.id),
    getAuthorizedSession({ requireVerified: true }),
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
      <main className="w-full py-12">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
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
        </div>
        <div className="mt-8">
          <ProductDetail product={result.product} variants={result.variants} />
        </div>
        <ProductReviews
          nextCursor={reviews.nextCursor}
          productSlug={result.product.slug}
          productName={result.product.name}
          reviews={reviews.items}
          summary={summary}
          sort={sort}
          hasPrevious={Boolean(reviewsAfter)}
          access={
            session.claims && !session.reason
              ? "customer"
              : session.reason === "unverified"
                ? "unverified"
                : "guest"
          }
          initialTab={query.reviewTab === "questions" ? "questions" : "reviews"}
        />
        <section
          aria-labelledby="related-products"
          className={reviewStyles.related}
        >
          <div className={reviewStyles.relatedInner}>
            <h2 className={reviewStyles.relatedHeading} id="related-products">
              Related products
            </h2>
            <Link className={reviewStyles.relatedLink} href="/shop">
              View all →
            </Link>
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
          </div>
        </section>
      </main>
    </StoreShell>
  );
}
