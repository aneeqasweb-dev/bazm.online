"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import type {
  AdminProduct,
  ProductCategoryOption,
} from "@/lib/products/server";
import { callCommand } from "@/lib/commands/client";
import { uploadProductMedia } from "@/lib/products/media-client";

export type ProductWorkspaceProduct = Pick<
  AdminProduct,
  "basePrice" | "categoryPath" | "id" | "media" | "name" | "slug" | "status"
>;

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The product could not be saved.";
}

export function ProductWorkspace({
  categories,
  products,
}: {
  categories: ProductCategoryOption[];
  products: ProductWorkspaceProduct[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<
    "ALL" | ProductWorkspaceProduct["status"]
  >("ALL");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [selectedProductId, setSelectedProductId] = useState<string>();
  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          (status === "ALL" || product.status === status) &&
          `${product.name} ${product.slug}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [products, search, status],
  );

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const file = form.get("image");
    try {
      if (!(file instanceof File) || !file.size)
        throw new Error("Select a primary product image.");
      const image = await uploadProductMedia(
        file,
        String(form.get("imageAlt") ?? ""),
      );
      const result = await callCommand<{ id: string }>("createProduct", {
        name: form.get("name"),
        slug: form.get("slug"),
        description: form.get("description"),
        categoryId: form.get("categoryId"),
        brand: form.get("brand") || "Bazm",
        basePrice: {
          amountMinor: Math.round(Number(form.get("price")) * 100),
          currency: "PKR",
        },
        media: [image],
        tags: String(form.get("tags") ?? "")
          .split(",")
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean),
        flags: {
          featured: form.get("featured") === "on",
          newArrival: form.get("newArrival") === "on",
        },
        seo: {
          title: String(form.get("seoTitle") ?? "") || null,
          description: String(form.get("seoDescription") ?? "") || null,
        },
      });
      const id = result.id;
      setSelectedProductId(id);
      setMessage("Draft created. Add a variant, then publish when ready.");
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function addVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    try {
      await callCommand("createProductVariant", {
        productId: form.get("productId"),
        variant: {
          sku: form.get("sku"),
          color: form.get("color"),
          size: form.get("size"),
          priceOverride: null,
          media: [],
        },
      });
      setMessage("Variant added. You can now publish the product.");
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function setProductStatus(
    id: string,
    nextStatus: ProductWorkspaceProduct["status"],
  ) {
    if (
      nextStatus === "ARCHIVED" &&
      !window.confirm(
        "Archive this product? It will disappear from the public catalog.",
      )
    ) {
      return;
    }
    setPending(true);
    setMessage(undefined);
    try {
      await callCommand("setProductStatus", { id, status: nextStatus });
      setMessage(`Product ${nextStatus.toLowerCase()}.`);
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <section className="rounded-3xl border border-stone-800 bg-stone-900 p-5 sm:p-7">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.22em] text-amber-300 uppercase">
              Catalog inventory
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Products</h2>
          </div>
          <div className="flex gap-2">
            <input
              aria-label="Search products"
              className="field mt-0 w-44"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              value={search}
            />
            <select
              aria-label="Filter product status"
              className="field mt-0"
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
              value={status}
            >
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </div>
        <p className="mt-3 text-sm text-stone-400">
          Showing {filtered.length} of the latest 100 products.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[610px] text-left text-sm">
            <thead className="border-b border-stone-800 text-xs tracking-[0.16em] text-stone-500 uppercase">
              <tr>
                <th className="pb-3">Product</th>
                <th className="pb-3">Category</th>
                <th className="pb-3">Price</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr className="border-b border-stone-800/80" key={product.id}>
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <Image
                        alt={product.media[0].alt}
                        className="size-11 rounded-lg border border-stone-700 object-cover"
                        height={44}
                        quality={70}
                        src={product.media[0].url}
                        width={44}
                      />
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-stone-500">
                          /{product.slug}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 text-stone-300">
                    {product.categoryPath.at(-1)}
                  </td>
                  <td className="py-4">
                    PKR{" "}
                    {(product.basePrice.amountMinor / 100).toLocaleString(
                      "en-PK",
                      { minimumFractionDigits: 2 },
                    )}
                  </td>
                  <td className="py-4">{product.status.toLowerCase()}</td>
                  <td className="py-4 text-right">
                    {product.status !== "PUBLISHED" &&
                    product.status !== "ARCHIVED" ? (
                      <button
                        className="rounded-full border border-emerald-800 px-3 py-1.5 text-xs text-emerald-200"
                        disabled={pending}
                        onClick={() =>
                          setProductStatus(product.id, "PUBLISHED")
                        }
                        type="button"
                      >
                        Publish
                      </button>
                    ) : null}
                    {product.status !== "ARCHIVED" ? (
                      <button
                        className="ml-2 rounded-full border border-amber-900 px-3 py-1.5 text-xs text-amber-200"
                        disabled={pending}
                        onClick={() => setProductStatus(product.id, "ARCHIVED")}
                        type="button"
                      >
                        Archive
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-stone-400" colSpan={5}>
                    No matching products.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <aside className="space-y-8">
        <section className="rounded-3xl border border-stone-800 bg-stone-900 p-5 sm:p-7">
          <p className="text-xs tracking-[0.22em] text-amber-300 uppercase">
            New product
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Create a draft</h2>
          <form className="mt-5 space-y-3" onSubmit={createProduct}>
            <input
              className="field"
              name="name"
              placeholder="Product name"
              required
            />
            <input
              className="field"
              name="slug"
              placeholder="product-slug"
              required
            />
            <textarea
              className="field min-h-28"
              name="description"
              placeholder="Product description"
              required
            />
            <select className="field" name="categoryId" required>
              <option value="">Choose an active category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {"— ".repeat(category.depth)}
                  {category.name}
                </option>
              ))}
            </select>
            <input
              className="field"
              name="brand"
              placeholder="Brand (defaults to Bazm)"
            />
            <input
              className="field"
              min="0.01"
              name="price"
              placeholder="Price (PKR)"
              step="0.01"
              type="number"
              required
            />
            <input
              className="field"
              name="tags"
              placeholder="Tags, comma separated"
            />
            <input
              accept="image/jpeg,image/png,image/webp"
              className="field"
              name="image"
              type="file"
              required
            />
            <input
              className="field"
              name="imageAlt"
              placeholder="Image alt text"
              required
            />
            <label className="flex gap-2 text-sm">
              <input name="featured" type="checkbox" /> Featured
            </label>
            <label className="flex gap-2 text-sm">
              <input defaultChecked name="newArrival" type="checkbox" /> New
              arrival
            </label>
            <input
              className="field"
              name="seoTitle"
              placeholder="SEO title (optional)"
            />
            <textarea
              className="field min-h-20"
              name="seoDescription"
              placeholder="SEO description (optional)"
            />
            <button
              className="w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 disabled:opacity-50"
              disabled={pending}
              type="submit"
            >
              {pending ? "Saving…" : "Create draft"}
            </button>
          </form>
        </section>
        <section className="rounded-3xl border border-stone-800 bg-stone-900 p-5 sm:p-7">
          <p className="text-xs tracking-[0.22em] text-amber-300 uppercase">
            Variant matrix
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Add sellable SKU</h2>
          <form className="mt-5 space-y-3" onSubmit={addVariant}>
            <select
              className="field"
              defaultValue={selectedProductId}
              name="productId"
              required
            >
              <option value="">Choose a product</option>
              {products
                .filter((product) => product.status !== "ARCHIVED")
                .map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
            </select>
            <input
              className="field"
              name="sku"
              placeholder="SKU e.g. W-SHIRT-NAT-M"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                className="field"
                name="color"
                placeholder="Color"
                required
              />
              <input
                className="field"
                name="size"
                placeholder="Size"
                required
              />
            </div>
            <button
              className="w-full rounded-full border border-stone-700 px-5 py-3 text-sm disabled:opacity-50"
              disabled={pending}
              type="submit"
            >
              Add variant
            </button>
          </form>
        </section>
        {message ? (
          <p
            aria-live="polite"
            className="rounded-2xl border border-stone-700 bg-stone-900 p-4 text-sm text-stone-200"
          >
            {message}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
