import { DomainError } from "@bazm/domain";
import { ZodError } from "zod";

import { getAuthorizedSession } from "@/lib/auth/server-session";
import { adminCommandPermissions, adminCommands } from "@/lib/commands/admin";
import {
  cartWishlistCommands,
  CustomerCommandError,
} from "@/lib/commands/cart-wishlist";
import { checkoutCommands } from "@/lib/commands/checkout";
import { customerServiceCommands } from "@/lib/commands/customer-services";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/commands/[command]">,
) {
  const { command } = await context.params;
  const adminPermission = adminCommandPermissions[command];
  const session = await getAuthorizedSession(
    adminPermission
      ? {
          requireVerified: true,
          roles: ["STAFF", "ADMIN", "SUPER_ADMIN"],
          permissions: [adminPermission],
        }
      : { requireVerified: true },
  );
  if (!session.claims || session.reason) {
    return Response.json(
      {
        error: session.claims
          ? "You do not have permission for this action."
          : "Authentication required.",
      },
      { status: session.claims ? 403 : 401 },
    );
  }
  const customerCommands = {
    ...cartWishlistCommands,
    ...checkoutCommands,
    ...customerServiceCommands,
  };
  if (!(command in customerCommands) && !(command in adminCommands)) {
    return Response.json({ error: "Unknown command." }, { status: 404 });
  }
  try {
    const input = await request.json().catch(() => null);
    const data = adminPermission
      ? await adminCommands[command]!(
          { actorId: session.claims.uid, claims: session.claims },
          input,
        )
      : await (
          customerCommands[command as keyof typeof customerCommands] as (
            uid: string,
            input: unknown,
          ) => Promise<unknown>
        )(session.claims.uid, input);
    return Response.json({ data });
  } catch (error) {
    if (error instanceof CustomerCommandError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof DomainError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "FORBIDDEN"
            ? 403
            : error.code === "UNAUTHENTICATED"
              ? 401
              : error.code === "CONFLICT" ||
                  error.code === "PRECONDITION_FAILED"
                ? 409
                : error.code === "UNAVAILABLE"
                  ? 503
                  : 400;
      return Response.json({ error: error.message }, { status });
    }
    if (error instanceof ZodError) {
      return Response.json(
        { error: "Enter valid information." },
        { status: 400 },
      );
    }
    return Response.json(
      { error: "The action could not be completed." },
      { status: 500 },
    );
  }
}
