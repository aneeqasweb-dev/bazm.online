import {
  DomainError,
  documentIdSchema,
  inventoryDocumentSchema,
  inventoryReservationDocumentSchema,
  inventoryReservationLineSchema,
  productDocumentSchema,
  productVariantDocumentSchema,
  quantitySchema,
  skuSchema,
  type ReturnDocument,
} from "@bazm/domain";
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";

const reasonSchema = z.string().trim().min(3).max(500);
const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/, "Use a safe idempotency key.");

export const receiveInventoryCommandSchema = z
  .object({
    productId: documentIdSchema,
    variantId: documentIdSchema,
    sku: skuSchema,
    quantity: quantitySchema,
    reason: reasonSchema,
  })
  .strict();
export const inventoryAdjustmentCommandSchema = z
  .object({
    sku: skuSchema,
    delta: z.number().int().min(-999).max(999).refine(Boolean),
    reason: reasonSchema,
  })
  .strict();
export const inventoryQuantityCommandSchema = z
  .object({ sku: skuSchema, quantity: quantitySchema, reason: reasonSchema })
  .strict();
export const reserveInventoryCommandSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    lines: z
      .array(inventoryReservationLineSchema)
      .min(1)
      .max(20)
      .superRefine((lines, context) => {
        const seen = new Set<string>();
        for (const [index, line] of lines.entries()) {
          if (seen.has(line.sku))
            context.addIssue({
              code: "custom",
              path: [index, "sku"],
              message: "Each SKU may only appear once.",
            });
          seen.add(line.sku);
        }
      }),
  })
  .strict();
export const reservationIdCommandSchema = z
  .object({ reservationId: documentIdSchema })
  .strict();

type ReturnReceiptCondition = "RESELLABLE" | "DAMAGED";

type CounterDeltas = {
  available: number;
  reserved: number;
  sold: number;
  returned: number;
  damaged: number;
};

const zeroDeltas: CounterDeltas = {
  available: 0,
  reserved: 0,
  sold: 0,
  returned: 0,
  damaged: 0,
};

function timestampDate(value: Date | { toDate: () => Date }) {
  return value instanceof Date ? value : value.toDate();
}

function correlationId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function reservationReference(
  firestore: Firestore,
  userId: string,
  idempotencyKey: string,
) {
  return firestore
    .collection("inventoryReservations")
    .doc(`${userId}_${idempotencyKey}`);
}

function inventoryReference(firestore: Firestore, sku: string) {
  return firestore.collection("inventory").doc(sku);
}

function returnInventoryEventReference(firestore: Firestore, returnId: string) {
  return firestore.collection("returnInventoryEvents").doc(returnId);
}

function assertNonNegative(
  inventory: z.infer<typeof inventoryDocumentSchema>,
  deltas: CounterDeltas,
) {
  const next = {
    available: inventory.available + deltas.available,
    reserved: inventory.reserved + deltas.reserved,
    sold: inventory.sold + deltas.sold,
    returned: inventory.returned + deltas.returned,
    damaged: inventory.damaged + deltas.damaged,
  };
  if (Object.values(next).some((value) => value < 0))
    throw new DomainError(
      "PRECONDITION_FAILED",
      "This operation would make an inventory counter negative.",
    );
  return next;
}

async function requiredInventory(
  transaction: Transaction,
  reference: DocumentReference,
) {
  const snapshot = await transaction.get(reference);
  if (!snapshot.exists)
    throw new DomainError("NOT_FOUND", "The SKU is not stocked yet.");
  return inventoryDocumentSchema.parse(snapshot.data());
}

