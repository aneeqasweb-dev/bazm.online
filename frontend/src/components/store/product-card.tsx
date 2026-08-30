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
    <article className="group overflow-hidden rounded-2xl border border-stone-800 bg-stone-900">
      <Link
        aria-label={`View ${product.name}`}
        className="block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300"
        href={`/product/${product.slug}`}
      >
        <div className="relative aspect-[3/4] bg-stone-800">
          <Image
            alt={image.alt}
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
            fill
            quality={70}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            src={image.url}
          />
          {product.flags.newArrival ? (
            <span className="absolute top-3 left-3 rounded-full bg-stone-950/85 px-3 py-1 text-xs font-medium text-amber-200">
              New arrival
            </span>
          ) : null}
        </div>
        <div className="p-4">
          <p className="text-xs tracking-[0.16em] text-stone-400 uppercase">
            {product.brand}
          </p>
          <h3 className="mt-1 font-semibold">{product.name}</h3>
          <p className="mt-2 text-amber-200">
            {formatPkr(product.basePrice.amountMinor)}
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-stone-400">
            <span>{product.tags.slice(0, 2).join(" · ")}</span>
            {product.hasAvailableVariant === false ? (
              <span className="text-rose-200">Unavailable</span>
            ) : (
              <span className="text-emerald-200">Available</span>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
