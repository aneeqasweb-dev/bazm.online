"use client";

import { useCallableAction } from "@/components/admin/callable-action";
import {
  ADMIN_PERMISSIONS,
  type AdminPermission,
} from "@/lib/admin/permissions";
import type { AdminCustomerRow } from "@/lib/admin/admin-data";

export function CustomerAccessForm({
  customer,
}: {
  customer: AdminCustomerRow;
}) {
  const { message, pending, run } = useCallableAction("updateUserAccess");

  return (
    <form
      className="grid gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!window.confirm("Change this account's role or access state?"))
          return;
        const form = new FormData(event.currentTarget);
        const permissions = ADMIN_PERMISSIONS.filter((permission) =>
          form.getAll("permissions").includes(permission),
        ) as AdminPermission[];
        await run(
          {
            userId: customer.id,
            role: form.get("role"),
            isActive: form.get("isActive") === "on",
            permissions,
          },
          "Access updated.",
        );
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <select className="field mt-0" defaultValue={customer.role} name="role">
          <option value="CUSTOMER">Customer</option>
          <option value="STAFF">Staff</option>
          <option value="ADMIN">Admin</option>
          <option value="SUPER_ADMIN">Super admin</option>
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-stone-800 px-3 py-2 text-sm">
          <input
            defaultChecked={customer.isActive}
            name="isActive"
            type="checkbox"
          />
          Active
        </label>
      </div>
      <details className="rounded-xl border border-stone-800 p-3 text-left">
        <summary className="cursor-pointer text-xs text-stone-400">
          Staff permissions
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {ADMIN_PERMISSIONS.map((permission) => (
            <label className="flex items-center gap-2 text-xs" key={permission}>
              <input
                defaultChecked={customer.permissions.includes(permission)}
                name="permissions"
                type="checkbox"
                value={permission}
              />
              {permission}
            </label>
          ))}
        </div>
      </details>
      <button
        className="rounded-full bg-amber-300 px-3 py-2 text-xs font-semibold text-stone-950 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Save access"}
      </button>
      {message ? <p className="text-xs text-stone-400">{message}</p> : null}
    </form>
  );
}
