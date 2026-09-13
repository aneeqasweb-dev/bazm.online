import "server-only";

import { getCloudinary } from "@/lib/cloudinary/server";
import { getServerFirestore } from "@/lib/firebase/admin";

export { removedMediaPaths } from "./cleanup-policy";

const OWNED_MEDIA_PREFIXES = [
  "bazm/categories/",
  "bazm/products/",
  "bazm/reviews/",
] as const;

function mediaPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    typeof item === "object" &&
    item !== null &&
    "path" in item &&
    typeof item.path === "string"
      ? [item.path]
      : [],
  );
}

function isOwnedCatalogPath(path: string) {
  return OWNED_MEDIA_PREFIXES.some((prefix) => path.startsWith(prefix));
}

async function referencedMediaPaths() {
  const database = getServerFirestore();
  const [categories, products, reviews] = await Promise.all([
    database.collection("categories").limit(500).get(),
    database.collection("products").limit(500).get(),
    database.collection("reviews").limit(500).get(),
  ]);
  const referenced = new Set<string>();

  for (const document of categories.docs) {
    const path = document.get("image.path");
    if (typeof path === "string") referenced.add(path);
  }
  for (const document of products.docs) {
    for (const path of mediaPaths(document.get("media"))) referenced.add(path);
  }
  for (const document of reviews.docs) {
    for (const path of mediaPaths(document.get("images"))) referenced.add(path);
  }
  return referenced;
}

export async function deleteUnreferencedCloudinaryMedia(paths: string[]) {
  const candidates = [...new Set(paths)].filter(isOwnedCatalogPath);
  if (candidates.length === 0) return;

  try {
    const referenced = await referencedMediaPaths();
    const results = await Promise.allSettled(
      candidates
        .filter((path) => !referenced.has(path))
        .map((path) =>
          getCloudinary().uploader.destroy(path, {
            invalidate: true,
            resource_type: "image",
          }),
        ),
    );
    if (results.some((result) => result.status === "rejected")) {
      console.warn("Some unreferenced Cloudinary media could not be deleted.");
    }
  } catch {
    // The database update has already succeeded. Cleanup is best-effort so a
    // temporary provider failure never reports the completed user action as a
    // failure or encourages a duplicate retry.
    console.warn("Cloudinary reference cleanup could not be completed.");
  }
}
