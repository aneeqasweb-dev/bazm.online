import {
  DomainError,
  emailSchema,
  orderDocumentSchema,
  paymentDocumentSchema,
  refundDocumentSchema,
  returnDocumentSchema,
  userDocumentSchema,
  type EmailDeliveryDocument,
  type Money,
  type UserDocument,
} from "@bazm/domain";
import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";

import {
  payloadFromOrder,
  renderEmailTemplate,
  type EmailTemplateKey,
  type EmailTemplatePayloads,
  type RenderedEmail,
} from "./templates.js";

const MAX_EMAIL_ATTEMPTS = 5;

type EmailRecipient = {
  email: string;
  name: string | null;
};

type EmailSender = {
  email: string;
  name: string;
};

type EmailSource = EmailDeliveryDocument["source"];

export type EmailProviderMessage = {
  idempotencyKey: string;
  template: EmailTemplateKey;
  to: EmailRecipient;
  from: EmailSender;
  userId: string | null;
  source: EmailSource;
  subject: string;
  previewText: string;
  textBody: string;
  htmlBody: string;
};

export type EmailProvider = {
  name: string;
  send: (
    message: EmailProviderMessage,
  ) => Promise<{ providerMessageId: string }>;
};

export type EmailDeliveryResult = {
  idempotencyKey: string;
  status: EmailDeliveryDocument["status"];
  duplicate: boolean;
  provider: string;
};

type StoredEmailDelivery = EmailProviderMessage & {
  status: EmailDeliveryDocument["status"];
  provider: string;
  providerMessageId: string | null;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date | Timestamp | null;
};

type EmailCommand<K extends EmailTemplateKey> = {
  template: K;
  to: EmailRecipient;
  userId: string | null;
  source: EmailSource;
  payload: EmailTemplatePayloads[K];
};

class UnconfiguredEmailProvider implements EmailProvider {
  readonly name = "UNCONFIGURED";

  constructor(private readonly reason: string) {}

  async send(): Promise<{ providerMessageId: string }> {
    throw new DomainError("UNAVAILABLE", this.reason);
  }
}

export class LocalPreviewEmailProvider implements EmailProvider {
  readonly name = "LOCAL_PREVIEW";

  constructor(private readonly firestore: Firestore) {}

  async send(message: EmailProviderMessage) {
    await this.firestore
      .collection("emailPreviews")
      .doc(message.idempotencyKey)
      .set(
        {
          ...message,
          provider: this.name,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    return { providerMessageId: `local_${message.idempotencyKey}` };
  }
}

class HttpEmailProvider implements EmailProvider {
  readonly name = "HTTP";

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
  ) {}

  async send(message: EmailProviderMessage) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(message),
    });
    if (!response.ok) {
      throw new DomainError(
        "UNAVAILABLE",
        `Email provider returned HTTP ${response.status}.`,
      );
    }
    const data = (await response.json().catch(() => ({}))) as {
      messageId?: unknown;
    };
    return {
      providerMessageId:
        typeof data.messageId === "string" && data.messageId.trim()
          ? data.messageId.trim()
          : `http_${message.idempotencyKey}`,
    };
  }
}

function isEmulator() {
  return process.env.FUNCTIONS_EMULATOR === "true";
}

function configuredSender(): EmailSender {
  const fallbackEmail = isEmulator()
    ? "hello@bazm.example"
    : "no-reply@bazm.online";
  const parsedEmail = emailSchema.safeParse(
    process.env.EMAIL_FROM_EMAIL ?? fallbackEmail,
  );
  if (!parsedEmail.success) {
    return { email: fallbackEmail, name: "Bazm" };
  }
  return {
    email: parsedEmail.data,
    name: (process.env.EMAIL_FROM_NAME ?? "Bazm").trim() || "Bazm",
  };
}