function writeLedger(
  transaction: Transaction,
  firestore: Firestore,
  input: {
    sku: string;
    type:
      | "RECEIPT"
      | "ADJUSTMENT"
      | "RESERVATION"
      | "RESERVATION_RELEASE"
      | "SALE"
      | "RETURN"
      | "DAMAGE";
    reason: string;
    actorId: string | null;
    orderId?: string | null;
    deltas: CounterDeltas;
    resultingAvailable: number;
    correlationId: string;
  },
) {
  transaction.create(firestore.collection("inventoryTransactions").doc(), {
    sku: input.sku,
    type: input.type,
    delta: input.deltas.available,
    counterDeltas: input.deltas,
    reason: input.reason,
    actorId: input.actorId,
    orderId: input.orderId ?? null,
    resultingAvailable: input.resultingAvailable,
    correlationId: input.correlationId,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function writeAudit(
  transaction: Transaction,
  firestore: Firestore,
  input: {
    actorId: string | null;
    targetType: string;
    targetId: string | null;
    correlationId: string;
    metadata: Record<string, string | number | boolean>;
  },
) {
  transaction.create(firestore.collection("auditLogs").doc(), {
    action: "INVENTORY",
    actorId: input.actorId,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata,
    correlationId: input.correlationId,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export class InventoryService {
  constructor(private readonly firestore: Firestore) {}

  async receiveReturnInTransaction(
    transaction: Transaction,
    input: {
      returnId: string;
      orderId: string;
      actorId: string;
      condition: ReturnReceiptCondition;
      items: ReturnDocument["items"];
      restoreResellableStock: boolean;
    },
  ) {
    const eventRef = returnInventoryEventReference(
      this.firestore,
      input.returnId,
    );
    const eventSnapshot = await transaction.get(eventRef);
    if (eventSnapshot.exists) {
      return { idempotent: true };
    }

    const quantitiesBySku = new Map<string, number>();
    for (const item of input.items) {
      quantitiesBySku.set(
        item.sku,
        (quantitiesBySku.get(item.sku) ?? 0) + item.quantity,
      );
    }

    const inventoryRows = await Promise.all(
      [...quantitiesBySku].map(async ([sku, quantity]) => {
        const reference = inventoryReference(this.firestore, sku);
        return {
          sku,
          quantity,
          reference,
          inventory: await requiredInventory(transaction, reference),
        };
      }),
    );

    const correlation = `return_${input.returnId.slice(0, 100)}`;
    for (const { sku, quantity, reference, inventory } of inventoryRows) {
      const deltas =
        input.condition === "RESELLABLE"
          ? {
              ...zeroDeltas,
              available: input.restoreResellableStock ? quantity : 0,
              returned: quantity,
            }
          : {
              ...zeroDeltas,
              damaged: quantity,
            };
      const next = assertNonNegative(inventory, deltas);
      transaction.update(reference, {
        ...next,
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeLedger(transaction, this.firestore, {
        sku,
        type: input.condition === "RESELLABLE" ? "RETURN" : "DAMAGE",
        reason:
          input.condition === "RESELLABLE"
            ? "Returned item received as resellable."
            : "Returned item received as damaged.",
        actorId: input.actorId,
        orderId: input.orderId,
        deltas,
        resultingAvailable: next.available,
        correlationId: correlation,
      });
    }

    transaction.create(eventRef, {
      returnId: input.returnId,
      orderId: input.orderId,
      condition: input.condition,
      restoreResellableStock: input.restoreResellableStock,
      itemCount: input.items.length,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
    });
    writeAudit(transaction, this.firestore, {
      actorId: input.actorId,
      targetType: "returnInventoryEvent",
      targetId: input.returnId,
      correlationId: correlation,
      metadata: {
        type: input.condition === "RESELLABLE" ? "RETURN" : "DAMAGE",
        itemCount: input.items.length,
      },
    });
    return { idempotent: false };
  }

  async receive(
    input: z.input<typeof receiveInventoryCommandSchema>,
    actorId: string,
  ) {
    const command = receiveInventoryCommandSchema.parse(input);
    const correlation = correlationId("inventory-receipt");
    return this.firestore.runTransaction(async (transaction) => {
      const productRef = this.firestore
        .collection("products")
        .doc(command.productId);
      const variantRef = productRef
        .collection("variants")
        .doc(command.variantId);
      const [productSnapshot, variantSnapshot, inventorySnapshot] =
        await Promise.all([
          transaction.get(productRef),
          transaction.get(variantRef),
          transaction.get(inventoryReference(this.firestore, command.sku)),
        ]);
      if (!productSnapshot.exists || !variantSnapshot.exists)
        throw new DomainError(
          "NOT_FOUND",
          "The selected product option is missing.",
        );
      productDocumentSchema.parse(productSnapshot.data());
      const variant = productVariantDocumentSchema.parse(
        variantSnapshot.data(),
      );
      if (
        variant.productId !== command.productId ||
        variant.sku !== command.sku
      )
        throw new DomainError(
          "PRECONDITION_FAILED",
          "The selected SKU does not belong to that product option.",
        );
      const reference = inventoryReference(this.firestore, command.sku);
      const current = inventorySnapshot.exists
        ? inventoryDocumentSchema.parse(inventorySnapshot.data())
        : null;
      if (
        current &&
        (current.productId !== command.productId ||
          current.variantId !== command.variantId)
      )
        throw new DomainError(
          "CONFLICT",
          "This SKU belongs to another option.",
        );
      const next = current
        ? assertNonNegative(current, {
            ...zeroDeltas,
            available: command.quantity,
          })
        : {
            available: command.quantity,
            reserved: 0,
            sold: 0,
            returned: 0,
            damaged: 0,
          };
      transaction.set(
        reference,
        {
          sku: command.sku,
          productId: command.productId,
          variantId: command.variantId,
          ...next,
          reorderPoint: current?.reorderPoint ?? 0,
          reservedUntil: current?.reservedUntil ?? null,
          schemaVersion: 1,
          createdAt: current?.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      const deltas = { ...zeroDeltas, available: command.quantity };
      writeLedger(transaction, this.firestore, {
        sku: command.sku,
        type: "RECEIPT",
        reason: command.reason,
        actorId,
        deltas,
        resultingAvailable: next.available,
        correlationId: correlation,
      });
      writeAudit(transaction, this.firestore, {
        actorId,
        targetType: "inventory",
        targetId: command.sku,
        correlationId: correlation,
        metadata: { type: "RECEIPT", quantity: command.quantity },
      });
      return { sku: command.sku, available: next.available };
    });
  }

  async adjust(
    input: z.input<typeof inventoryAdjustmentCommandSchema>,
    actorId: string,
  ) {
    const command = inventoryAdjustmentCommandSchema.parse(input);
    const correlation = correlationId("inventory-adjustment");
    return this.mutateExisting({
      sku: command.sku,
      actorId,
      reason: command.reason,
      type: "ADJUSTMENT",
      deltas: { ...zeroDeltas, available: command.delta },
      correlation,
    });
  }

  async restoreReturn(
    input: z.input<typeof inventoryQuantityCommandSchema>,
    actorId: string,
  ) {
    const command = inventoryQuantityCommandSchema.parse(input);
    const correlation = correlationId("inventory-return");
    return this.mutateExisting({
      sku: command.sku,
      actorId,
      reason: command.reason,
      type: "RETURN",
      deltas: {
        ...zeroDeltas,
        available: command.quantity,
        returned: command.quantity,
      },
      correlation,
    });
  }

  async recordDamage(
    input: z.input<typeof inventoryQuantityCommandSchema>,
    actorId: string,
  ) {
    const command = inventoryQuantityCommandSchema.parse(input);
    const correlation = correlationId("inventory-damage");
    return this.mutateExisting({
      sku: command.sku,
      actorId,
      reason: command.reason,
      type: "DAMAGE",
      deltas: {
        ...zeroDeltas,
        available: -command.quantity,
        damaged: command.quantity,
      },
      correlation,
    });
  }

  private async mutateExisting(input: {
    sku: string;
    actorId: string | null;
    reason: string;
    type: "ADJUSTMENT" | "RETURN" | "DAMAGE";
    deltas: CounterDeltas;
    correlation: string;
  }) {
    return this.firestore.runTransaction(async (transaction) => {
      const reference = inventoryReference(this.firestore, input.sku);
      const current = await requiredInventory(transaction, reference);
      const next = assertNonNegative(current, input.deltas);
      transaction.update(reference, {
        ...next,
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeLedger(transaction, this.firestore, {
        sku: input.sku,
        type: input.type,
        reason: input.reason,
        actorId: input.actorId,
        deltas: input.deltas,
        resultingAvailable: next.available,
        correlationId: input.correlation,
      });
      writeAudit(transaction, this.firestore, {
        actorId: input.actorId,
        targetType: "inventory",
        targetId: input.sku,
        correlationId: input.correlation,
        metadata: {
          type: input.type,
          quantity: Math.abs(input.deltas.available),
        },
      });
      return { sku: input.sku, available: next.available };
    });
  }

  async reserve(
    input: z.input<typeof reserveInventoryCommandSchema>,
    userId: string,
  ) {
    const command = reserveInventoryCommandSchema.parse(input);
    const reference = reservationReference(
      this.firestore,
      userId,
      command.idempotencyKey,
    );
    const reservationId = reference.id;
    const expiresAt = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
    const correlation = `reservation_${reservationId}`;
    return this.firestore.runTransaction(async (transaction) => {
      const existing = await transaction.get(reference);
      if (existing.exists) {
        const reservation = inventoryReservationDocumentSchema.parse(
          existing.data(),
        );
        return {
          reservationId,
          status: reservation.status,
          reservedUntil: timestampDate(reservation.reservedUntil).toISOString(),
          idempotent: true,
        };
      }
      const inventories = await Promise.all(
        command.lines.map(async (line) => ({
          line,
          reference: inventoryReference(this.firestore, line.sku),
          inventory: await requiredInventory(
            transaction,
            inventoryReference(this.firestore, line.sku),
          ),
        })),
      );
      for (const { line, reference: inventoryRef, inventory } of inventories) {
        if (inventory.available < line.quantity)
          throw new DomainError(
            "PRECONDITION_FAILED",
            `Only ${inventory.available} of ${line.sku} are available.`,
          );
        const deltas = {
          ...zeroDeltas,
          available: -line.quantity,
          reserved: line.quantity,
        };
        const next = assertNonNegative(inventory, deltas);
        transaction.update(inventoryRef, {
          ...next,
          reservedUntil: expiresAt,
          updatedAt: FieldValue.serverTimestamp(),
        });
        writeLedger(transaction, this.firestore, {
          sku: line.sku,
          type: "RESERVATION",
          reason: "Checkout inventory reservation.",
          actorId: userId,
          deltas,
          resultingAvailable: next.available,
          correlationId: correlation,
        });
      }
      transaction.create(reference, {
        userId,
        idempotencyKey: command.idempotencyKey,
        status: "ACTIVE",
        lines: command.lines,
        reservedUntil: expiresAt,
        finalizedAt: null,
        releasedAt: null,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeAudit(transaction, this.firestore, {
        actorId: userId,
        targetType: "inventoryReservation",
        targetId: reservationId,
        correlationId: correlation,
        metadata: { type: "RESERVATION", lineCount: command.lines.length },
      });
      return {
        reservationId,
        status: "ACTIVE" as const,
        reservedUntil: expiresAt.toDate().toISOString(),
        idempotent: false,
      };
    });
  }

  async release(
    reservationId: string,
    actorId: string | null,
    reason: string,
    status: "RELEASED" | "EXPIRED" = "RELEASED",
  ) {
    const id = documentIdSchema.parse(reservationId);
    return this.firestore.runTransaction((transaction) =>
      this.releaseInTransaction(transaction, id, actorId, reason, status),
    );
  }

  async releaseInTransaction(
    transaction: Transaction,
    reservationId: string,
    actorId: string | null,
    reason: string,
    status: "RELEASED" | "EXPIRED" = "RELEASED",
  ) {
    const id = documentIdSchema.parse(reservationId);
    const reference = this.firestore
      .collection("inventoryReservations")
      .doc(id);
    const correlation = `release_${id}`;
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists)
      throw new DomainError(
        "NOT_FOUND",
        "The inventory reservation is missing.",
      );
    const reservation = inventoryReservationDocumentSchema.parse(
      snapshot.data(),
    );
    if (reservation.status !== "ACTIVE")
      return {
        reservationId: id,
        status: reservation.status,
        idempotent: true,
      };
    const inventories = await Promise.all(
      reservation.lines.map(async (line) => ({
        line,
        reference: inventoryReference(this.firestore, line.sku),
        inventory: await requiredInventory(
          transaction,
          inventoryReference(this.firestore, line.sku),
        ),
      })),
    );
    for (const { line, reference: inventoryRef, inventory } of inventories) {
      const deltas = {
        ...zeroDeltas,
        available: line.quantity,
        reserved: -line.quantity,
      };
      const next = assertNonNegative(inventory, deltas);
      transaction.update(inventoryRef, {
        ...next,
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeLedger(transaction, this.firestore, {
        sku: line.sku,
        type: "RESERVATION_RELEASE",
        reason,
        actorId,
        deltas,
        resultingAvailable: next.available,
        correlationId: correlation,
      });
    }
    transaction.update(reference, {
      status,
      releasedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeAudit(transaction, this.firestore, {
      actorId,
      targetType: "inventoryReservation",
      targetId: id,
      correlationId: correlation,
      metadata: {
        type: "RESERVATION_RELEASE",
        lineCount: reservation.lines.length,
      },
    });
    return { reservationId: id, status, idempotent: false };
  }

  async finalize(reservationId: string, actorId: string | null) {
    const id = documentIdSchema.parse(reservationId);
    return this.firestore.runTransaction((transaction) =>
      this.finalizeInTransaction(transaction, id, actorId),
    );
  }

  async finalizeInTransaction(
    transaction: Transaction,
    reservationId: string,
    actorId: string | null,
  ) {
    const id = documentIdSchema.parse(reservationId);
    const reference = this.firestore
      .collection("inventoryReservations")
      .doc(id);
    const correlation = `finalize_${id}`;
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists)
      throw new DomainError(
        "NOT_FOUND",
        "The inventory reservation is missing.",
      );
    const reservation = inventoryReservationDocumentSchema.parse(
      snapshot.data(),
    );
    if (reservation.status !== "ACTIVE")
      return {
        reservationId: id,
        status: reservation.status,
        idempotent: true,
      };
    if (timestampDate(reservation.reservedUntil).getTime() <= Date.now())
      throw new DomainError(
        "PRECONDITION_FAILED",
        "This inventory reservation has expired.",
      );
    for (const line of reservation.lines) {
      const inventoryRef = inventoryReference(this.firestore, line.sku);
      const inventory = await requiredInventory(transaction, inventoryRef);
      const deltas = {
        ...zeroDeltas,
        reserved: -line.quantity,
        sold: line.quantity,
      };
      const next = assertNonNegative(inventory, deltas);
      transaction.update(inventoryRef, {
        ...next,
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeLedger(transaction, this.firestore, {
        sku: line.sku,
        type: "SALE",
        reason: "Payment finalized an inventory reservation.",
        actorId,
        deltas,
        resultingAvailable: next.available,
        correlationId: correlation,
      });
    }
    transaction.update(reference, {
      status: "FINALIZED",
      finalizedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeAudit(transaction, this.firestore, {
      actorId,
      targetType: "inventoryReservation",
      targetId: id,
      correlationId: correlation,
      metadata: { type: "SALE", lineCount: reservation.lines.length },
    });
    return {
      reservationId: id,
      status: "FINALIZED" as const,
      idempotent: false,
    };
  }

  async expireActiveReservations(now = new Date()) {
    const expired = await this.firestore
      .collection("inventoryReservations")
      .where("status", "==", "ACTIVE")
      .where("reservedUntil", "<=", Timestamp.fromDate(now))
      .limit(50)
      .get();
    let released = 0;
    for (const reservation of expired.docs) {
      const result = await this.release(
        reservation.id,
        null,
        "Expired inventory reservation released automatically.",
        "EXPIRED",
      );
      if (!result.idempotent) released += 1;
    }
    return { released };
  }
}
