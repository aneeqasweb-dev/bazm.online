import "server-only";

import { returnPolicySchema, settingsDocumentSchema } from "@bazm/domain";
import { cache } from "react";

import { getServerFirestore } from "@/lib/firebase/admin";

export const getCustomerReturnPolicy = cache(async () => {
  const snapshot = await getServerFirestore()
    .collection("settings")
    .doc("returns.policy")
    .get();
  if (!snapshot.exists) {
    return returnPolicySchema.parse({});
  }
  const settings = settingsDocumentSchema.parse(snapshot.data());
  return returnPolicySchema.parse(settings.value);
});
