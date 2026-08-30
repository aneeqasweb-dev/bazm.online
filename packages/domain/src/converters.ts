import { z } from "zod";

/**
 * The narrow shape shared by Admin and browser Firestore query snapshots.
 * Keeping this SDK-agnostic allows the same validated domain contract to be
 * used by both Firebase SDKs.
 */
export type FirestoreDocumentSnapshot = {
  data: () => unknown;
};

export type FirestoreConverter<T> = {
  toFirestore: (model: T) => T;
  fromFirestore: (snapshot: FirestoreDocumentSnapshot) => T;
};

/**
 * Creates a structurally compatible Firestore converter that rejects malformed
 * historical documents at the repository boundary instead of leaking unknown
 * data into application services.
 */
export function createFirestoreConverter<T>(
  schema: z.ZodType<T>,
): FirestoreConverter<T> {
  return {
    toFirestore: (model) => schema.parse(model),
    fromFirestore: (snapshot) => schema.parse(snapshot.data()),
  };
}
