import { InventoryWorkspace } from "@/app/admin/inventory/inventory-workspace";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { requireAdminSession } from "@/lib/admin/server-auth";
import {
  listAdminInventory,
  listInventoryHistory,
  listInventoryVariants,
} from "@/lib/inventory/server";

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    after?: string;
    sku?: string;
    historyAfter?: string;
  }>;
}) {
  await requireAdminSession("/admin/inventory", ["inventory.manage"]);
  const params = await searchParams;
  const [inventory, variants, history] = await Promise.all([
    listAdminInventory(params.after),
    listInventoryVariants(),
    listInventoryHistory(params.sku, params.historyAfter),
  ]);

  return (
    <>
      <AdminPageHeader
        description="All stock changes are transactional, attributable, and recorded in an immutable ledger."
        eyebrow="Stock operations"
        title="Inventory ledger"
      />
      <InventoryWorkspace
        history={history}
        inventory={inventory}
        selectedSku={params.sku}
        variants={variants}
      />
    </>
  );
}
