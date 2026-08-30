import {
  FieldPath,
  FieldValue,
  type CollectionReference,
  type DocumentData,
  type Firestore,
  type Query,
  type WhereFilterOp,
} from "firebase-admin/firestore";
import {
  decodeCursor,
  documentIdSchema,
  DomainError,
  encodeCursor,
  type PageRequest,
  type PageResult,
} from "@bazm/domain";
import type { z } from "zod";

import { createAdminFirestoreConverter } from "./admin-converter.js";

type TimestampFields = {
  schemaVersion: number;
  createdAt: unknown;
  updatedAt?: unknown;
};

export type CreateDocument<T extends TimestampFields> = Omit<
  T,
  "schemaVersion" | "createdAt" | "updatedAt"
>;

export type UpdateDocument<T extends TimestampFields> = Partial<
  Omit<T, "schemaVersion" | "createdAt" | "updatedAt">
>;

export type RepositoryFilter = {
  field: string;
  operator: WhereFilterOp;
  value: unknown;
};

export type RepositoryListOptions = {
  page: PageRequest;
  filters?: RepositoryFilter[];
  sort: {
    field: string;
    direction: "asc" | "desc";
  };
};

export type RepositoryOptions = {
  collectionPath: string;
  schemaVersion?: number;
  timestamps?: "mutable" | "immutable";
};

export function toCursorValue(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  throw new DomainError(
    "INTERNAL",
    "The configured list sort field cannot be encoded as a cursor.",
  );
}

/**
 * A repository never exposes an unbounded collection read. Its cursor is
 * anchored to the source document, retaining the Firestore sort precision.
 */
export class FirestoreRepository<T extends TimestampFields & DocumentData> {
  private readonly collection: CollectionReference<DocumentData>;
  private readonly schemaVersion: number;
  private readonly mutable: boolean;

  constructor(
    firestore: Firestore,
    private readonly schema: z.ZodType<T>,
    options: RepositoryOptions,
  ) {
    this.collection = firestore.collection(options.collectionPath);
    this.schemaVersion = options.schemaVersion ?? 1;
    this.mutable = (options.timestamps ?? "mutable") === "mutable";
  }

  async get(id: string): Promise<T | null> {
    const documentId = documentIdSchema.parse(id);
    const snapshot = await this.collection
      .doc(documentId)
      .withConverter(createAdminFirestoreConverter(this.schema))
      .get();

    return snapshot.exists ? (snapshot.data() ?? null) : null;
  }

  async getOrThrow(id: string): Promise<T> {
    const document = await this.get(id);
    if (!document) {
      throw new DomainError(
        "NOT_FOUND",
        "The requested record does not exist.",
      );
    }
    return document;
  }

  async create(id: string, document: CreateDocument<T>): Promise<T> {
    const documentId = documentIdSchema.parse(id);
    const timestamps = {
      schemaVersion: this.schemaVersion,
      createdAt: FieldValue.serverTimestamp(),
      ...(this.mutable ? { updatedAt: FieldValue.serverTimestamp() } : {}),
    };

    await this.collection.doc(documentId).create({
      ...document,
      ...timestamps,
    });
    return this.getOrThrow(documentId);
  }

  async update(id: string, patch: UpdateDocument<T>): Promise<T> {
    if (!this.mutable) {
      throw new DomainError(
        "PRECONDITION_FAILED",
        "This append-only record cannot be updated.",
      );
    }

    const documentId = documentIdSchema.parse(id);
    await this.collection.doc(documentId).update({
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return this.getOrThrow(documentId);
  }

  async list(options: RepositoryListOptions): Promise<PageResult<T>> {
    let query: Query<DocumentData> = this.collection;
    for (const filter of options.filters ?? []) {
      query = query.where(filter.field, filter.operator, filter.value);
    }

    query = query
      .orderBy(options.sort.field, options.sort.direction)
      .orderBy(FieldPath.documentId(), options.sort.direction)
      .limit(options.page.limit + 1);

    if (options.page.cursor) {
      const cursor = decodeCursor(options.page.cursor);
      if (!cursor) {
        throw new DomainError(
          "INVALID_ARGUMENT",
          "The page cursor is invalid.",
        );
      }

      const anchor = await this.collection.doc(cursor.id).get();
      if (!anchor.exists) {
        throw new DomainError("INVALID_ARGUMENT", "The page cursor is stale.");
      }
      if (toCursorValue(anchor.get(options.sort.field)) !== cursor.value) {
        throw new DomainError(
          "INVALID_ARGUMENT",
          "The page cursor is invalid.",
        );
      }

      query = query.startAfter(anchor);
    }

    const snapshot = await query.get();
    const pageDocuments = snapshot.docs.slice(0, options.page.limit);
    const items = pageDocuments.map((document) =>
      this.schema.parse(document.data()),
    );
    const nextAnchor = pageDocuments.at(-1);
    const hasNextPage = snapshot.docs.length > options.page.limit;

    return {
      items,
      nextCursor:
        hasNextPage && nextAnchor
          ? encodeCursor({
              id: nextAnchor.id,
              value: toCursorValue(nextAnchor.get(options.sort.field)),
            })
          : null,
    };
  }
}
