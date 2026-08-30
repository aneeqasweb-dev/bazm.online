import { InformationPage } from "@/components/store/information-page";
import { publicMetadata } from "@/lib/seo/config";

export const metadata = publicMetadata({
  description:
    "Answers to common Bazm questions about orders, delivery, payments, returns, accounts, and product availability.",
  path: "/faq",
  title: "Frequently asked questions",
});

export default function FaqPage() {
  return (
    <InformationPage
      eyebrow="Help centre"
      intro="Quick answers to the questions customers ask most often. Your checkout summary and order history remain the source of truth for a specific purchase."
      sections={[
        {
          title: "How do I know my order was placed?",
          body: (
            <p>
              A successful checkout creates an order number and shows the order
              in your Account area. We also send a transactional message when
              the configured email service accepts it.
            </p>
          ),
        },
        {
          title: "Which payment methods are available?",
          body: (
            <p>
              The methods enabled for your order appear at checkout.
              Availability can depend on the order, delivery area, and payment
              provider. Do not transfer funds using instructions received
              outside Bazm.
            </p>
          ),
        },
        {
          title: "Can I change or cancel an order?",
          body: (
            <p>
              An unpaid order can be cancelled from the Account area when that
              action is offered. Once processing begins, contact support as soon
              as possible; dispatch may make a change impossible.
            </p>
          ),
        },
        {
          title: "When will an unavailable size return?",
          body: (
            <p>
              Stock is tracked by size and colour. A product page only offers a
              combination that is currently active, but an item may sell out
              before checkout completes.
            </p>
          ),
        },
        {
          title: "How do returns and refunds work?",
          body: (
            <p>
              Start with the Returns page and the policy shown in your order.
              Eligibility is checked against the policy version captured for
              that purchase. Approved refunds are returned through the available
              payment route after inspection.
            </p>
          ),
        },
      ]}
      title="Frequently asked questions"
    />
  );
}
