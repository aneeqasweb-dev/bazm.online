import type { demoPaymentMethodSchema } from "@bazm/domain";
import type { z } from "zod";

export type DemoPaymentMethod = z.infer<typeof demoPaymentMethodSchema>;
export const paymentLabels: Record<DemoPaymentMethod, string> = {
  EASYPAISA: "Easypaisa",
  JAZZCASH: "JazzCash",
  CARD: "Credit / debit card",
};
export type PaymentField =
  "paymentMobile" | "cardHolder" | "cardNumber" | "cardExpiry" | "cardCvv";
export type PaymentErrors = Partial<Record<PaymentField, string>>;

export function normalizeMobile(value: string) {
  return value.replace(/[\s()-]/g, "");
}

export function validateDemoPayment(
  method: DemoPaymentMethod,
  form: FormData,
  now = new Date(),
): PaymentErrors {
  const read = (key: PaymentField) => String(form.get(key) ?? "").trim();
  if (method !== "CARD") {
    return /^(?:03\d{9}|\+923\d{9})$/.test(
      normalizeMobile(read("paymentMobile")),
    )
      ? {}
      : { paymentMobile: "Enter a valid mobile number, e.g. 03001234567." };
  }
  const errors: PaymentErrors = {};
  if (read("cardHolder").length < 2 || read("cardHolder").length > 80)
    errors.cardHolder = "Enter the card holder’s name (2–80 characters).";
  const number = read("cardNumber").replace(/[ -]/g, "");
  let sum = 0;
  [...number].reverse().forEach((digit, index) => {
    let value = Number(digit);
    if (index % 2) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
  });
  if (!/^\d{13,19}$/.test(number) || /^0+$/.test(number) || sum % 10 !== 0)
    errors.cardNumber = "Enter a valid card number. Try 4242 4242 4242 4242.";
  const expiry = /^(0[1-9]|1[0-2])\s*\/\s*(\d{2})$/.exec(read("cardExpiry"));
  if (
    !expiry ||
    Number(expiry[2]) + 2000 < now.getFullYear() ||
    (Number(expiry[2]) + 2000 === now.getFullYear() &&
      Number(expiry[1]) < now.getMonth() + 1)
  )
    errors.cardExpiry = "Enter a current or future expiry date (MM/YY).";
  if (!/^\d{3,4}$/.test(read("cardCvv")))
    errors.cardCvv = "Enter a 3 or 4 digit security code.";
  return errors;
}

export type DemoCheckoutRequest = {
  checkout: {
    idempotencyKey: string;
    shippingAddressId: string;
    billingAddressId: null;
    couponCode: string | null;
    deliveryMethod: "STANDARD" | "EXPRESS";
    paymentMethod: DemoPaymentMethod;
    customerNote: string | null;
  };
  mobileNumber?: string;
};

export class DemoPaymentError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly orderId?: string,
  ) {
    super(message);
  }
}

export async function payDemoOrder(
  input: DemoCheckoutRequest | { orderId: string },
) {
  const response = await fetch("/api/payments/demo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    orderId?: string;
    payment?: {
      isDemo: boolean;
      status: string;
      orderId: string;
      paymentId: string;
      transactionId: string;
    };
  } | null;
  if (
    !response.ok ||
    !body?.ok ||
    !body.payment?.isDemo ||
    body.payment.status !== "PAID"
  )
    throw new DemoPaymentError(
      body?.error ??
        "We couldn’t confirm the demo payment. Retry to check the same order.",
      response.status,
      body?.orderId,
    );
  return body.payment;
}