function validEndpoint(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function createConfiguredEmailProvider(firestore: Firestore) {
  const provider = (process.env.EMAIL_PROVIDER ?? "").trim().toUpperCase();
  if (!provider || provider === "LOCAL" || provider === "LOCAL_PREVIEW") {
    if (isEmulator() || provider === "LOCAL" || provider === "LOCAL_PREVIEW") {
      return new LocalPreviewEmailProvider(firestore);
    }
    return new UnconfiguredEmailProvider(
      "Transactional email is not configured. Set EMAIL_PROVIDER.",
    );
  }
  if (provider === "HTTP") {
    const endpoint = validEndpoint(process.env.EMAIL_PROVIDER_ENDPOINT);
    const apiKey = process.env.EMAIL_PROVIDER_API_KEY?.trim();
    if (!endpoint || !apiKey) {
      return new UnconfiguredEmailProvider(
        "HTTP email provider requires EMAIL_PROVIDER_ENDPOINT and EMAIL_PROVIDER_API_KEY.",
      );
    }
    return new HttpEmailProvider(endpoint, apiKey);
  }
  return new UnconfiguredEmailProvider(
    `Unsupported email provider ${provider}.`,
  );
}

export function appBaseUrl() {
  const configured =
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? null;
  if (configured) return new URL(configured).origin;
  return isEmulator() ? "http://127.0.0.1:3100" : "https://bazm.online";
}

export function appLink(path: string) {
  return new URL(path, appBaseUrl()).toString();
}

export function appActionLink(firebaseLink: string, appPath: string) {
  const code = new URL(firebaseLink).searchParams.get("oobCode");
  if (!code) {
    throw new DomainError(
      "UNAVAILABLE",
      "Firebase did not return an action code.",
    );
  }
  const link = new URL(appPath, appBaseUrl());
  link.searchParams.set("oobCode", code);
  return link.toString();
}

function safeIdempotencyKey(value: string) {
  if (!/^[A-Za-z0-9:_-]{8,255}$/.test(value)) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Email idempotency key is invalid.",
    );
  }
  return value;
}

function safeError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Email delivery failed.";
  return message.slice(0, 500);
}

function asDate(value: Date | Timestamp | { toDate: () => Date } | null) {
  if (!value) return null;
  return value instanceof Date ? value : value.toDate();
}

function backoffAfter(attempts: number) {
  return Timestamp.fromDate(
    new Date(Date.now() + Math.min(60, 2 ** attempts) * 60 * 1000),
  );
}

function normalizeRecipient(user: UserDocument): EmailRecipient {
  return {
    email: user.email,
    name: user.name.trim() || null,
  };
}

function paymentText(status: string | null) {
  if (!status) return null;
  return status.replaceAll("_", " ").toLowerCase();
}

export class EmailService {
  constructor(
    private readonly firestore: Firestore,
    private readonly provider: EmailProvider = createConfiguredEmailProvider(
      firestore,
    ),
    private readonly sender: EmailSender = configuredSender(),
  ) {}

  async sendTemplate<K extends EmailTemplateKey>(
    idempotencyKey: string,
    command: EmailCommand<K>,
  ): Promise<EmailDeliveryResult> {
    const key = safeIdempotencyKey(idempotencyKey);
    const rendered = renderEmailTemplate(command.template, command.payload);
    const deliveryRef = this.firestore.collection("emailDeliveries").doc(key);
    let result: EmailDeliveryResult | null = null;
    let created = false;

    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(deliveryRef);
      if (snapshot.exists) {
        result = {
          idempotencyKey: key,
          status:
            (snapshot.get("status") as EmailDeliveryDocument["status"]) ??
            "PENDING",
          duplicate: true,
          provider:
            (snapshot.get("provider") as string | undefined) ?? "UNKNOWN",
        };
        return;
      }

      transaction.create(deliveryRef, {
        idempotencyKey: key,
        template: command.template,
        to: {
          email: emailSchema.parse(command.to.email),
          name: command.to.name,
        },
        from: this.sender,
        userId: command.userId,
        source: command.source,
        ...rendered,
        status: "PENDING",
        provider: this.provider.name,
        providerMessageId: null,
        attempts: 0,
        lastError: null,
        nextAttemptAt: FieldValue.serverTimestamp(),
        sentAt: null,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      created = true;
    });

    if (!created && result) return result;
    return this.attemptDelivery(key, rendered);
  }

