import {
  emailTemplateKeySchema,
  type Money,
  type OrderDocument,
  type ReturnDocument,
} from "@bazm/domain";

export const EMAIL_TEMPLATE_KEYS = emailTemplateKeySchema.options;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

type OrderItemSummary = {
  productName: string;
  quantity: number;
  lineTotal: Money;
};

type OrderEmailPayload = {
  customerName: string;
  orderId: string;
  orderUrl: string;
  total: Money;
  items: OrderItemSummary[];
};

type RefundEmailPayload = OrderEmailPayload & {
  refundId: string;
  refundAmount: Money;
  reason: string;
};

type ReturnEmailPayload = OrderEmailPayload & {
  returnId: string;
  status: ReturnDocument["status"];
};

export type EmailTemplatePayloads = {
  WELCOME: {
    customerName: string;
    accountUrl: string;
  };
  EMAIL_VERIFICATION: {
    customerName: string;
    verificationUrl: string;
  };
  PASSWORD_RESET: {
    customerName: string;
    resetUrl: string;
  };
  ORDER_PLACED: OrderEmailPayload;
  PAYMENT_RECEIVED: OrderEmailPayload & {
    paymentId: string;
  };
  PAYMENT_FAILED: OrderEmailPayload & {
    reason: string | null;
  };
  ORDER_SHIPPED: OrderEmailPayload & {
    trackingNumber: string;
  };
  ORDER_DELIVERED: OrderEmailPayload;
  ORDER_CANCELLED: OrderEmailPayload & {
    reason: string | null;
  };
  RETURN_REQUESTED: ReturnEmailPayload;
  RETURN_UPDATED: ReturnEmailPayload;
  REFUND_INITIATED: RefundEmailPayload;
  REFUND_COMPLETED: RefundEmailPayload;
  REFUND_FAILED: RefundEmailPayload;
};

export type RenderedEmail = {
  subject: string;
  previewText: string;
  textBody: string;
  htmlBody: string;
};

type LayoutInput = {
  title: string;
  previewText: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  rows?: { label: string; value: string }[];
  items?: OrderItemSummary[];
};

const currencyFormatter = new Intl.NumberFormat("en-PK", {
  currency: "PKR",
  style: "currency",
  maximumFractionDigits: 0,
});

function formatMoney(money: Money) {
  return currencyFormatter.format(money.amountMinor / 100);
}

function orderNumber(orderId: string) {
  return orderId.slice(-8).toUpperCase();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return escaped[character];
  });
}

function safeUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Email links must use http or https.");
  }
  return url.toString();
}

function itemLines(items: OrderItemSummary[]) {
  return items.map(
    (item) =>
      `${item.quantity} x ${item.productName} - ${formatMoney(item.lineTotal)}`,
  );
}

function htmlItems(items: OrderItemSummary[] = []) {
  if (!items.length) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px">
${items
  .map(
    (item) => `<tr>
  <td style="padding:10px 0;border-top:1px solid #e7e5e4;color:#292524">${escapeHtml(item.quantity.toString())} x ${escapeHtml(item.productName)}</td>
  <td align="right" style="padding:10px 0;border-top:1px solid #e7e5e4;color:#292524">${escapeHtml(formatMoney(item.lineTotal))}</td>
</tr>`,
  )
  .join("")}
</table>`;
}

function htmlRows(rows: LayoutInput["rows"] = []) {
  if (!rows.length) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px">
${rows
  .map(
    (row) => `<tr>
  <td style="padding:8px 0;color:#78716c">${escapeHtml(row.label)}</td>
  <td align="right" style="padding:8px 0;color:#292524;font-weight:600">${escapeHtml(row.value)}</td>
</tr>`,
  )
  .join("")}
</table>`;
}

