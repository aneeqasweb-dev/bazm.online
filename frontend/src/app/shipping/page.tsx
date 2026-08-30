import { InformationPage } from "@/components/store/information-page";
import { publicMetadata } from "@/lib/seo/config";

export const metadata = publicMetadata({
  description:
    "Read how Bazm delivery options, charges, tracking, address changes, and delivery exceptions work in Pakistan.",
  path: "/shipping",
  title: "Shipping and delivery",
});

export default function ShippingPage() {
  return (
    <InformationPage
      eyebrow="Delivery information"
      intro="Delivery choices and charges are calculated before you place an order. The checkout summary is the binding delivery record for that purchase."
      sections={[
        {
          title: "Coverage and charges",
          body: (
            <p>
              Bazm&apos;s initial delivery service is within Pakistan. Standard
              and express options may be offered depending on the address,
              courier coverage, order value, and item availability. Any charge
              is shown in Pakistani rupees before payment.
            </p>
          ),
        },
        {
          title: "Dispatch and delivery estimates",
          body: (
            <p>
              An estimate is not a guaranteed arrival date. Verification,
              weekends, public holidays, weather, high-volume periods, remote
              areas, and courier disruptions can change it. Tracking details
              appear in order history when the courier provides them.
            </p>
          ),
        },
        {
          title: "Address changes",
          body: (
            <p>
              Check the recipient name, phone, area, city, province, and postal
              code before ordering. Contact support immediately if something is
              wrong. We cannot promise a change after processing or dispatch.
            </p>
          ),
        },
        {
          title: "Delivery problems",
          body: (
            <p>
              If tracking shows an exception, a parcel arrives visibly damaged,
              or the order is incomplete, keep the packaging and contact support
              promptly with the order number and clear photographs where useful.
            </p>
          ),
        },
      ]}
      title="Shipping and delivery"
    />
  );
}
