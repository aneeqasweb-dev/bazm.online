import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  DomainError,
  decodeCursor,
  encodeCursor,
  moneySchema,
  pageRequestSchema,
  quantitySchema,
  skuSchema,
  slugSchema,
} from "./primitives.js";

describe("domain primitives", () => {
  it("normalizes SKU and slug identifiers without accepting malformed values", () => {
    expect(skuSchema.parse(" w-drs-lin-blk-m ")).toBe("W-DRS-LIN-BLK-M");
    expect(slugSchema.parse(" Linen-Midi-Dress ")).toBe("linen-midi-dress");
    expect(skuSchema.safeParse("sku with spaces").success).toBe(false);
    expect(slugSchema.safeParse("two--hyphens").success).toBe(false);
  });

  it("uses integer minor units and bounded quantities", () => {
    expect(moneySchema.parse({ amountMinor: 4_999, currency: "PKR" })).toEqual({
      amountMinor: 4_999,
      currency: "PKR",
    });
    expect(
      moneySchema.safeParse({ amountMinor: 1.5, currency: "PKR" }).success,
    ).toBe(false);
    expect(quantitySchema.safeParse(0).success).toBe(false);
    expect(quantitySchema.safeParse(1_000).success).toBe(false);
  });

  it("uses opaque versioned cursors and refuses offsets or forged cursors", () => {
    const cursor = encodeCursor({
      id: "product-1",
      value: "2026-08-29T12:00:00Z",
    });
    expect(decodeCursor(cursor)).toEqual({
      id: "product-1",
      value: "2026-08-29T12:00:00Z",
    });
    expect(decodeCursor("v1.not-valid")).toBeNull();
    expect(pageRequestSchema.parse({})).toEqual({
      limit: DEFAULT_PAGE_SIZE,
      cursor: null,
    });
    expect(pageRequestSchema.safeParse({ limit: 101, offset: 0 }).success).toBe(
      false,
    );
  });

  it("provides stable safe error codes", () => {
    const error = new DomainError("FORBIDDEN", "You cannot edit this record.");
    expect(error.name).toBe("DomainError");
    expect(error.code).toBe("FORBIDDEN");
  });
});
