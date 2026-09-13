import Link from "next/link";

import { AnalyticsConsent } from "@/components/providers/analytics-consent";

export function StoreShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-50">
      <header className="border-b border-stone-800">
        <nav
          aria-label="Primary navigation"
          className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-8"
        >
          <Link className="text-lg font-semibold tracking-tight" href="/">
            Bazm
          </Link>
          <div className="hidden items-center gap-6 text-sm text-stone-300 md:flex">
            <Link className="hover:text-amber-200" href="/shop">
              Shop
            </Link>
            <Link className="hover:text-amber-200" href="/formal-wear">
              Formal Wear
            </Link>
            <Link className="hover:text-amber-200" href="/mens-wear">
              Men&apos;s Wear
            </Link>
            <Link className="hover:text-amber-200" href="/accessories">
              Accessories
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              aria-label="Search the catalog"
              className="hidden rounded-full border border-stone-700 px-3 py-2 hover:border-amber-300 sm:inline-flex"
              href="/shop"
            >
              Search
            </Link>
            <Link
              aria-label="Your wishlist"
              className="rounded-full border border-stone-700 px-3 py-2 hover:border-amber-300"
              href="/wishlist"
            >
              Wishlist
            </Link>
            <Link
              aria-label="Your account"
              className="rounded-full border border-stone-700 px-3 py-2 hover:border-amber-300"
              href="/account"
            >
              Account
            </Link>
            <Link
              aria-label="Your cart"
              className="rounded-full bg-amber-300 px-3 py-2 font-medium text-stone-950"
              href="/cart"
            >
              Cart
            </Link>
          </div>
        </nav>
        <nav
          aria-label="Collection navigation"
          className="flex gap-5 overflow-x-auto border-t border-stone-800 px-5 py-3 text-sm text-stone-300 md:hidden"
        >
          <Link className="shrink-0 hover:text-amber-200" href="/shop">
            Shop
          </Link>
          <Link className="shrink-0 hover:text-amber-200" href="/formal-wear">
            Formal Wear
          </Link>
          <Link className="shrink-0 hover:text-amber-200" href="/mens-wear">
            Men&apos;s Wear
          </Link>
          <Link className="shrink-0 hover:text-amber-200" href="/accessories">
            Accessories
          </Link>
        </nav>
      </header>
      {children}
      <footer className="border-t border-stone-800 px-5 py-10 text-sm text-stone-400 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_2fr]">
          <p>© 2026 Bazm. Considered fashion, Pakistan.</p>
          <nav
            aria-label="Footer navigation"
            className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4"
          >
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/shipping">Shipping</Link>
            <Link href="/returns">Returns</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/account">Account</Link>
          </nav>
        </div>
      </footer>
      <AnalyticsConsent />
    </div>
  );
}
