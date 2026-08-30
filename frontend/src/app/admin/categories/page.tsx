import { CategoryWorkspace } from "@/app/admin/categories/category-workspace";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { requireAdminSession } from "@/lib/admin/server-auth";
import { listAdminCategories } from "@/lib/categories/server";

export default async function AdminCategoriesPage() {
  await requireAdminSession("/admin/categories", ["catalog.manage"]);
  const categories = await listAdminCategories();

  return (
    <>
      <AdminPageHeader
        description="Create a deliberate hierarchy, maintain reliable navigation, and only activate categories ready for the public catalog."
        eyebrow="Catalog management"
        title="Category system"
      />
      <CategoryWorkspace categories={categories} />
    </>
  );
}
