import { adminPermissionSchema, type AdminPermission } from "@bazm/domain";

import { CURRENT_CLAIMS_VERSION } from "@/lib/auth/server-authorization";

export type { AdminPermission };

export const ADMIN_PERMISSIONS = adminPermissionSchema.options;

export const ADMIN_MODULES = [
  {
    href: "/admin",
    label: "Overview",
    description:
      "Revenue, order, customer, product, stock, and return metrics.",
    permission: "reports.view",
  },
  {
    href: "/admin/products",
    label: "Products",
    description: "Draft, publish, archive, and maintain product variants.",
    permission: "catalog.manage",
  },
  {
    href: "/admin/categories",
    label: "Categories",
    description: "Hierarchy, active navigation, sort order, and SEO metadata.",
    permission: "catalog.manage",
  },
  {
    href: "/admin/inventory",
    label: "Inventory",
    description: "Receipts, adjustments, stock movement, and immutable ledger.",
    permission: "inventory.manage",
  },
  {
    href: "/admin/orders",
    label: "Orders",
    description: "Fulfilment queues, order transitions, and tracking states.",
    permission: "orders.manage",
  },
  {
    href: "/admin/customers",
    label: "Customers",
    description:
      "Customer profiles, roles, activity state, and staff permissions.",
    permission: "customers.manage",
  },
  {
    href: "/admin/support",
    label: "Support",
    description: "Assign, respond to, and resolve customer support tickets.",
    permission: "support.manage",
  },
  {
    href: "/admin/payments",
    label: "Payments",
    description: "Payment status, reconciliation, refunds, and provider IDs.",
    permission: "payments.manage",
  },
  {
    href: "/admin/coupons",
    label: "Coupons",
    description:
      "Validated discounts, limits, activation, expiry, and archives.",
    permission: "coupons.manage",
  },
  {
    href: "/admin/reviews",
    label: "Reviews",
    description:
      "Moderation queue, verified-purchase reviews, and rating rollups.",
    permission: "reviews.manage",
  },
  {
    href: "/admin/returns",
    label: "Returns",
    description: "Return review, receipt, refund, and closure workflow.",
    permission: "returns.manage",
  },
  {
    href: "/admin/reports",
    label: "Reports",
    description: "Operational charts and metric definitions.",
    permission: "reports.view",
  },
  {
    href: "/admin/settings",
    label: "Settings",
    description: "Versioned commerce settings and operational configuration.",
    permission: "settings.manage",
  },
  {
    href: "/admin/audit",
    label: "Audit logs",
    description: "Immutable administrative action history.",
    permission: "audit.view",
  },
] as const satisfies readonly {
  href: string;
  label: string;
  description: string;
  permission: AdminPermission;
}[];

export const ALL_ADMIN_MODULE_PERMISSIONS = [
  ...new Set(ADMIN_MODULES.map((module) => module.permission)),
] as AdminPermission[];

export function canUseAdminModule(
  claims: Record<string, unknown>,
  permission: AdminPermission,
) {
  if (claims.claimsVersion !== CURRENT_CLAIMS_VERSION) return false;
  if (claims.isActive !== true) return false;
  const role = String(claims.role);
  if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
  if (role !== "STAFF") return false;
  const permissions = Array.isArray(claims.permissions)
    ? claims.permissions.filter(
        (candidate): candidate is AdminPermission =>
          adminPermissionSchema.safeParse(candidate).success,
      )
    : [];
  return (
    permissions.includes(permission) || permissions.includes("admin.access")
  );
}
