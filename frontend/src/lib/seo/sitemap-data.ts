import "server-only";

import {
  categoryDocumentSchema,
  productDocumentSchema,
  type CategoryDocument,
} from "@bazm/domain";
import type { Firestore } from "firebase-admin/firestore";
import type { MetadataRoute } from "next";

import { getServerFirestore } from "@/lib/firebase/admin";
import { absoluteUrl } from "@/lib/seo/config";

type TimestampLike = Date | { toDate: () => Date } | null | undefined;

type CategoryRecord = {
  category: CategoryDocument;
  id: string;
};

function timestampToDate(value: TimestampLike) {
  if (!value) return undefined;
  return value instanceof Date ? value : value.toDate();
}

function categorySegments(
  categoryId: string,
  categories: Map<string, CategoryRecord>,
  seen = new Set<string>(),
): string[] | null {
  if (seen.has(categoryId)) return null;
  seen.add(categoryId);

  const record = categories.get(categoryId);
  if (!record || record.category.status !== "ACTIVE") return null;
  if (record.category.parentId === null) return [record.category.slug];

  const parentSegments = categorySegments(
    record.category.parentId,
    categories,
    seen,
  );
  return parentSegments ? [...parentSegments, record.category.slug] : null;
}

async function categoryHasRegisteredRoute(
  database: Firestore,
  id: string,
  slug: string,
) {
  const registry = await database
    .collection("slugRegistry")
    .doc(`category_${slug}`)
    .get();
  return registry.get("ownerId") === id;
}

async function productHasRegisteredRoute(
  database: Firestore,
  id: string,
  slug: string,
) {
  const registry = await database
    .collection("slugRegistry")
    .doc(`product_${slug}`)
    .get();
  return registry.get("ownerId") === id;
}

export async function listPublicSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const database = getServerFirestore();
  const [categorySnapshot, productSnapshot] = await Promise.all([
    database
      .collection("categories")
      .where("status", "==", "ACTIVE")
      .limit(1_000)
      .get(),
    database
      .collection("products")
      .where("status", "==", "PUBLISHED")
      .limit(5_000)
      .get(),
  ]);

  const categoryRecords = await Promise.all(
    categorySnapshot.docs.map(async (document) => {
      const category = categoryDocumentSchema.parse(document.data());
      return (await categoryHasRegisteredRoute(
        database,
        document.id,
        category.slug,
      ))
        ? { category, id: document.id }
        : null;
    }),
  );

  const categories = new Map(
    categoryRecords
      .filter((record): record is CategoryRecord => record !== null)
      .map((record) => [record.id, record]),
  );

  const staticEntries: MetadataRoute.Sitemap = [
    {
      changeFrequency: "daily",
      priority: 1,
      url: absoluteUrl("/"),
    },
    {
      changeFrequency: "daily",
      priority: 0.9,
      url: absoluteUrl("/shop"),
    },
    ...[
      "/about",
      "/contact",
      "/faq",
      "/privacy",
      "/returns",
      "/shipping",
      "/terms",
    ].map((path) => ({
      changeFrequency: "monthly" as const,
      priority: 0.4,
      url: absoluteUrl(path),
    })),
  ];

  const categoryEntries = [...categories.values()]
    .map((record) => {
      const segments = categorySegments(record.id, categories);
      if (!segments) return null;
      return {
        changeFrequency: "weekly" as const,
        lastModified: timestampToDate(record.category.updatedAt),
        priority: record.category.parentId === null ? 0.8 : 0.7,
        url: absoluteUrl(`/${segments.join("/")}`),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const productEntries = (
    await Promise.all(
      productSnapshot.docs.map(async (document) => {
        const product = productDocumentSchema.parse(document.data());
        if (
          !(await productHasRegisteredRoute(
            database,
            document.id,
            product.slug,
          ))
        ) {
          return null;
        }
        return {
          changeFrequency: "daily" as const,
          images: product.media.slice(0, 3).map((image) => image.url),
          lastModified: timestampToDate(product.updatedAt),
          priority: product.flags.featured ? 0.8 : 0.6,
          url: absoluteUrl(`/product/${product.slug}`),
        };
      }),
    )
  ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return [...staticEntries, ...categoryEntries, ...productEntries].sort(
    (left, right) => left.url.localeCompare(right.url),
  );
}
