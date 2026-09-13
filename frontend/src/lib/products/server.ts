import "server-only";

import {
  adminProductReadSchema,
  productDocumentSchema,
  type CategoryDocument,
} from "@bazm/domain";
import { cache } from "react";

import { getServerFirestore } from "@/lib/firebase/admin";

export type AdminProduct = ReturnType<typeof adminProductReadSchema.parse>;

export const listAdminProducts = cache(async (): Promise<AdminProduct[]> => {
  const snapshot = await getServerFirestore()
    .collection("products")
    .orderBy("updatedAt", "desc")
    .limit(100)
    .get();
  return snapshot.docs.map((document) =>
    adminProductReadSchema.parse({
      id: document.id,
      ...productDocumentSchema.parse(document.data()),
    }),
  );
});

export type ProductCategoryOption = Pick<
  CategoryDocument,
  "name" | "status" | "depth"
> & { id: string };

export const listProductCategories = cache(
  async (): Promise<ProductCategoryOption[]> => {
    const snapshot = await getServerFirestore()
      .collection("categories")
      .orderBy("sortOrder")
      .limit(100)
      .get();
    return snapshot.docs
      .map((document) => {
        const category = document.data() as CategoryDocument;
        return {
          id: document.id,
          name: category.name,
          status: category.status,
          depth: category.depth,
        };
      })
      .filter((category) => category.status === "ACTIVE");
  },
);
