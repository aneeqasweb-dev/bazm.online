import type { Metadata } from "next";
import Link from "next/link";

import { ProductCard } from "@/components/store/product-card";
import { StoreShell } from "@/components/store/store-shell";
import { listShopProducts, type CatalogFilters } from "@/lib/catalog/server";
import { listProductCategories } from "@/lib/products/server";
import { publicMetadata } from "@/lib/seo/config";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function value(params: SearchParams, key: string) {
  const result = params[key];
  return typeof result === "string" ? result.slice(0, 80) : "";
}

function money(value: string) {
  if (!value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0
    ? Math.round(amount * 100)
    : null;
}

function catalogFilters(params: SearchParams): CatalogFilters {
  const sort = value(params, "sort");
  const rating = Number(value(params, "rating"));
  return {
    query: value(params, "q"),
    categoryId: value(params, "category") || null,
    brand: value(params, "brand"),
    color: value(params, "color"),
    size: value(params, "size"),
    availability:
      value(params, "availability") === "AVAILABLE" ? "AVAILABLE" : "ALL",
    rating: [1, 2, 3, 4, 5].includes(rating) ? rating : null,
    minPrice: money(value(params, "minPrice")),
    maxPrice: money(value(params, "maxPrice")),
    sort: sort === "PRICE_DESC" || sort === "NEWEST" ? sort : "PRICE_ASC",
  };
}

function hasSeoDuplicateParams(params: SearchParams) {
  return [
    "availability",
    "brand",
    "category",
    "color",
    "cursor",
    "maxPrice",
    "minPrice",
    "q",
    "rating",
    "size",
    "sort",
  ].some((key) => Boolean(value(params, key)));
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const filters = catalogFilters(params);
  const queryTitle = filters.query ? `Search “${filters.query}”` : "Shop";
  return publicMetadata({
    description: filters.query
      ? `Browse Bazm products matching ${filters.query}. Filter by category, color, size, availability, rating, and price.`
      : "Browse all published Bazm pieces and filter by category, color, size, availability, rating, and price.",
    noIndex: hasSeoDuplicateParams(params),
    path: "/shop",
    title: `${queryTitle} contemporary fashion`,
  });
}

function nextPageHref(filters: CatalogFilters, cursor: string) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.color) params.set("color", filters.color);
  if (filters.size) params.set("size", filters.size);
  if (filters.availability !== "ALL")
    params.set("availability", filters.availability);
  if (filters.rating !== null) params.set("rating", String(filters.rating));
  if (filters.minPrice !== null)
    params.set("minPrice", String(filters.minPrice / 100));
  if (filters.maxPrice !== null)
    params.set("maxPrice", String(filters.maxPrice / 100));
  if (filters.sort !== "PRICE_ASC") params.set("sort", filters.sort);
  params.set("cursor", cursor);
  return `/shop?${params.toString()}`;
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = catalogFilters(params);
  const cursor = value(params, "cursor") || null;
  const [result, categories] = await Promise.all([
    listShopProducts({ cursor, filters }),
    listProductCategories(),
  ]);
  return (
    <StoreShell>
      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <header>
          <p className="text-sm tracking-[0.28em] text-amber-300 uppercase">
            The collection
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Shop Bazm</h1>
          <p className="mt-3 max-w-2xl text-stone-400">
            Search uses normalized product names, brands, and tags. Every result
            page examines at most 96 published products before it gives you a
            stable next page.
          </p>
        </header>
        <form
          action="/shop"
          className="mt-8 grid gap-3 rounded-2xl border border-stone-800 bg-stone-900 p-4 md:grid-cols-4"
        >
          <label className="text-sm text-stone-300" htmlFor="catalog-query">
            Search
            <input
              className="field"
              defaultValue={filters.query}
              id="catalog-query"
              name="q"
              placeholder="Linen, shirt, bazm…"
            />
          </label>
          <label className="text-sm text-stone-300" htmlFor="catalog-category">
            Category
            <select
              className="field"
              defaultValue={filters.categoryId ?? ""}
              id="catalog-category"
              name="category"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {"— ".repeat(category.depth)}
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-stone-300" htmlFor="catalog-brand">
            Brand
            <input
              className="field"
              defaultValue={filters.brand}
              id="catalog-brand"
              name="brand"
              placeholder="Bazm"
            />
          </label>
          <label className="text-sm text-stone-300" htmlFor="catalog-sort">
            Sort
            <select
              className="field"
              defaultValue={filters.sort}
              id="catalog-sort"
              name="sort"
            >
              <option value="PRICE_ASC">Price: low to high</option>
              <option value="PRICE_DESC">Price: high to low</option>
              <option value="NEWEST">Newest</option>
            </select>
          </label>
          <label className="text-sm text-stone-300" htmlFor="catalog-color">
            Color
            <input
              className="field"
              defaultValue={filters.color}
              id="catalog-color"
              name="color"
              placeholder="Black"
            />
          </label>
          <label className="text-sm text-stone-300" htmlFor="catalog-size">
            Size
            <input
              className="field"
              defaultValue={filters.size}
              id="catalog-size"
              name="size"
              placeholder="M"
            />
          </label>
          <label className="text-sm text-stone-300" htmlFor="catalog-min-price">
            Minimum price (PKR)
            <input
              className="field"
              defaultValue={
                filters.minPrice ? String(filters.minPrice / 100) : ""
              }
              id="catalog-min-price"
              inputMode="numeric"
              min="0"
              name="minPrice"
              type="number"
            />
          </label>
          <label className="text-sm text-stone-300" htmlFor="catalog-max-price">
            Maximum price (PKR)
            <input
              className="field"
              defaultValue={
                filters.maxPrice ? String(filters.maxPrice / 100) : ""
              }
              id="catalog-max-price"
              inputMode="numeric"
              min="0"
              name="maxPrice"
              type="number"
            />
          </label>
          <label
            className="text-sm text-stone-300"
            htmlFor="catalog-availability"
          >
            Availability
            <select
              className="field"
              defaultValue={filters.availability}
              id="catalog-availability"
              name="availability"
            >
              <option value="ALL">All products</option>
              <option value="AVAILABLE">Available now</option>
            </select>
          </label>
          <label className="text-sm text-stone-300" htmlFor="catalog-rating">
            Rating
            <select
              className="field"
              defaultValue={filters.rating ?? ""}
              id="catalog-rating"
              name="rating"
            >
              <option value="">Any rating</option>
              <option value="4">4 stars and up</option>
              <option value="3">3 stars and up</option>
            </select>
          </label>
          <div className="flex items-end gap-3 md:col-span-2">
            <button
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950"
              type="submit"
            >
              Apply filters
            </button>
            <Link
              className="rounded-full border border-stone-700 px-5 py-3 text-sm font-semibold hover:border-amber-300"
              href="/shop"
            >
              Clear
            </Link>
          </div>
        </form>
        <p className="mt-8 text-sm text-stone-400">
          {result.products.length} results on this page · {result.scanned}{" "}
          products scanned safely.
        </p>
        {result.products.length ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {result.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="mt-8 rounded-2xl border border-dashed border-stone-700 p-8 text-stone-400">
            No published products match this part of the collection. Adjust the
            filters or continue to the next bounded page.
          </p>
        )}
        {result.nextCursor ? (
          <Link
            className="mt-8 inline-flex rounded-full border border-stone-700 px-5 py-3 text-sm font-semibold hover:border-amber-300"
            href={nextPageHref(filters, result.nextCursor)}
          >
            Next products
          </Link>
        ) : null}
      </main>
    </StoreShell>
  );
}
