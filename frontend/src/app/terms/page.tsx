import { InformationPage } from "@/components/store/information-page";
import { publicMetadata } from "@/lib/seo/config";

export const metadata = publicMetadata({
  description:
    "Review the Bazm terms covering accounts, orders, pricing, payments, delivery, returns, acceptable use, and liability.",
  path: "/terms",
  title: "Terms of use and sale",
});

export default function TermsPage() {
  return (
    <InformationPage
      eyebrow="Last updated 29 August 2026"
      intro="These terms apply when you browse Bazm, create an account, or place an order. The policies and totals shown for a specific order form part of that purchase."
      sections={[
        {
          title: "Accounts and acceptable use",
          body: (
            <p>
              Provide accurate information, protect your sign-in details, and
              tell us promptly about suspected misuse. Do not probe, disrupt,
              automate abusive traffic, upload harmful material, impersonate
              another person, evade purchase limits, or use Bazm unlawfully.
            </p>
          ),
        },
        {
          title: "Products, prices, and availability",
          body: (
            <p>
              We aim for accurate descriptions, images, prices, and stock, but
              displays can vary and genuine errors can occur. Prices are in PKR
              unless stated otherwise. Adding an item to a cart does not reserve
              it; a time-limited inventory reservation is created during
              checkout when stock is available.
            </p>
          ),
        },
        {
          title: "Orders and payment",
          body: (
            <p>
              Submitting checkout is an offer to purchase at the displayed
              total. An order may require verification or payment action and can
              be rejected or cancelled for unavailable stock, invalid pricing,
              suspected fraud, provider failure, delivery constraints, or legal
              reasons. Never pay using instructions received outside official
              Bazm checkout and support channels.
            </p>
          ),
        },
        {
          title: "Delivery, returns, and refunds",
          body: (
            <p>
              The Shipping and Returns pages apply together with the delivery
              method, charges, and policy version captured for your order.
              Refund timing can depend on inspection, the original payment
              route, and the provider or bank.
            </p>
          ),
        },
        {
          title: "Content and reviews",
          body: (
            <p>
              Bazm branding, catalogue content, software, and design may not be
              copied or exploited without permission. When you submit a review
              or evidence, you confirm it is lawful, relevant, and yours to
              share. We may moderate content that breaches these terms while
              preserving honest criticism.
            </p>
          ),
        },
        {
          title: "Responsibility and changes",
          body: (
            <p>
              Nothing in these terms excludes a right or responsibility that
              cannot lawfully be excluded. To the extent permitted by applicable
              law, Bazm is not responsible for indirect loss or events outside
              reasonable control. We may update these terms prospectively; the
              date above identifies the published version.
            </p>
          ),
        },
      ]}
      title="Terms of use and sale"
    />
  );
}
