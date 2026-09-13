import "server-only";

import { documentIdSchema } from "@bazm/domain";
import { checkoutCommandSchema, OrderService } from "@bazm/functions/orders";
import {
  paymentIntentCommandSchema,
  PaymentService,
} from "@bazm/functions/payments";
import { z } from "zod";

import { getServerFirestore } from "@/lib/firebase/admin";

const orderIdSchema = z.object({ orderId: documentIdSchema }).strict();

function orders() {
  return new OrderService(getServerFirestore());
}

export const checkoutCommands = {
  async createAddress(uid: string, input: unknown) {
    return { ok: true as const, ...(await orders().createAddress(uid, input)) };
  },
  async createCheckout(uid: string, input: unknown) {
    const parsed = checkoutCommandSchema.parse(input);
    return { ok: true as const, ...(await orders().checkout(uid, parsed)) };
  },
  async cancelMyOrder(uid: string, input: unknown) {
    const parsed = orderIdSchema.parse(input);
    return {
      ok: true as const,
      ...(await orders().cancel(uid, parsed.orderId)),
    };
  },
  async createPaymentAttempt(uid: string, input: unknown) {
    const parsed = paymentIntentCommandSchema.parse(input);
    return {
      ok: true as const,
      ...(await new PaymentService(getServerFirestore()).createAttempt(
        uid,
        parsed.orderId,
      )),
    };
  },
} as const;
