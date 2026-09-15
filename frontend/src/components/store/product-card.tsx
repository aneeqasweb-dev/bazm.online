import type { publicProductReadSchema } from "@bazm/domain";
import Image from "next/image";
import Link from "next/link";

type ProductCardProduct = ReturnType<typeof publicProductReadSchema.parse> & {
  hasAvailableVariant?: boolean;
};

export function formatPkr(amountMinor: number) {
  return `PKR ${(amountMinor / 100).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
  })}`;
}

export function ProductCard({ product }: { product: ProductCardProduct }) {
  const image = product.media[0];
  return (
    <article className="product-card group">
      <Link
        aria-label={`View ${product.name}`}
        className="block"
        href={`/product/${product.slug}`}
      >
        <div className="product-card-image relative aspect-[3/4] overflow-hidden bg-stone-800">
          <Image
            alt={image.alt}
            className="object-cover transition duration-500 group-hover:scale-[1.035] motion-reduce:transition-none"
            fill
            quality={70}
            sizes="(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            src={image.url}
          />
          {product.flags.newArrival ? (
            <span className="product-card-badge">New</span>
          ) : null}
          <span className="product-card-view">
            Discover this piece <span aria-hidden="true">↗</span>
          </span>
        </div>
        <div className="product-card-info">
          <p className="product-card-label">
            {product.tags.slice(0, 2).join(" · ") || product.brand}
          </p>
          <h3>{product.name}</h3>
          <p className="product-card-price">
            {formatPkr(product.basePrice.amountMinor)}
          </p>
          {product.hasAvailableVariant === false ? (
            <p className="mt-2 text-xs text-rose-200">Currently unavailable</p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
