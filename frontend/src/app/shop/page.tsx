import type { Metadata } from "next";
import Link from "next/link";

import { ProductCard } from "@/components/store/product-card";
import { StoreShell } from "@/components/store/store-shell";
import { listShopProducts, type CatalogFilters } from "@/lib/catalog/server";
import { listProductCategories } from "@/lib/products/server";
import { publicMetadata } from "@/lib/seo/config";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function value(params: SearchParams, key: string, maxLength = 80) {
  const result = params[key];
  return typeof result === "string" ? result.slice(0, maxLength) : "";
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
  const cursor = value(params, "cursor", 2048) || null;
  const [result, categories] = await Promise.all([
    listShopProducts({ cursor, filters }),
    listProductCategories(),
  ]);
  return (
    <StoreShell>
      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <header className="store-catalog-header">
          <p className="store-eyebrow">THE COLLECTION</p>
          <h1>Shop Bazm</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-stone-400">
            From everyday favourites to occasion pieces. Find something
            beautiful for your next gathering.
          </p>
        </header>
        <form action="/shop" className="store-filter-panel">
          <div className="store-filter-main">
            <label className="text-xs text-stone-300" htmlFor="catalog-query">
              Search the collection
              <input
                className="field"
                defaultValue={filters.query}
                id="catalog-query"
                name="q"
                placeholder="Try kurta, ivory, embroidered…"
              />
            </label>
            <label
              className="text-xs text-stone-300"
              htmlFor="catalog-category"
            >
              Category
              <select
                className="field"
                defaultValue={filters.categoryId ?? ""}
                id="catalog-category"
                name="category"
              >
                <option value="">All collections</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {"— ".repeat(category.depth)}
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-stone-300" htmlFor="catalog-sort">
              Sort by
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
            <div className="flex items-center gap-4">
              <button
                className="bg-amber-300 px-5 py-3 text-xs font-medium text-stone-950"
                type="submit"
              >
                Apply filters
              </button>
              <Link
                className="text-xs underline underline-offset-4"
                href="/shop"
              >
                Clear
              </Link>
            </div>
          </div>
          <details
            className="store-filter-extra"
            open={Boolean(
              filters.brand ||
              filters.color ||
              filters.size ||
              filters.minPrice !== null ||
              filters.maxPrice !== null ||
              filters.rating !== null ||
              filters.availability !== "ALL",
            )}
          >
            <summary>More filters · size, colour & price</summary>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <label className="text-xs text-stone-300" htmlFor="catalog-brand">
                Brand
                <input
                  className="field"
                  defaultValue={filters.brand}
                  id="catalog-brand"
                  name="brand"
                  placeholder="Bazm"
                />
              </label>
              <label className="text-xs text-stone-300" htmlFor="catalog-color">
                Color
                <input
                  className="field"
                  defaultValue={filters.color}
                  id="catalog-color"
                  name="color"
                  placeholder="Ivory"
                />
              </label>
              <label className="text-xs text-stone-300" htmlFor="catalog-size">
                Size
                <input
                  className="field"
                  defaultValue={filters.size}
                  id="catalog-size"
                  name="size"
                  placeholder="Medium"
                />
              </label>
              <label
                className="text-xs text-stone-300"
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
              <label
                className="text-xs text-stone-300"
                htmlFor="catalog-min-price"
              >
                Minimum price (PKR)
                <input
                  className="field"
                  defaultValue={
                    filters.minPrice === null
                      ? ""
                      : String(filters.minPrice / 100)
                  }
                  id="catalog-min-price"
                  name="minPrice"
                  type="number"
                  inputMode="numeric"
                  min="0"
                />
              </label>
              <label
                className="text-xs text-stone-300"
                htmlFor="catalog-max-price"
              >
                Maximum price (PKR)
                <input
                  className="field"
                  defaultValue={
                    filters.maxPrice === null
                      ? ""
                      : String(filters.maxPrice / 100)
                  }
                  id="catalog-max-price"
                  name="maxPrice"
                  type="number"
                  inputMode="numeric"
                  min="0"
                />
              </label>
              <label
                className="text-xs text-stone-300"
                htmlFor="catalog-rating"
              >
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
            </div>
          </details>
        </form>
        <p className="mt-8 mb-6 text-xs text-stone-400" role="status">
          {result.products.length}{" "}
          {result.products.length === 1 ? "piece" : "pieces"}
          {filters.query ? ` matching “${filters.query}”` : " to discover"}
          {result.nextCursor ? " on this page" : ""}
        </p>
        {result.products.length ? (
          <div className="store-product-grid">
            {result.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="mt-8 rounded-2xl border border-dashed border-stone-700 p-8 text-stone-400">
            No pieces match these filters. Try another colour, size or search
            term.
          </p>
        )}
        {result.nextCursor ? (
          <Link
            className="mt-8 inline-flex rounded-full border border-stone-700 px-5 py-3 text-sm font-semibold hover:border-amber-300"
            href={nextPageHref(filters, result.nextCursor)}
          >
            Discover more
          </Link>
        ) : null}
      </main>
    </StoreShell>
  );
}
