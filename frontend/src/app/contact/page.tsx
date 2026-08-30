import { InformationPage } from "@/components/store/information-page";
import { publicMetadata } from "@/lib/seo/config";

export const metadata = publicMetadata({
  description:
    "Contact Bazm customer support for order, delivery, return, payment, or account assistance.",
  path: "/contact",
  title: "Contact Bazm",
});

export default function ContactPage() {
  return (
    <InformationPage
      eyebrow="Customer care"
      intro="Send us the details once and our support team will route your question to the right person."
      sections={[
        {
          title: "Email support",
          body: (
            <>
              <p>
                Email{" "}
                <a href="mailto:support@bazm.online">support@bazm.online</a>.
                Include your order number, but never send a password, one-time
                code, complete card number, or payment credential.
              </p>
              <p>
                We aim to acknowledge messages within two business days. During
                launches and public holidays, a complete resolution may take
                longer.
              </p>
            </>
          ),
        },
        {
          title: "Order and return help",
          body: (
            <p>
              Signed-in customers can open the Account area to review an order,
              request an eligible return, or create a support ticket linked to
              an order.
            </p>
          ),
        },
        {
          title: "Security and privacy",
          body: (
            <p>
              Report a suspected account or security issue to the same address
              with “Security” in the subject. Privacy requests should use
              “Privacy request” so they can be handled separately from ordinary
              support.
            </p>
          ),
        },
      ]}
      title="How can we help?"
    />
  );
}
