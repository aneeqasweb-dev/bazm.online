import type {
  productVariantDocumentSchema,
  publicProductReadSchema,
} from "@bazm/domain";

import { absoluteUrl, getSiteUrl, SITE_NAME } from "@/lib/seo/config";

type Product = ReturnType<typeof publicProductReadSchema.parse>;
type Variant = Pick<
  ReturnType<typeof productVariantDocumentSchema.parse>,
  "color" | "isActive" | "priceOverride" | "size" | "sku"
> & { id: string };

export type BreadcrumbItem = {
  name: string;
  path: string;
};

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@id": `${getSiteUrl()}#organization`,
    "@type": "Organization",
    name: SITE_NAME,
    url: getSiteUrl(),
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@id": `${getSiteUrl()}#website`,
    "@type": "WebSite",
    inLanguage: "en-PK",
    name: SITE_NAME,
    potentialAction: {
      "@type": "SearchAction",
      "query-input": "required name=search_term_string",
      target: `${absoluteUrl("/shop")}?q={search_term_string}`,
    },
    publisher: { "@id": `${getSiteUrl()}#organization` },
    url: getSiteUrl(),
  };
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      item: absoluteUrl(item.path),
      name: item.name,
      position: index + 1,
    })),
  };
}

export function productJsonLd(product: Product, variants: Variant[]) {
  const activeVariant = variants.find((variant) => variant.isActive);
  const displayVariant = activeVariant ?? variants[0];
  const price = displayVariant?.priceOverride ?? product.basePrice;

  return {
    "@context": "https://schema.org",
    "@id": `${absoluteUrl(`/product/${product.slug}`)}#product`,
    "@type": "Product",
    aggregateRating: product.ratingSummary.count
      ? {
          "@type": "AggregateRating",
          ratingCount: product.ratingSummary.count,
          ratingValue: product.ratingSummary.average.toFixed(1),
          reviewCount: product.ratingSummary.count,
        }
      : undefined,
    brand: { "@type": "Brand", name: product.brand },
    description: product.description,
    image: product.media.map((image) => image.url),
    name: product.name,
    offers: {
      "@type": "Offer",
      availability: activeVariant
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      price: (price.amountMinor / 100).toFixed(2),
      priceCurrency: price.currency,
      url: absoluteUrl(`/product/${product.slug}`),
    },
    sku: displayVariant?.sku,
    url: absoluteUrl(`/product/${product.slug}`),
  };
}
