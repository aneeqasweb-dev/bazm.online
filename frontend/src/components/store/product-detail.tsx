"use client";

import type {
  productVariantDocumentSchema,
  publicProductReadSchema,
} from "@bazm/domain";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useMemo, useState } from "react";

import { formatPkr } from "@/components/store/product-card";

const CartButton = dynamic(
  () =>
    import("@/components/store/cart-button").then(
      (module) => module.CartButton,
    ),
  {
    loading: () => (
      <button
        className="rounded-full bg-stone-700 px-5 py-3 font-semibold text-stone-300"
        disabled
        type="button"
      >
        Preparing cart…
      </button>
    ),
    ssr: false,
  },
);

const WishlistButton = dynamic(
  () =>
    import("@/components/store/wishlist-button").then(
      (module) => module.WishlistButton,
    ),
  {
    loading: () => (
      <button
        className="rounded-full border border-stone-700 px-5 py-3 font-semibold text-stone-400"
        disabled
        type="button"
      >
        Preparing wishlist…
      </button>
    ),
    ssr: false,
  },
);

type Product = ReturnType<typeof publicProductReadSchema.parse>;
type Variant = Pick<
  ReturnType<typeof productVariantDocumentSchema.parse>,
  | "productId"
  | "sku"
  | "color"
  | "size"
  | "priceOverride"
  | "media"
  | "isActive"
> & { id: string };

export function ProductDetail({
  product,
  variants,
}: {
  product: Product;
  variants: Variant[];
}) {
  const initial = variants.find((variant) => variant.isActive) ?? variants[0];
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const selected =
    variants.find((variant) => variant.id === selectedId) ?? initial;
  const colors = useMemo(
    () => [...new Set(variants.map((variant) => variant.color))],
    [variants],
  );
  const sizes = useMemo(
    () => [...new Set(variants.map((variant) => variant.size))],
    [variants],
  );
  const gallery = selected?.media.length ? selected.media : product.media;
  const [imagePath, setImagePath] = useState(gallery[0]?.path ?? "");
  const visibleImage =
    gallery.find((image) => image.path === imagePath) ?? gallery[0];
  const price = selected?.priceOverride ?? product.basePrice;
  const choose = (color: string, size: string) => {
    const candidate = variants.find(
      (variant) => variant.color === color && variant.size === size,
    );
    if (candidate) {
      setSelectedId(candidate.id);
      setImagePath((candidate.media[0] ?? product.media[0]).path);
    }
  };
  if (!selected || !visibleImage) return null;
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <section aria-label="Product images" className="grid gap-4">
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-stone-800">
          <Image
            alt={visibleImage.alt}
            className="object-cover"
            fill
            preload
            quality={80}
            sizes="(min-width: 1024px) 50vw, 100vw"
            src={visibleImage.url}
          />
        </div>
        {gallery.length > 1 ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {gallery.map((image) => (
              <button
                aria-pressed={image.path === visibleImage.path}
                className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-stone-700 aria-pressed:border-amber-300"
                key={image.path}
                onClick={() => setImagePath(image.path)}
                type="button"
              >
                <Image
                  alt={`View ${image.alt}`}
                  className="object-cover"
                  fill
                  quality={60}
                  sizes="80px"
                  src={image.url}
                />
              </button>
            ))}
          </div>
        ) : null}
      </section>
      <section>
        <p className="text-sm tracking-[0.2em] text-amber-300 uppercase">
          {product.brand}
        </p>
        <h1 className="mt-3 text-4xl font-semibold">{product.name}</h1>
        {product.ratingSummary.count ? (
          <p className="mt-3 text-sm text-stone-300">
            ★ {product.ratingSummary.average.toFixed(1)} from{" "}
            {product.ratingSummary.count} verified reviews
          </p>
        ) : (
          <p className="mt-3 text-sm text-stone-400">
            Reviews are coming soon.
          </p>
        )}
        <p className="mt-4 text-2xl text-amber-200">
          {formatPkr(price.amountMinor)}
        </p>
        <p className="mt-6 leading-7 text-stone-300">{product.description}</p>
        <fieldset className="mt-8">
          <legend className="font-medium">Color</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {colors.map((color) => {
              const selectable = variants.some(
                (variant) => variant.color === color && variant.isActive,
              );
              return (
                <button
                  aria-pressed={selected.color === color}
                  className="rounded-full border border-stone-700 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-amber-300"
                  disabled={!selectable}
                  key={color}
                  onClick={() =>
                    choose(
                      color,
                      variants.find(
                        (variant) =>
                          variant.color === color && variant.isActive,
                      )?.size ?? selected.size,
                    )
                  }
                  type="button"
                >
                  {color}
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="mt-6">
          <legend className="font-medium">Size</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {sizes.map((size) => {
              const variant = variants.find(
                (item) => item.color === selected.color && item.size === size,
              );
              return (
                <button
                  aria-pressed={selected.size === size}
                  className="rounded-full border border-stone-700 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-amber-300"
                  disabled={!variant?.isActive}
                  key={size}
                  onClick={() => choose(selected.color, size)}
                  type="button"
                >
                  {size}
                </button>
              );
            })}
          </div>
        </fieldset>
        <p aria-live="polite" className="mt-4 text-sm text-emerald-200">
          {selected.isActive
            ? `${selected.sku} is available to add when cart opens.`
            : "This combination is unavailable."}
        </p>
        <label
          className="mt-6 block w-28 text-sm text-stone-300"
          htmlFor="product-quantity"
        >
          Quantity
          <input
            className="field"
            disabled={!selected.isActive}
            id="product-quantity"
            max="999"
            min="1"
            onChange={(event) =>
              setQuantity(Math.max(1, Number(event.target.value) || 1))
            }
            type="number"
            value={quantity}
          />
        </label>
        <div className="mt-8 flex flex-wrap gap-3">
          <CartButton
            disabled={!selected.isActive}
            productId={product.id}
            quantity={quantity}
            variantId={selected.id}
          />
          <WishlistButton productId={product.id} />
        </div>
        <p className="mt-3 text-sm text-stone-400">
          Cart quantities are saved to your account. Checkout will re-check
          current stock and prices before payment.
        </p>
      </section>
    </div>
  );
}
