import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { coreListQueryDefinitions } from "../functions/lib/data/query-definitions.js";

const indexes = JSON.parse(
  await readFile(
    new URL("../firebase/firestore.indexes.json", import.meta.url),
  ),
);

for (const definition of coreListQueryDefinitions) {
  const requiredFields = [
    ...definition.filters.map((fieldPath) => ({
      fieldPath,
      order: "ASCENDING",
    })),
    { fieldPath: definition.sort.field, order: definition.sort.direction },
  ];
  const match = indexes.indexes.find(
    (index) =>
      index.collectionGroup === definition.collection &&
      index.queryScope === "COLLECTION" &&
      JSON.stringify(index.fields) === JSON.stringify(requiredFields),
  );

  assert.ok(match, `Missing composite index for ${definition.name}.`);
}

assert.equal(indexes.indexes.length, coreListQueryDefinitions.length);
console.log("Phase 3 query definitions all have matching composite indexes.");
