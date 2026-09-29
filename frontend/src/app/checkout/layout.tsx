import type { ReactNode } from "react";
import Link from "next/link";

import { FirebaseBrowserIntegrations } from "@/components/providers/firebase-browser-integrations";
import { privateMetadata } from "@/lib/seo/config";
import { CheckoutIcon } from "./checkout-icon";
import styles from "./checkout.module.css";

export const metadata = privateMetadata(
  "Secure checkout",
  "Bazm checkout pages are private purchasing pages and are not intended for search indexing.",
);

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`storefront ${styles.shell}`}>
      <FirebaseBrowserIntegrations />
      <header className={styles.header}>
        <Link className="store-wordmark" href="/" aria-label="Bazm home">
          bazm<span>THE ART OF GATHERING</span>
        </Link>
        <span className={styles.secure}>
          <CheckoutIcon name="lock" /> Secure checkout
        </span>
        <Link className={styles.headerHelp} href="/contact">
          Need help?
        </Link>
      </header>
      {children}
      <footer className={styles.footer}>
        <span>© 2026 Bazm · Pakistan</span>
        <nav aria-label="Checkout policies">
          <Link href="/returns">Returns</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}
