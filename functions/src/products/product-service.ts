import {
  categoryDocumentSchema,
  createProductInputSchema,
  createProductVariantInputSchema,
  documentIdSchema,
  DomainError,
  productDocumentSchema,
  productVariantDocumentSchema,
  updateProductInputSchema,
  updateProductVariantInputSchema,
  type CategoryDocument,
} from "@bazm/domain";
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";

export const createProductCommandSchema = createProductInputSchema;
export const updateProductCommandSchema = updateProductInputSchema.refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one product field to update." },
);
export const createVariantCommandSchema = z
  .object({
    productId: documentIdSchema,
    variant: createProductVariantInputSchema,
  })
  .strict();
export const updateVariantCommandSchema = z
  .object({
    productId: documentIdSchema,
    variantId: documentIdSchema,
    variant: updateProductVariantInputSchema.refine(
      (value) => Object.keys(value).length > 0,
      { message: "Provide at least one variant field to update." },
    ),
  })
  .strict();
export const productStatusCommandSchema = z
  .object({
    id: documentIdSchema,
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  })
  .strict();

function normalizedSearchTokens(...values: string[]) {
  return [
    ...new Set(
      values
        .flatMap((value) => value.toLowerCase().match(/[a-z0-9]+/g) ?? [])
        .filter((token) => token.length >= 2)
        .map((token) => token.slice(0, 30)),
    ),
  ].slice(0, 60);
}

function searchTokens(input: { name: string; brand: string; tags: string[] }) {
  return normalizedSearchTokens(input.name, input.brand, ...input.tags);
}

function productReference(firestore: Firestore, id: string) {
  return firestore.collection("products").doc(id);
}

function slugReference(firestore: Firestore, slug: string) {
  return firestore.collection("slugRegistry").doc(`product_${slug}`);
}

function skuReference(firestore: Firestore, sku: string) {
  return firestore.collection("skuRegistry").doc(sku);
}

function requiredDocument<T>(
  snapshot: Awaited<ReturnType<DocumentReference["get"]>>,
  parser: z.ZodType<T>,
  message: string,
): T {
  if (!snapshot.exists) throw new DomainError("NOT_FOUND", message);
  return parser.parse(snapshot.data());
}

async function categoryPath(
  transaction: Transaction,
  firestore: Firestore,
  categoryId: string,
  requireActive: boolean,
) {
  const path: string[] = [];
  let currentId: string | null = categoryId;
  while (currentId) {
    const category: CategoryDocument = requiredDocument(
      await transaction.get(firestore.collection("categories").doc(currentId)),
      categoryDocumentSchema,
      "The selected category does not exist.",
    );
    if (
      category.status === "ARCHIVED" ||
      (requireActive && category.status !== "ACTIVE")
    ) {
      throw new DomainError(
        "PRECONDITION_FAILED",
        "Products can only use an active, non-archived category path.",
      );
    }
    path.unshift(currentId);
    currentId = category.parentId;
  }
  return path;
}

export class ProductService {
  constructor(private readonly firestore: Firestore) {}

