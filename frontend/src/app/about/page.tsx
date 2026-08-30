import { InformationPage } from "@/components/store/information-page";
import { publicMetadata } from "@/lib/seo/config";

export const metadata = publicMetadata({
  description:
    "Learn about Bazm, a Pakistan-first destination for considered contemporary fashion.",
  path: "/about",
  title: "About Bazm",
});

export default function AboutPage() {
  return (
    <InformationPage
      eyebrow="Our story"
      intro="Bazm means a gathering. We built the store around that idea: thoughtful pieces for everyday life, celebrations, and all the moments in between."
      sections={[
        {
          title: "Considered style",
          body: (
            <p>
              Our catalogue brings women&apos;s, men&apos;s, and children&apos;s
              fashion into one clear shopping experience. We favour useful
              silhouettes, lasting materials, honest product information, and
              imagery that helps customers choose with confidence.
            </p>
          ),
        },
        {
          title: "Built for Pakistan",
          body: (
            <p>
              Prices are displayed in Pakistani rupees, addresses support local
              provinces and territories, and delivery and support policies are
              designed for customers shopping within Pakistan.
            </p>
          ),
        },
        {
          title: "A store that earns trust",
          body: (
            <p>
              We use clear order states, verified reviews, secure payments, and
              versioned return policies. If something is unclear, we would
              rather explain it than hide it in small print.
            </p>
          ),
        },
      ]}
      title="A modern gathering of style."
    />
  );
}