function renderLayout(input: LayoutInput): RenderedEmail {
  const safeCta = input.cta
    ? { label: input.cta.label, url: safeUrl(input.cta.url) }
    : null;
  const textBody = [
    input.title,
    "",
    ...input.paragraphs,
    "",
    ...(input.rows ?? []).map((row) => `${row.label}: ${row.value}`),
    ...(input.items?.length ? ["", "Items", ...itemLines(input.items)] : []),
    ...(safeCta ? ["", `${safeCta.label}: ${safeCta.url}`] : []),
    "",
    "Bazm",
  ].join("\n");

  const htmlBody = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;background:#fafaf9;color:#292524;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.previewText)}</div>
    <main role="article" aria-roledescription="email" aria-label="${escapeHtml(input.title)}" style="max-width:640px;margin:0 auto;padding:32px 20px">
      <header style="padding:20px 0;border-bottom:2px solid #d6a100">
        <p style="margin:0;color:#a16207;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Bazm</p>
      </header>
      <section style="background:#ffffff;border:1px solid #e7e5e4;border-radius:8px;margin-top:24px;padding:28px">
        <h1 style="font-size:24px;line-height:1.3;margin:0 0 16px;color:#1c1917">${escapeHtml(input.title)}</h1>
        ${input.paragraphs.map((paragraph) => `<p style="font-size:16px;line-height:1.6;margin:0 0 14px;color:#44403c">${escapeHtml(paragraph)}</p>`).join("")}
        ${htmlRows(input.rows)}
        ${htmlItems(input.items)}
        ${
          safeCta
            ? `<p style="margin:24px 0 0"><a href="${escapeHtml(safeCta.url)}" style="display:inline-block;background:#fcd34d;color:#1c1917;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 18px">${escapeHtml(safeCta.label)}</a></p>`
            : ""
        }
      </section>
      <footer style="font-size:12px;line-height:1.6;color:#78716c;padding:20px 0">
        <p style="margin:0">Bazm sends transactional email only for account and order activity.</p>
      </footer>
    </main>
  </body>
</html>`;

  return {
    subject: input.title,
    previewText: input.previewText,
    textBody,
    htmlBody,
  };
}

function orderRows(order: OrderEmailPayload, extra: LayoutInput["rows"] = []) {
  return [
    { label: "Order", value: orderNumber(order.orderId) },
    { label: "Total", value: formatMoney(order.total) },
    ...extra,
  ];
}

export function payloadFromOrder(
  customerName: string,
  orderId: string,
  order: OrderDocument,
  orderUrl: string,
): OrderEmailPayload {
  return {
    customerName,
    orderId,
    orderUrl,
    total: order.totals.grandTotal,
    items: order.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
  };
}

export function renderEmailTemplate<K extends EmailTemplateKey>(
  template: K,
  payload: EmailTemplatePayloads[K],
): RenderedEmail {
  switch (template) {
    case "WELCOME": {
      const data = payload as EmailTemplatePayloads["WELCOME"];
      return renderLayout({
        title: "Welcome to Bazm",
        previewText: "Your Bazm account is ready.",
        paragraphs: [
          `Hi ${data.customerName}, welcome to Bazm.`,
          "Your account is ready for saved favourites, faster checkout, and order tracking.",
        ],
        cta: { label: "Open my account", url: data.accountUrl },
      });
    }
    case "EMAIL_VERIFICATION": {
      const data = payload as EmailTemplatePayloads["EMAIL_VERIFICATION"];
      return renderLayout({
        title: "Verify your Bazm email",
        previewText: "Confirm your email address to finish setting up Bazm.",
        paragraphs: [
          `Hi ${data.customerName}, confirm this email address so your Bazm account stays protected.`,
          "This link is generated by Firebase Auth and can be used only for this account.",
        ],
        cta: { label: "Verify email", url: data.verificationUrl },
      });
    }
    case "PASSWORD_RESET": {
      const data = payload as EmailTemplatePayloads["PASSWORD_RESET"];
      return renderLayout({
        title: "Reset your Bazm password",
        previewText: "Use this secure link to choose a new password.",
        paragraphs: [
          `Hi ${data.customerName}, we received a request to reset your Bazm password.`,
          "If this was not you, you can ignore this email and your password will stay the same.",
        ],
        cta: { label: "Reset password", url: data.resetUrl },
      });
    }
    case "ORDER_PLACED": {
      const data = payload as EmailTemplatePayloads["ORDER_PLACED"];
      return renderLayout({
        title: `Order ${orderNumber(data.orderId)} received`,
        previewText: "We received your order and are checking payment.",
        paragraphs: [
          `Hi ${data.customerName}, we received your order.`,
          "We will update you as payment, packing, and delivery move forward.",
        ],
        rows: orderRows(data),
        items: data.items,
        cta: { label: "View order", url: data.orderUrl },
      });
    }
    case "PAYMENT_RECEIVED": {
      const data = payload as EmailTemplatePayloads["PAYMENT_RECEIVED"];
      return renderLayout({
        title: `Payment received for order ${orderNumber(data.orderId)}`,
        previewText: "Your payment has been confirmed.",
        paragraphs: [
          `Hi ${data.customerName}, your payment has been confirmed.`,
          "Your order can now move to packing.",
        ],
        rows: orderRows(data, [{ label: "Payment", value: data.paymentId }]),
        items: data.items,
        cta: { label: "View order", url: data.orderUrl },
      });
    }
    case "PAYMENT_FAILED": {
      const data = payload as EmailTemplatePayloads["PAYMENT_FAILED"];
      return renderLayout({
        title: `Payment did not complete for order ${orderNumber(data.orderId)}`,
        previewText:
          "The payment was not completed, so the order was cancelled.",
        paragraphs: [
          `Hi ${data.customerName}, your payment did not complete.`,
          data.reason
            ? `Reason: ${data.reason}. The reserved stock has been released.`
            : "The reserved stock has been released.",
        ],
        rows: orderRows(data),
        cta: { label: "View order", url: data.orderUrl },
      });
    }
    case "ORDER_SHIPPED": {
      const data = payload as EmailTemplatePayloads["ORDER_SHIPPED"];
      return renderLayout({
        title: `Order ${orderNumber(data.orderId)} has shipped`,
        previewText: "Your Bazm order is on its way.",
        paragraphs: [
          `Hi ${data.customerName}, your order has left for delivery.`,
          "Use the tracking number below with the courier once it becomes active.",
        ],
        rows: orderRows(data, [
          { label: "Tracking", value: data.trackingNumber },
        ]),
        items: data.items,
        cta: { label: "View order", url: data.orderUrl },
      });
    }
    case "ORDER_DELIVERED": {
      const data = payload as EmailTemplatePayloads["ORDER_DELIVERED"];
      return renderLayout({
        title: `Order ${orderNumber(data.orderId)} delivered`,
        previewText: "Your order has been marked delivered.",
        paragraphs: [
          `Hi ${data.customerName}, your order has been marked delivered.`,
          "Thank you for shopping with Bazm.",
        ],
        rows: orderRows(data),
        items: data.items,
        cta: { label: "View order", url: data.orderUrl },
      });
    }
    case "ORDER_CANCELLED": {
      const data = payload as EmailTemplatePayloads["ORDER_CANCELLED"];
      return renderLayout({
        title: `Order ${orderNumber(data.orderId)} cancelled`,
        previewText: "Your order has been cancelled.",
        paragraphs: [
          `Hi ${data.customerName}, your order has been cancelled.`,
          data.reason ?? "No payment was captured for this cancellation.",
        ],
        rows: orderRows(data),
        cta: { label: "View order", url: data.orderUrl },
      });
    }
    case "RETURN_REQUESTED": {
      const data = payload as EmailTemplatePayloads["RETURN_REQUESTED"];
      return renderLayout({
        title: `Return request ${orderNumber(data.returnId)} received`,
        previewText: "We received your return request.",
        paragraphs: [
          `Hi ${data.customerName}, we received your return request.`,
          "The support team will review it against the return policy and update you soon.",
        ],
        rows: orderRows(data, [{ label: "Return status", value: data.status }]),
        items: data.items,
        cta: { label: "View order", url: data.orderUrl },
      });
    }
    case "RETURN_UPDATED": {
      const data = payload as EmailTemplatePayloads["RETURN_UPDATED"];
      return renderLayout({
        title: `Return request ${orderNumber(data.returnId)} updated`,
        previewText: "Your return request status changed.",
        paragraphs: [
          `Hi ${data.customerName}, your return request has been updated.`,
          `Current status: ${data.status}.`,
        ],
        rows: orderRows(data, [{ label: "Return status", value: data.status }]),
        items: data.items,
        cta: { label: "View order", url: data.orderUrl },
      });
    }
    case "REFUND_INITIATED": {
      const data = payload as EmailTemplatePayloads["REFUND_INITIATED"];
      return renderLayout({
        title: `Refund started for order ${orderNumber(data.orderId)}`,
        previewText: "A refund has been initiated for your payment.",
        paragraphs: [
          `Hi ${data.customerName}, a refund has been initiated.`,
          "We will send another update when the provider confirms the final result.",
        ],
        rows: orderRows(data, [
          { label: "Refund", value: data.refundId },
          { label: "Amount", value: formatMoney(data.refundAmount) },
          { label: "Reason", value: data.reason },
        ]),
        cta: { label: "View order", url: data.orderUrl },
      });
    }
    case "REFUND_COMPLETED": {
      const data = payload as EmailTemplatePayloads["REFUND_COMPLETED"];
      return renderLayout({
        title: `Refund completed for order ${orderNumber(data.orderId)}`,
        previewText: "Your refund has been confirmed.",
        paragraphs: [
          `Hi ${data.customerName}, your refund has been confirmed.`,
          "Your bank or wallet provider may need extra time to show the credit.",
        ],
        rows: orderRows(data, [
          { label: "Refund", value: data.refundId },
          { label: "Amount", value: formatMoney(data.refundAmount) },
        ]),
        cta: { label: "View order", url: data.orderUrl },
      });
    }
    case "REFUND_FAILED": {
      const data = payload as EmailTemplatePayloads["REFUND_FAILED"];
      return renderLayout({
        title: `Refund update for order ${orderNumber(data.orderId)}`,
        previewText: "The refund could not be completed by the provider.",
        paragraphs: [
          `Hi ${data.customerName}, the provider could not complete this refund.`,
          "Bazm support can retry or follow up after reviewing the provider response.",
        ],
        rows: orderRows(data, [
          { label: "Refund", value: data.refundId },
          { label: "Amount", value: formatMoney(data.refundAmount) },
          { label: "Reason", value: data.reason },
        ]),
        cta: { label: "View order", url: data.orderUrl },
      });
    }
  }
  throw new Error(`Unsupported email template: ${template}`);
}

const fixtureMoney: Money = { amountMinor: 125_000, currency: "PKR" };
const fixtureOrder: OrderEmailPayload = {
  customerName: "Aneeqa Pervaiz",
  orderId: "order-preview-12345678",
  orderUrl: "https://bazm.online/account?order=order-preview-12345678",
  total: fixtureMoney,
  items: [
    {
      productName: "Embroidered Linen Kurta",
      quantity: 1,
      lineTotal: fixtureMoney,
    },
  ],
};

export const EMAIL_TEMPLATE_FIXTURES: {
  [K in EmailTemplateKey]: EmailTemplatePayloads[K];
} = {
  WELCOME: {
    customerName: "Aneeqa Pervaiz",
    accountUrl: "https://bazm.online/account",
  },
  EMAIL_VERIFICATION: {
    customerName: "Aneeqa Pervaiz",
    verificationUrl: "https://bazm.online/verify-email?oobCode=preview",
  },
  PASSWORD_RESET: {
    customerName: "Aneeqa Pervaiz",
    resetUrl: "https://bazm.online/reset-password?oobCode=preview",
  },
  ORDER_PLACED: fixtureOrder,
  PAYMENT_RECEIVED: {
    ...fixtureOrder,
    paymentId: "payment-preview",
  },
  PAYMENT_FAILED: {
    ...fixtureOrder,
    reason: "The payment provider declined the transaction",
  },
  ORDER_SHIPPED: {
    ...fixtureOrder,
    trackingNumber: "PK-123456",
  },
  ORDER_DELIVERED: fixtureOrder,
  ORDER_CANCELLED: {
    ...fixtureOrder,
    reason: "Customer cancelled before payment",
  },
  RETURN_REQUESTED: {
    ...fixtureOrder,
    returnId: "return-preview-12345678",
    status: "REQUESTED",
  },
  RETURN_UPDATED: {
    ...fixtureOrder,
    returnId: "return-preview-12345678",
    status: "APPROVED",
  },
  REFUND_INITIATED: {
    ...fixtureOrder,
    refundId: "refund-preview",
    refundAmount: { amountMinor: 25_000, currency: "PKR" },
    reason: "Customer return",
  },
  REFUND_COMPLETED: {
    ...fixtureOrder,
    refundId: "refund-preview",
    refundAmount: { amountMinor: 25_000, currency: "PKR" },
    reason: "Customer return",
  },
  REFUND_FAILED: {
    ...fixtureOrder,
    refundId: "refund-preview",
    refundAmount: { amountMinor: 25_000, currency: "PKR" },
    reason: "Provider failure",
  },
};

function renderPreview<K extends EmailTemplateKey>(template: K) {
  return {
    template,
    message: renderEmailTemplate(template, EMAIL_TEMPLATE_FIXTURES[template]),
  };
}

export function renderAllTemplatePreviews() {
  return (EMAIL_TEMPLATE_KEYS as EmailTemplateKey[]).map((template) =>
    renderPreview(template),
  );
}