  async create(input: z.input<typeof createProductCommandSchema>) {
    const command = createProductCommandSchema.parse(input);
    return this.firestore.runTransaction(async (transaction) => {
      const categoryIds = await categoryPath(
        transaction,
        this.firestore,
        command.categoryId,
        false,
      );
      const registry = slugReference(this.firestore, command.slug);
      if ((await transaction.get(registry)).exists) {
        throw new DomainError(
          "CONFLICT",
          "That product slug is already in use.",
        );
      }
      const reference = this.firestore.collection("products").doc();
      transaction.create(reference, {
        ...command,
        categoryPath: categoryIds,
        searchTokens: searchTokens(command),
        ratingSummary: { average: 0, count: 0 },
        status: "DRAFT",
        publishedAt: null,
        archivedAt: null,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(registry, {
        type: "PRODUCT",
        ownerId: reference.id,
        slug: command.slug,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { id: reference.id };
    });
  }

  async update(id: string, input: z.input<typeof updateProductCommandSchema>) {
    const productId = documentIdSchema.parse(id);
    const command = updateProductCommandSchema.parse(input);
    return this.firestore.runTransaction(async (transaction) => {
      const reference = productReference(this.firestore, productId);
      const product = requiredDocument(
        await transaction.get(reference),
        productDocumentSchema,
        "The product does not exist.",
      );
      if (product.status === "ARCHIVED") {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "Restore an archived product before editing it.",
        );
      }
      const patch: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (command.categoryId !== undefined) {
        patch.categoryId = command.categoryId;
        patch.categoryPath = await categoryPath(
          transaction,
          this.firestore,
          command.categoryId,
          false,
        );
      }
      if (command.slug && command.slug !== product.slug) {
        const nextRegistry = slugReference(this.firestore, command.slug);
        if ((await transaction.get(nextRegistry)).exists) {
          throw new DomainError(
            "CONFLICT",
            "That product slug is already in use.",
          );
        }
        transaction.create(nextRegistry, {
          type: "PRODUCT",
          ownerId: productId,
          slug: command.slug,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.delete(slugReference(this.firestore, product.slug));
        patch.slug = command.slug;
      }
      for (const field of [
        "name",
        "brand",
        "description",
        "basePrice",
        "media",
        "tags",
        "flags",
        "seo",
      ] as const) {
        if (command[field] !== undefined) patch[field] = command[field];
      }
      if (
        command.name !== undefined ||
        command.brand !== undefined ||
        command.tags !== undefined
      ) {
        patch.searchTokens = searchTokens({
          name: command.name ?? product.name,
          brand: command.brand ?? product.brand,
          tags: command.tags ?? product.tags,
        });
      }
      transaction.update(reference, patch);
      return { id: productId };
    });
  }

  async setStatus(input: z.input<typeof productStatusCommandSchema>) {
    const command = productStatusCommandSchema.parse(input);
    return this.firestore.runTransaction(async (transaction) => {
      const reference = productReference(this.firestore, command.id);
      const product = requiredDocument(
        await transaction.get(reference),
        productDocumentSchema,
        "The product does not exist.",
      );
      if (command.status === "PUBLISHED") {
        await categoryPath(
          transaction,
          this.firestore,
          product.categoryId,
          true,
        );
        const variants = await transaction.get(
          reference
            .collection("variants")
            .where("isActive", "==", true)
            .limit(1),
        );
        if (variants.empty) {
          throw new DomainError(
            "PRECONDITION_FAILED",
            "Add an active variant before publishing this product.",
          );
        }
      }
      transaction.update(reference, {
        status: command.status,
        publishedAt:
          command.status === "PUBLISHED"
            ? FieldValue.serverTimestamp()
            : product.publishedAt,
        archivedAt:
          command.status === "ARCHIVED" ? FieldValue.serverTimestamp() : null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { id: command.id, status: command.status };
    });
  }

  async createVariant(input: z.input<typeof createVariantCommandSchema>) {
    const command = createVariantCommandSchema.parse(input);
    return this.firestore.runTransaction(async (transaction) => {
      const product = productReference(this.firestore, command.productId);
      const productData = requiredDocument(
        await transaction.get(product),
        productDocumentSchema,
        "The product does not exist.",
      );
      if (productData.status === "ARCHIVED")
        throw new DomainError(
          "PRECONDITION_FAILED",
          "Cannot add variants to an archived product.",
        );
      const registry = skuReference(this.firestore, command.variant.sku);
      if ((await transaction.get(registry)).exists)
        throw new DomainError("CONFLICT", "That SKU is already in use.");
      const reference = product.collection("variants").doc();
      transaction.create(reference, {
        ...command.variant,
        productId: command.productId,
        isActive: true,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(registry, {
        productId: command.productId,
        variantId: reference.id,
        sku: command.variant.sku,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { id: reference.id };
    });
  }

  async updateVariant(input: z.input<typeof updateVariantCommandSchema>) {
    const command = updateVariantCommandSchema.parse(input);
    return this.firestore.runTransaction(async (transaction) => {
      const product = productReference(this.firestore, command.productId);
      const reference = product.collection("variants").doc(command.variantId);
      const variant = requiredDocument(
        await transaction.get(reference),
        productVariantDocumentSchema,
        "The product variant does not exist.",
      );
      const patch: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (command.variant.sku && command.variant.sku !== variant.sku) {
        const registry = skuReference(this.firestore, command.variant.sku);
        if ((await transaction.get(registry)).exists)
          throw new DomainError("CONFLICT", "That SKU is already in use.");
        transaction.create(registry, {
          productId: command.productId,
          variantId: command.variantId,
          sku: command.variant.sku,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.delete(skuReference(this.firestore, variant.sku));
        patch.sku = command.variant.sku;
      }
      for (const field of [
        "color",
        "size",
        "priceOverride",
        "media",
      ] as const) {
        if (command.variant[field] !== undefined)
          patch[field] = command.variant[field];
      }
      transaction.update(reference, patch);
      return { id: command.variantId };
    });
  }
}
