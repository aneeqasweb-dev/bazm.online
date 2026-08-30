"use client";

import { useEffect } from "react";

export function FirebaseBrowserIntegrations() {
  useEffect(() => {
    void import("@/lib/firebase/browser-integrations")
      .then(({ initializeFirebaseAppCheck }) => initializeFirebaseAppCheck())
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : "Unknown error";
        console.error(
          "Firebase browser integrations failed to initialize:",
          reason,
        );
      });
  }, []);

  return null;
}
