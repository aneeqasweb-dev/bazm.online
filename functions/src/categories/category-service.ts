import {
  categoryDocumentSchema,
  createCategoryInputSchema,
  documentIdSchema,
  DomainError,
  slugSchema,
  updateCategoryInputSchema,
  type CategoryDocument,
} from "@bazm/domain";
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";

const maxCategoryDepth = 3;
const maxReorderSize = 100;

export const createCategoryCommandSchema = createCategoryInputSchema.extend({
  sortOrder: z.number().int().min(0).max(9_999).default(0),
});

export const updateCategoryCommandSchema = updateCategoryInputSchema
  .extend({
    sortOrder: z.number().int().min(0).max(9_999).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one category field to update.",
  });

export const categoryStatusCommandSchema = z
  .object({
    id: documentIdSchema,
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  })
  .strict();

export const reorderCategoriesCommandSchema = z
  .object({
    parentId: documentIdSchema.nullable(),
    categoryIds: z.array(documentIdSchema).min(1).max(maxReorderSize),
  })
  .strict()
  .refine(
    (value) => new Set(value.categoryIds).size === value.categoryIds.length,
    {
      message: "Each category can appear only once in a reorder request.",
      path: ["categoryIds"],
    },
  );

function categoryReference(firestore: Firestore, id: string) {
  return firestore.collection("categories").doc(id);
}

function slugReference(firestore: Firestore, slug: string) {
  return firestore.collection("slugRegistry").doc(`category_${slug}`);
}

function categoryFromSnapshot(
  snapshot: Awaited<ReturnType<DocumentReference["get"]>>,
): CategoryDocument {
  if (!snapshot.exists) {
    throw new DomainError("NOT_FOUND", "The category does not exist.");
  }
  return categoryDocumentSchema.parse(snapshot.data());
}

async function resolveParent(
  transaction: Transaction,
  firestore: Firestore,
  parentId: string | null,
  categoryId?: string,
) {
  if (parentId === null) {
    return { depth: 0 };
  }

  const seen = new Set<string>();
  let currentId: string | null = parentId;
  let parent: CategoryDocument | null = null;

  while (currentId !== null) {
    if (currentId === categoryId || seen.has(currentId)) {
      throw new DomainError(
        "PRECONDITION_FAILED",
        "Category parents cannot form a cycle.",
      );
    }
    seen.add(currentId);
    const current = categoryFromSnapshot(
      await transaction.get(categoryReference(firestore, currentId)),
    );
    if (current.status === "ARCHIVED") {
      throw new DomainError(
        "PRECONDITION_FAILED",
        "An archived category cannot be used as a parent.",
      );
    }
    parent ??= current;
    currentId = current.parentId;
  }

  const depth = (parent?.depth ?? -1) + 1;
  if (depth > maxCategoryDepth) {
    throw new DomainError(
      "PRECONDITION_FAILED",
      `A category hierarchy cannot be deeper than ${maxCategoryDepth + 1} levels.`,
    );
  }
  return { depth };
}

async function loadDescendants(
  transaction: Transaction,
  firestore: Firestore,
  rootId: string,
) {
  const descendants: Array<{ id: string; category: CategoryDocument }> = [];
  let parentIds = [rootId];

  for (let level = 0; level < maxCategoryDepth; level += 1) {
    const nextParentIds: string[] = [];
    for (const parentId of parentIds) {
      const snapshot = await transaction.get(
        firestore
          .collection("categories")
          .where("parentId", "==", parentId)
          .limit(maxReorderSize),
      );
      if (snapshot.size === maxReorderSize) {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "This category branch is too large to move in one operation.",
        );
      }
      for (const document of snapshot.docs) {
        const category = categoryDocumentSchema.parse(document.data());
        descendants.push({ id: document.id, category });
        nextParentIds.push(document.id);
      }
    }
    parentIds = nextParentIds;
    if (parentIds.length === 0) break;
  }

  return descendants;
}

export class CategoryService {
  constructor(private readonly firestore: Firestore) {}

