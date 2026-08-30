import { z } from "zod";

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 24;

export const documentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .regex(/^[^/]+$/, "A document ID must be one Firestore path segment.");

export const userIdSchema = documentIdSchema.max(128);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

export const customerNameSchema = z.string().trim().min(2).max(80);

export const pakistanPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+92\d{10}$/, "Use a Pakistani number such as +923001234567.");

export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3)
  .max(64)
  .regex(
    /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
    "Use uppercase letters, numbers, and single hyphens for a SKU.",
  );

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(100)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and single hyphens for a slug.",
  );

export const currencySchema = z.enum(["PKR"]);
export type Currency = z.infer<typeof currencySchema>;

export const moneySchema = z
  .object({
    amountMinor: z.number().int().min(0).max(999_999_999),
    currency: currencySchema,
  })
  .strict();

export const positiveMoneySchema = moneySchema.refine(
  (money) => money.amountMinor > 0,
  { message: "The amount must be greater than zero.", path: ["amountMinor"] },
);

export type Money = z.infer<typeof moneySchema>;

export const quantitySchema = z.number().int().min(1).max(999);
export const nonNegativeQuantitySchema = z.number().int().min(0).max(9_999_999);

export const percentageSchema = z.number().min(0).max(100);

export const pakistanProvinceSchema = z.enum([
  "AZAD_KASHMIR",
  "BALOCHISTAN",
  "GILGIT_BALTISTAN",
  "ISLAMABAD_CAPITAL_TERRITORY",
  "KHYBER_PAKHTUNKHWA",
  "PUNJAB",
  "SINDH",
]);

export const addressSchema = z
  .object({
    recipientName: customerNameSchema,
    phone: pakistanPhoneSchema,
    line1: z.string().trim().min(3).max(120),
    line2: z.string().trim().min(1).max(120).nullable(),
    area: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    province: pakistanProvinceSchema,
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/),
    deliveryInstructions: z.string().trim().min(1).max(300).nullable(),
  })
  .strict();

export type Address = z.infer<typeof addressSchema>;

export type FirestoreTimestamp = Date | { toDate: () => Date };

export const firestoreTimestampSchema = z.custom<FirestoreTimestamp>(
  (value) => {
    if (value instanceof Date) {
      return !Number.isNaN(value.getTime());
    }

    return (
      typeof value === "object" &&
      value !== null &&
      "toDate" in value &&
      typeof value.toDate === "function" &&
      !Number.isNaN(value.toDate().getTime())
    );
  },
  "Expected a Firestore timestamp.",
);

export const documentTimestampsSchema = z
  .object({
    createdAt: firestoreTimestampSchema,
    updatedAt: firestoreTimestampSchema,
  })
  .strict();

export const schemaVersionSchema = z.number().int().min(1).max(999);

export const cursorPayloadSchema = z
  .object({
    id: documentIdSchema,
    value: z.string().min(1).max(200),
  })
  .strict();

export type CursorPayload = z.infer<typeof cursorPayloadSchema>;

export function encodeCursor(payload: CursorPayload) {
  return `v1.${encodeURIComponent(
    JSON.stringify(cursorPayloadSchema.parse(payload)),
  )}`;
}

export function decodeCursor(cursor: string): CursorPayload | null {
  if (!cursor.startsWith("v1.")) {
    return null;
  }

  try {
    return cursorPayloadSchema.parse(
      JSON.parse(decodeURIComponent(cursor.slice(3))),
    );
  } catch {
    return null;
  }
}

export const pageRequestSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(DEFAULT_PAGE_SIZE),
    cursor: z.string().min(4).max(512).nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.cursor && !decodeCursor(value.cursor)) {
      context.addIssue({
        code: "custom",
        path: ["cursor"],
        message: "The page cursor is invalid.",
      });
    }
  });

export type PageRequest = z.infer<typeof pageRequestSchema>;

export type PageResult<T> = {
  items: T[];
  nextCursor: string | null;
};

export const domainErrorCodeSchema = z.enum([
  "INVALID_ARGUMENT",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "INTERNAL",
]);

export type DomainErrorCode = z.infer<typeof domainErrorCodeSchema>;

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
