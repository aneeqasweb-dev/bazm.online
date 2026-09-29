import { DomainError } from "@bazm/domain";
import { ZodError } from "zod";
import { revalidatePath } from "next/cache";

import { getAuthorizedSession } from "@/lib/auth/server-session";
import { adminCommandPermissions, adminCommands } from "@/lib/commands/admin";
import {
  cartWishlistCommands,
  CustomerCommandError,
  guestCartCommands,
  mergeGuestCart,
} from "@/lib/commands/cart-wishlist";
import {
  clearGuestCartId,
  ensureGuestCartId,
  getGuestCartId,
} from "@/lib/cart/guest-session";
import { checkoutCommands } from "@/lib/commands/checkout";
import { customerServiceCommands } from "@/lib/commands/customer-services";
import { isTrustedOrigin } from "@/lib/http/trusted-origin";

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
  const guestCartCommand = Object.hasOwn(guestCartCommands, command);
  if (guestCartCommand || command === "mergeGuestCart") {
    if (!isTrustedOrigin(request))
      return Response.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return Response.json(
        { error: "Send a JSON cart request." },
        { status: 415 },
      );
  }
  const useGuestCart =
    guestCartCommand &&
    (!session.claims ||
      ["expired", "stale-claims", "unverified"].includes(session.reason ?? ""));
  if ((!session.claims || session.reason) && !useGuestCart) {
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
  if (
    !Object.hasOwn(customerCommands, command) &&
    !Object.hasOwn(adminCommands, command) &&
    command !== "mergeGuestCart"
  ) {
    return Response.json({ error: "Unknown command." }, { status: 404 });
  }
  try {
    const input = await request.json().catch(() => null);
    if (useGuestCart) {
      const guestId = await ensureGuestCartId();
      const data = await guestCartCommands[
        command as keyof typeof guestCartCommands
      ](guestId, input);
      revalidatePath("/cart");
      return Response.json(
        { data },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (!session.claims)
      return Response.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    if (command === "mergeGuestCart") {
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).length
      )
        return Response.json(
          { error: "Invalid cart request." },
          { status: 400 },
        );
      const guestId = await getGuestCartId();
      const data = guestId
        ? await mergeGuestCart(session.claims.uid, guestId)
        : { ok: true };
      await clearGuestCartId();
      revalidatePath("/cart");
      revalidatePath("/checkout");
      return Response.json(
        { data },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
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
    if (guestCartCommand || command === "moveCartItemToWishlist") {
      revalidatePath("/cart");
      revalidatePath("/checkout");
    }
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
