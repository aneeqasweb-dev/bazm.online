import Link from "next/link";

import { AnalyticsConsent } from "@/components/providers/analytics-consent";

function StoreIcon({ name }: { name: "search" | "heart" | "account" | "bag" }) {
  const paths = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
    ),
    account: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2" />
      </>
    ),
    bag: (
      <>
        <path d="M5 7h14l1 14H4L5 7Z" />
        <path d="M8.5 8V5a3.5 3.5 0 0 1 7 0v3" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

const collections = [
  ["Shop all", "/shop"],
  ["New arrivals", "/shop?sort=NEWEST"],
  ["Occasion wear", "/formal-wear"],
  ["Women", "/women"],
  ["Men", "/mens-wear"],
  ["Shoes", "/shoes"],
  ["Bags", "/bags"],
  ["Accessories", "/accessories"],
];

export function StoreShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="storefront min-h-screen bg-stone-950 text-stone-50">
      <div className="store-announcement">
        Rooted in tradition. Made for today.{" "}
        <span>Discover the new edit →</span>
      </div>
      <header className="store-header">
        <nav aria-label="Primary navigation" className="store-nav">
          <Link className="store-wordmark" href="/" aria-label="Bazm home">
            bazm<span>THE ART OF GATHERING</span>
          </Link>
          <div className="store-desktop-links">
            {collections.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </div>
          <div className="store-actions">
            <Link
              aria-label="Search the catalog"
              title="Search"
              href="/shop#catalog-query"
            >
              <StoreIcon name="search" />
            </Link>
            <Link aria-label="Your wishlist" title="Wishlist" href="/wishlist">
              <StoreIcon name="heart" />
            </Link>
            <Link aria-label="Your account" title="Account" href="/account">
              <StoreIcon name="account" />
            </Link>
            <Link aria-label="Your cart" title="Shopping bag" href="/cart">
              <StoreIcon name="bag" />
            </Link>
          </div>
        </nav>
        <nav aria-label="Collection navigation" className="store-mobile-links">
          {collections.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
      <footer className="store-footer">
        <div className="store-footer-grid">
          <div>
            <Link className="store-wordmark" href="/">
              bazm
            </Link>
            <p>
              A gathering of beautiful things.
              <br />
              Contemporary Pakistani style for the everyday and the
              extraordinary.
            </p>
          </div>
          <nav aria-label="Shop collections">
            <h2>Explore</h2>
            {collections
              .filter(([, href]) => !href.includes("?"))
              .map(([label, href]) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
          </nav>
          <nav aria-label="Customer care">
            <h2>Here to help</h2>
            <Link href="/contact">Contact us</Link>
            <Link href="/shipping">Shipping & delivery</Link>
            <Link href="/returns">Returns & exchanges</Link>
            <Link href="/faq">Frequently asked questions</Link>
          </nav>
          <nav aria-label="About Bazm">
            <h2>The world of Bazm</h2>
            <Link href="/about">Our story</Link>
            <Link href="/account">My account</Link>
            <Link href="/wishlist">My wishlist</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms & conditions</Link>
          </nav>
        </div>
        <div className="store-footer-bottom">
          <span>© 2026 Bazm · Pakistan</span>
          <span>Portfolio demo · Sample catalog · Test checkout</span>
        </div>
      </footer>
      <AnalyticsConsent />
    </div>
  );
}
