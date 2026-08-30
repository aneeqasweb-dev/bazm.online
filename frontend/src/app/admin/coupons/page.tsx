import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStatusBadge,
  AdminTableShell,
} from "@/components/admin/admin-ui";
import { listAdminCoupons } from "@/lib/admin/admin-data";
import { requireAdminSession } from "@/lib/admin/server-auth";

import { CouponCreateForm, CouponStatusActions } from "./coupon-actions";

const currency = new Intl.NumberFormat("en-PK", {
  currency: "PKR",
  style: "currency",
});

function discountLabel(
  coupon: Awaited<ReturnType<typeof listAdminCoupons>>["items"][number],
) {
  return coupon.discount.kind === "PERCENTAGE"
    ? `${coupon.discount.percentage}%`
    : currency.format(coupon.discount.amount.amountMinor / 100);
}

export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; q?: string; status?: string }>;
}) {
  await requireAdminSession("/admin/coupons", ["coupons.manage"]);
  const params = await searchParams;
  const coupons = await listAdminCoupons(params);

  return (
    <>
      <AdminPageHeader
        description="Create validated coupon drafts, inspect limits/redemptions, and use confirmation-backed status changes."
        eyebrow="Promotions"
        title="Coupons"
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_27rem]">
        <AdminCard>
          <form className="flex flex-wrap gap-3" method="get">
            <input
              className="field mt-0 max-w-xs"
              defaultValue={params.q ?? ""}
              name="q"
              placeholder="Search code"
            />
            <select
              className="field mt-0 max-w-xs"
              defaultValue={params.status ?? "ALL"}
              name="status"
            >
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRED">Expired</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <button
              className="rounded-full border border-stone-700 px-4 py-2 text-sm"
              type="submit"
            >
              Apply
            </button>
          </form>
          {coupons.items.length ? (
            <>
              <AdminTableShell minWidth="900px">
                <thead className="border-b border-stone-800 text-xs tracking-[0.16em] text-stone-500 uppercase">
                  <tr>
                    <th className="pb-3">Code</th>
                    <th className="pb-3">Discount</th>
                    <th className="pb-3">Window</th>
                    <th className="pb-3">Limits</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.items.map((coupon) => (
                    <tr
                      className="border-b border-stone-800/80 align-top"
                      key={coupon.id}
                    >
                      <td className="py-4 font-medium">{coupon.displayCode}</td>
                      <td className="py-4">{discountLabel(coupon)}</td>
                      <td className="py-4 text-xs text-stone-400">
                        {new Date(coupon.startsAt).toLocaleDateString("en-PK")}{" "}
                        → {new Date(coupon.endsAt).toLocaleDateString("en-PK")}
                      </td>
                      <td className="py-4 text-xs text-stone-400">
                        {coupon.redemptionCount} used ·{" "}
                        {coupon.usageLimit ?? "∞"} total ·{" "}
                        {coupon.perCustomerLimit ?? "∞"} per customer
                      </td>
                      <td className="py-4">
                        <AdminStatusBadge status={coupon.status} />
                      </td>
                      <td className="py-4 text-right">
                        <CouponStatusActions
                          couponId={coupon.id}
                          status={coupon.status}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AdminTableShell>
              <AdminPagination
                basePath="/admin/coupons"
                nextCursor={coupons.nextCursor}
                params={{ q: params.q, status: params.status }}
              />
            </>
          ) : (
            <AdminEmptyState
              description="Create a draft coupon, then activate it when the campaign is ready."
              title="No coupons in this page"
            />
          )}
        </AdminCard>
        <CouponCreateForm />
      </div>
    </>
  );
}
