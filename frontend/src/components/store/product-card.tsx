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
        <div className="product-card-image relative overflow-hidden bg-stone-800">
          <Image
            alt={image.alt}
            className="object-cover transition duration-500 group-hover:scale-[1.035] motion-reduce:transition-none"
            fill
            quality={70}
            sizes="(min-width: 1360px) 307px, (min-width: 1024px) 24vw, (min-width: 768px) 31vw, 48vw"
            src={image.url}
          />
          {product.flags.newArrival ? (
            <span className="product-card-badge">New arrival</span>
          ) : null}
        </div>
        <div className="product-card-info">
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