  async create(input: z.input<typeof createCategoryCommandSchema>) {
    const command = createCategoryCommandSchema.parse(input);
    return this.firestore.runTransaction(async (transaction) => {
      const parent = await resolveParent(
        transaction,
        this.firestore,
        command.parentId,
      );
      const reference = this.firestore.collection("categories").doc();
      const registry = slugReference(this.firestore, command.slug);
      const existingSlug = await transaction.get(registry);
      if (existingSlug.exists) {
        throw new DomainError(
          "CONFLICT",
          "That category slug is already in use.",
        );
      }

      transaction.create(reference, {
        name: command.name,
        slug: command.slug,
        parentId: command.parentId,
        depth: parent.depth,
        sortOrder: command.sortOrder,
        image: command.image,
        seo: command.seo,
        status: "DRAFT",
        archivedAt: null,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(registry, {
        type: "CATEGORY",
        ownerId: reference.id,
        slug: command.slug,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { id: reference.id };
    });
  }

  async update(id: string, input: z.input<typeof updateCategoryCommandSchema>) {
    const categoryId = documentIdSchema.parse(id);
    const command = updateCategoryCommandSchema.parse(input);
    return this.firestore.runTransaction(async (transaction) => {
      const reference = categoryReference(this.firestore, categoryId);
      const existing = categoryFromSnapshot(await transaction.get(reference));
      if (existing.status === "ARCHIVED") {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "Restore an archived category before editing it.",
        );
      }

      const hasParentChange =
        Object.hasOwn(command, "parentId") &&
        command.parentId !== existing.parentId;
      const nextParentId: string | null = hasParentChange
        ? (command.parentId ?? null)
        : existing.parentId;
      const parent = hasParentChange
        ? await resolveParent(
            transaction,
            this.firestore,
            nextParentId,
            categoryId,
          )
        : { depth: existing.depth };
      const descendants = hasParentChange
        ? await loadDescendants(transaction, this.firestore, categoryId)
        : [];
      const depthDelta = parent.depth - existing.depth;
      if (
        descendants.some(
          ({ category }) => category.depth + depthDelta > maxCategoryDepth,
        )
      ) {
        throw new DomainError(
          "PRECONDITION_FAILED",
          `Moving this category would exceed the ${maxCategoryDepth + 1}-level hierarchy limit.`,
        );
      }

      if (command.slug && command.slug !== existing.slug) {
        const nextRegistry = slugReference(this.firestore, command.slug);
        const existingRegistry = await transaction.get(nextRegistry);
        if (existingRegistry.exists) {
          throw new DomainError(
            "CONFLICT",
            "That category slug is already in use.",
          );
        }
        transaction.create(nextRegistry, {
          type: "CATEGORY",
          ownerId: categoryId,
          slug: command.slug,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.delete(slugReference(this.firestore, existing.slug));
      }

      const patch: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (command.name !== undefined) patch.name = command.name;
      if (command.slug !== undefined) patch.slug = command.slug;
      if (command.image !== undefined) patch.image = command.image;
      if (command.seo !== undefined) patch.seo = command.seo;
      if (command.sortOrder !== undefined) patch.sortOrder = command.sortOrder;
      if (hasParentChange) {
        patch.parentId = nextParentId;
        patch.depth = parent.depth;
      }
      transaction.update(reference, patch);
      for (const descendant of descendants) {
        transaction.update(categoryReference(this.firestore, descendant.id), {
          depth: descendant.category.depth + depthDelta,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return { id: categoryId };
    });
  }

  async setStatus(input: z.input<typeof categoryStatusCommandSchema>) {
    const command = categoryStatusCommandSchema.parse(input);
    return this.firestore.runTransaction(async (transaction) => {
      const reference = categoryReference(this.firestore, command.id);
      const category = categoryFromSnapshot(await transaction.get(reference));

      if (command.status === "ARCHIVED") {
        const activeChildren = await transaction.get(
          this.firestore
            .collection("categories")
            .where("parentId", "==", command.id)
            .where("status", "==", "ACTIVE")
            .limit(1),
        );
        if (!activeChildren.empty) {
          throw new DomainError(
            "PRECONDITION_FAILED",
            "Archive active child categories before archiving this category.",
          );
        }
      }

      if (command.status === "ACTIVE" && category.parentId) {
        const parent = categoryFromSnapshot(
          await transaction.get(
            categoryReference(this.firestore, category.parentId),
          ),
        );
        if (parent.status !== "ACTIVE") {
          throw new DomainError(
            "PRECONDITION_FAILED",
            "Activate the parent category before this category.",
          );
        }
      }

      transaction.update(reference, {
        status: command.status,
        archivedAt:
          command.status === "ARCHIVED" ? FieldValue.serverTimestamp() : null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { id: command.id, status: command.status };
    });
  }

  async reorder(input: z.input<typeof reorderCategoriesCommandSchema>) {
    const command = reorderCategoriesCommandSchema.parse(input);
    return this.firestore.runTransaction(async (transaction) => {
      const siblings = await transaction.get(
        this.firestore
          .collection("categories")
          .where("parentId", "==", command.parentId)
          .orderBy("sortOrder")
          .limit(maxReorderSize),
      );
      if (siblings.size === maxReorderSize) {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "This sibling group is too large to reorder in one operation.",
        );
      }
      const siblingIds = siblings.docs.map((document) => document.id).sort();
      const requestedIds = [...command.categoryIds].sort();
      if (
        siblingIds.length !== requestedIds.length ||
        siblingIds.some((id, index) => id !== requestedIds[index])
      ) {
        throw new DomainError(
          "INVALID_ARGUMENT",
          "A reorder request must include every category at that hierarchy level.",
        );
      }
      command.categoryIds.forEach((id, sortOrder) => {
        transaction.update(categoryReference(this.firestore, id), {
          sortOrder,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      return { reordered: command.categoryIds.length };
    });
  }

  async assertSlugAvailable(slug: string) {
    const parsedSlug = slugSchema.parse(slug);
    const snapshot = await slugReference(this.firestore, parsedSlug).get();
    return !snapshot.exists;
  }
}
