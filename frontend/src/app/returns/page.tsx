import { InformationPage } from "@/components/store/information-page";
import { publicMetadata } from "@/lib/seo/config";

export const metadata = publicMetadata({
  description:
    "Understand Bazm return eligibility, request steps, inspection, stock restoration, and refund processing.",
  path: "/returns",
  title: "Returns and refunds",
});

export default function ReturnsPage() {
  return (
    <InformationPage
      eyebrow="Returns policy"
      intro="Eligible delivered items can be submitted through your Account area. The policy version saved with your order controls its return window and available reasons."
      sections={[
        {
          title: "Return window and eligibility",
          body: (
            <p>
              The current baseline is 14 calendar days after delivery, but the
              policy attached to your order is authoritative. Items should be
              unworn, unwashed, unused, and returned with original tags and
              packaging where applicable. Hygiene-sensitive, personalized,
              final-sale, or damaged-by-use items may be ineligible when clearly
              disclosed before purchase.
            </p>
          ),
        },
        {
          title: "Start a return",
          body: (
            <ol className="space-y-2">
              <li>Open Account and select the delivered order.</li>
              <li>Choose eligible items, quantities, and the return reason.</li>
              <li>Add useful notes or evidence and submit the request.</li>
              <li>Follow the return instructions sent by support.</li>
            </ol>
          ),
        },
        {
          title: "Inspection and refund",
          body: (
            <p>
              Returned items are inspected before a refund is completed. The
              approved amount cannot exceed the eligible paid amount. Bank and
              provider processing times begin after Bazm records the refund as
              completed and may vary outside our control.
            </p>
          ),
        },
        {
          title: "Wrong, incomplete, or damaged order",
          body: (
            <p>
              Contact support promptly and keep the parcel, labels, and product.
              Clear photographs help us investigate. Do not send an item to an
              address that has not been confirmed through the return process.
            </p>
          ),
        },
      ]}
      title="Returns and refunds"
    />
  );
}
