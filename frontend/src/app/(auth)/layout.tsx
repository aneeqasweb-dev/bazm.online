import type { ReactNode } from "react";

import { FirebaseBrowserIntegrations } from "@/components/providers/firebase-browser-integrations";
import { privateMetadata } from "@/lib/seo/config";

export const metadata = privateMetadata(
  "Account access",
  "Bazm account access pages are private utility pages and are not intended for search indexing.",
);

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <FirebaseBrowserIntegrations />
      {children}
    </>
  );
}
