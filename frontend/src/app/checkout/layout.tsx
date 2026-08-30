import type { ReactNode } from "react";

import { FirebaseBrowserIntegrations } from "@/components/providers/firebase-browser-integrations";
import { privateMetadata } from "@/lib/seo/config";

export const metadata = privateMetadata(
  "Secure checkout",
  "Bazm checkout pages are private purchasing pages and are not intended for search indexing.",
);

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <FirebaseBrowserIntegrations />
      {children}
    </>
  );
}
