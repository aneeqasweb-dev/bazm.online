import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import type { z } from "zod";

/**
 * Validates every Firestore read at the trusted data boundary. Writes are
 * assembled by repositories so they can use server timestamp sentinels.
 */
export function createAdminFirestoreConverter<T extends DocumentData>(
  schema: z.ZodType<T>,
): FirestoreDataConverter<T> {
  return {
    toFirestore(model) {
      return model;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot) {
      return schema.parse(snapshot.data());
    },
  } as FirestoreDataConverter<T>;
}
