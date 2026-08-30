import { ProductWorkspace } from "@/app/admin/products/product-workspace";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { requireAdminSession } from "@/lib/admin/server-auth";
import {
  listAdminProducts,
  listProductCategories,
} from "@/lib/products/server";

export default async function AdminProductsPage() {
  await requireAdminSession("/admin/products", ["catalog.manage"]);
  const [products, categories] = await Promise.all([
    listAdminProducts(),
    listProductCategories(),
  ]);
  const workspaceProducts = products.map((product) => ({
    basePrice: product.basePrice,
    categoryPath: product.categoryPath,
    id: product.id,
    media: product.media,
    name: product.name,
    slug: product.slug,
    status: product.status,
  }));

  return (
    <>
      <AdminPageHeader
        description="Create media-backed drafts, add uniquely identified variants, and publish only complete products through trusted catalog Functions."
        eyebrow="Catalog management"
        title="Product management"
      />
      <ProductWorkspace categories={categories} products={workspaceProducts} />
    </>
  );
}
