import { InformationPage } from "@/components/store/information-page";
import { publicMetadata } from "@/lib/seo/config";

export const metadata = publicMetadata({
  description:
    "Read the Bazm privacy notice covering account, order, payment, support, security, analytics, retention, and customer rights.",
  path: "/privacy",
  title: "Privacy notice",
});

export default function PrivacyPage() {
  return (
    <InformationPage
      eyebrow="Last updated 29 August 2026"
      intro="This notice explains what personal information Bazm handles, why it is needed, and the choices available when you use our store."
      sections={[
        {
          title: "Information we handle",
          body: (
            <ul className="space-y-2">
              <li>Account identity, contact details, and sign-in status.</li>
              <li>
                Delivery addresses, order contents, returns, and support
                messages.
              </li>
              <li>
                Payment status and provider references, but not complete card
                credentials.
              </li>
              <li>
                Security, device, diagnostic, and audit events needed to prevent
                abuse.
              </li>
              <li>Analytics data only after you grant analytics consent.</li>
            </ul>
          ),
        },
        {
          title: "Why we use it",
          body: (
            <p>
              We use information to operate accounts, fulfil orders, calculate
              eligibility, communicate service updates, prevent fraud, maintain
              records, comply with applicable obligations, resolve disputes, and
              improve Bazm where consent or another valid basis permits it.
            </p>
          ),
        },
        {
          title: "Services and disclosures",
          body: (
            <p>
              Bazm uses service providers for hosting and authentication,
              storage, payments, transactional email, delivery, monitoring, and
              consented analytics. They receive only the information needed for
              their role and are expected to protect it. We may also disclose
              information when lawfully required or to protect customers and the
              service.
            </p>
          ),
        },
        {
          title: "Analytics choice",
          body: (
            <p>
              Analytics collection is off until you accept it in the privacy
              choices panel. Declining does not disable essential
              authentication, security, cart, checkout, or order functions. You
              can reopen the panel from the “Privacy choices” button and change
              your decision.
            </p>
          ),
        },
        {
          title: "Retention and security",
          body: (
            <p>
              We keep information only as long as needed for the purposes above,
              required records, security, backup recovery, or dispute handling.
              Access is restricted by role; sensitive provider credentials stay
              on trusted servers; logs and backups follow controlled retention
              schedules. No online system can promise absolute security.
            </p>
          ),
        },
        {
          title: "Your requests",
          body: (
            <p>
              Contact{" "}
              <a href="mailto:support@bazm.online">support@bazm.online</a> with
              “Privacy request” to ask about access, correction, deletion, or
              another applicable privacy right. We may need to verify your
              identity and may retain information where an obligation or valid
              exception applies.
            </p>
          ),
        },
      ]}
      title="Privacy notice"
    />
  );
}