  async attemptDelivery(
    idempotencyKey: string,
    rendered?: RenderedEmail,
  ): Promise<EmailDeliveryResult> {
    const key = safeIdempotencyKey(idempotencyKey);
    const deliveryRef = this.firestore.collection("emailDeliveries").doc(key);
    const snapshot = await deliveryRef.get();
    if (!snapshot.exists) {
      throw new DomainError("NOT_FOUND", "Email delivery does not exist.");
    }
    const delivery = this.storedDelivery(snapshot, rendered);
    if (delivery.status === "SENT" || delivery.status === "SKIPPED") {
      return {
        idempotencyKey: key,
        status: delivery.status,
        duplicate: true,
        provider: delivery.provider,
      };
    }
    if (delivery.attempts >= MAX_EMAIL_ATTEMPTS) {
      await deliveryRef.update({
        status: "FAILED",
        nextAttemptAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        idempotencyKey: key,
        status: "FAILED",
        duplicate: true,
        provider: delivery.provider,
      };
    }

    const attempts = delivery.attempts + 1;
    try {
      const providerResult = await this.provider.send(delivery);
      await deliveryRef.update({
        status: "SENT",
        provider: this.provider.name,
        providerMessageId: providerResult.providerMessageId,
        attempts,
        lastError: null,
        nextAttemptAt: null,
        sentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        idempotencyKey: key,
        status: "SENT",
        duplicate: false,
        provider: this.provider.name,
      };
    } catch (error) {
      await deliveryRef.update({
        status: "FAILED",
        provider: this.provider.name,
        attempts,
        lastError: safeError(error),
        nextAttemptAt:
          attempts >= MAX_EMAIL_ATTEMPTS ? null : backoffAfter(attempts),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        idempotencyKey: key,
        status: "FAILED",
        duplicate: false,
        provider: this.provider.name,
      };
    }
  }

  async retryPending(
    options: { limit?: number; includeFuture?: boolean } = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
    const due = Date.now();
    const snapshots = await Promise.all([
      this.firestore
        .collection("emailDeliveries")
        .where("status", "==", "PENDING")
        .limit(limit)
        .get(),
      this.firestore
        .collection("emailDeliveries")
        .where("status", "==", "FAILED")
        .limit(limit)
        .get(),
    ]);
    const candidates = snapshots.flatMap((snapshot) => snapshot.docs);
    const attempted = [];
    for (const candidate of candidates.slice(0, limit)) {
      const attempts = Number(candidate.get("attempts") ?? 0);
      const nextAttemptAt = asDate(
        candidate.get("nextAttemptAt") as Date | Timestamp | null,
      );
      if (attempts >= MAX_EMAIL_ATTEMPTS) continue;
      if (
        !options.includeFuture &&
        nextAttemptAt &&
        nextAttemptAt.getTime() > due
      ) {
        continue;
      }
      attempted.push(await this.attemptDelivery(candidate.id));
    }
    return { attempted };
  }

  async sendWelcome(
    userId: string,
    user: Pick<UserDocument, "name" | "email">,
  ) {
    return this.sendTemplate(`auth:${userId}:welcome`, {
      template: "WELCOME",
      to: { email: user.email, name: user.name },
      userId,
      source: { type: "AUTH", id: userId },
      payload: {
        customerName: user.name,
        accountUrl: appLink("/account"),
      },
    });
  }

  async sendEmailVerification(
    userId: string,
    user: Pick<UserDocument, "name" | "email">,
    verificationUrl: string,
    scope: string,
  ) {
    return this.sendTemplate(`auth:${userId}:verify:${scope}`, {
      template: "EMAIL_VERIFICATION",
      to: { email: user.email, name: user.name },
      userId,
      source: { type: "AUTH", id: userId },
      payload: {
        customerName: user.name,
        verificationUrl,
      },
    });
  }

  async sendPasswordReset(
    userId: string,
    user: Pick<UserDocument, "name" | "email">,
    resetUrl: string,
    scope: string,
  ) {
    return this.sendTemplate(`auth:${userId}:password_reset:${scope}`, {
      template: "PASSWORD_RESET",
      to: { email: user.email, name: user.name },
      userId,
      source: { type: "AUTH", id: userId },
      payload: {
        customerName: user.name,
        resetUrl,
      },
    });
  }

  async sendOrderPlaced(orderId: string) {
    const { order, recipient, payload } = await this.readOrderContext(orderId);
    return this.sendTemplate(`order:${orderId}:placed`, {
      template: "ORDER_PLACED",
      to: recipient,
      userId: order.userId,
      source: { type: "ORDER", id: orderId },
      payload,
    });
  }

  async sendPaymentReceived(orderId: string, paymentId: string) {
    const { order, recipient, payload } = await this.readOrderContext(orderId);
    return this.sendTemplate(`payment:${paymentId}:received`, {
      template: "PAYMENT_RECEIVED",
      to: recipient,
      userId: order.userId,
      source: { type: "PAYMENT", id: paymentId },
      payload: { ...payload, paymentId },
    });
  }

  async sendPaymentFailed(paymentId: string, reason: string | null) {
    const paymentSnapshot = await this.firestore
      .collection("payments")
      .doc(paymentId)
      .get();
    if (!paymentSnapshot.exists) {
      throw new DomainError("NOT_FOUND", "Payment does not exist.");
    }
    const payment = paymentDocumentSchema.parse(paymentSnapshot.data());
    const { order, recipient, payload } = await this.readOrderContext(
      payment.orderId,
    );
    return this.sendTemplate(`payment:${paymentId}:failed`, {
      template: "PAYMENT_FAILED",
      to: recipient,
      userId: order.userId,
      source: { type: "PAYMENT", id: paymentId },
      payload: {
        ...payload,
        reason: reason ?? paymentText(payment.failureCode),
      },
    });
  }

  async sendOrderShipped(orderId: string) {
    const { order, recipient, payload } = await this.readOrderContext(orderId);
    if (!order.trackingNumber) return null;
    return this.sendTemplate(`order:${orderId}:shipped`, {
      template: "ORDER_SHIPPED",
      to: recipient,
      userId: order.userId,
      source: { type: "ORDER", id: orderId },
      payload: { ...payload, trackingNumber: order.trackingNumber },
    });
  }

  async sendOrderDelivered(orderId: string) {
    const { order, recipient, payload } = await this.readOrderContext(orderId);
    return this.sendTemplate(`order:${orderId}:delivered`, {
      template: "ORDER_DELIVERED",
      to: recipient,
      userId: order.userId,
      source: { type: "ORDER", id: orderId },
      payload,
    });
  }

  async sendOrderCancelled(orderId: string, reason: string | null) {
    const { order, recipient, payload } = await this.readOrderContext(orderId);
    return this.sendTemplate(`order:${orderId}:cancelled`, {
      template: "ORDER_CANCELLED",
      to: recipient,
      userId: order.userId,
      source: { type: "ORDER", id: orderId },
      payload: { ...payload, reason },
    });
  }

  async sendRefundInitiated(refundId: string) {
    const context = await this.readRefundContext(refundId);
    return this.sendTemplate(`refund:${refundId}:initiated`, {
      template: "REFUND_INITIATED",
      to: context.recipient,
      userId: context.order.userId,
      source: { type: "REFUND", id: refundId },
      payload: context.payload,
    });
  }

  async sendRefundCompleted(refundId: string) {
    const context = await this.readRefundContext(refundId);
    return this.sendTemplate(`refund:${refundId}:completed`, {
      template: "REFUND_COMPLETED",
      to: context.recipient,
      userId: context.order.userId,
      source: { type: "REFUND", id: refundId },
      payload: context.payload,
    });
  }

  async sendRefundFailed(refundId: string) {
    const context = await this.readRefundContext(refundId);
    return this.sendTemplate(`refund:${refundId}:failed`, {
      template: "REFUND_FAILED",
      to: context.recipient,
      userId: context.order.userId,
      source: { type: "REFUND", id: refundId },
      payload: context.payload,
    });
  }

  async sendReturnRequested(returnId: string) {
    const context = await this.readReturnContext(returnId);
    return this.sendTemplate(`return:${returnId}:requested`, {
      template: "RETURN_REQUESTED",
      to: context.recipient,
      userId: context.order.userId,
      source: { type: "RETURN", id: returnId },
      payload: context.payload,
    });
  }

  async sendReturnUpdated(returnId: string) {
    const context = await this.readReturnContext(returnId);
    return this.sendTemplate(
      `return:${returnId}:${context.payload.status.toLowerCase()}`,
      {
        template: "RETURN_UPDATED",
        to: context.recipient,
        userId: context.order.userId,
        source: { type: "RETURN", id: returnId },
        payload: context.payload,
      },
    );
  }

  private storedDelivery(
    snapshot: DocumentSnapshot,
    rendered?: RenderedEmail,
  ): StoredEmailDelivery {
    const data = snapshot.data() as Partial<StoredEmailDelivery> | undefined;
    if (!data) {
      throw new DomainError("NOT_FOUND", "Email delivery does not exist.");
    }
    const fallback = rendered ?? {
      subject: String(data.subject ?? ""),
      previewText: String(data.previewText ?? ""),
      textBody: String(data.textBody ?? ""),
      htmlBody: String(data.htmlBody ?? ""),
    };
    return {
      idempotencyKey: snapshot.id,
      template: data.template as EmailTemplateKey,
      to: data.to as EmailRecipient,
      from: data.from as EmailSender,
      userId: data.userId ?? null,
      source: data.source as EmailSource,
      subject: data.subject ?? fallback.subject,
      previewText: data.previewText ?? fallback.previewText,
      textBody: data.textBody ?? fallback.textBody,
      htmlBody: data.htmlBody ?? fallback.htmlBody,
      status: data.status ?? "PENDING",
      provider: data.provider ?? this.provider.name,
      providerMessageId: data.providerMessageId ?? null,
      attempts: Number(data.attempts ?? 0),
      lastError: data.lastError ?? null,
      nextAttemptAt: data.nextAttemptAt ?? null,
    };
  }

  private async readUser(userId: string) {
    const snapshot = await this.firestore.collection("users").doc(userId).get();
    if (!snapshot.exists) {
      throw new DomainError("NOT_FOUND", "User profile does not exist.");
    }
    return userDocumentSchema.parse(snapshot.data());
  }

  private async readOrderContext(orderId: string) {
    const orderSnapshot = await this.firestore
      .collection("orders")
      .doc(orderId)
      .get();
    if (!orderSnapshot.exists) {
      throw new DomainError("NOT_FOUND", "Order does not exist.");
    }
    const order = orderDocumentSchema.parse(orderSnapshot.data());
    const user = await this.readUser(order.userId);
    const recipient = normalizeRecipient(user);
    return {
      order,
      user,
      recipient,
      payload: payloadFromOrder(
        recipient.name ?? "Bazm customer",
        orderId,
        order,
        appLink(`/account?order=${encodeURIComponent(orderId)}`),
      ),
    };
  }

  private async readRefundContext(refundId: string) {
    const refundSnapshot = await this.firestore
      .collection("refunds")
      .doc(refundId)
      .get();
    if (!refundSnapshot.exists) {
      throw new DomainError("NOT_FOUND", "Refund does not exist.");
    }
    const refund = refundDocumentSchema.parse(refundSnapshot.data());
    const { order, recipient, payload } = await this.readOrderContext(
      refund.orderId,
    );
    return {
      order,
      recipient,
      payload: {
        ...payload,
        refundId,
        refundAmount: refund.amount as Money,
        reason: refund.reason,
      },
    };
  }

  private async readReturnContext(returnId: string) {
    const returnSnapshot = await this.firestore
      .collection("returns")
      .doc(returnId)
      .get();
    if (!returnSnapshot.exists) {
      throw new DomainError("NOT_FOUND", "Return does not exist.");
    }
    const returnRequest = returnDocumentSchema.parse(returnSnapshot.data());
    const { order, recipient, payload } = await this.readOrderContext(
      returnRequest.orderId,
    );
    return {
      order,
      recipient,
      payload: {
        ...payload,
        returnId,
        status: returnRequest.status,
      },
    };
  }
}
