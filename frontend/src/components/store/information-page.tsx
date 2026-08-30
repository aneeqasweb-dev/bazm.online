import Link from "next/link";

import { StoreShell } from "@/components/store/store-shell";

export type InformationSection = {
  body: React.ReactNode;
  title: string;
};

export function InformationPage({
  eyebrow,
  intro,
  sections,
  title,
}: {
  eyebrow: string;
  intro: string;
  sections: InformationSection[];
  title: string;
}) {
  return (
    <StoreShell>
      <main className="px-5 py-14 sm:px-8 sm:py-20">
        <article className="mx-auto max-w-4xl">
          <p className="text-sm font-medium tracking-[0.3em] text-amber-300 uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-300">
            {intro}
          </p>
          <div className="mt-12 space-y-10">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-2xl font-semibold">{section.title}</h2>
                <div className="mt-4 space-y-4 leading-7 text-stone-300 [&_a]:text-amber-200 [&_a]:underline [&_li]:ml-5 [&_li]:list-disc">
                  {section.body}
                </div>
              </section>
            ))}
          </div>
          <div className="mt-14 rounded-2xl border border-stone-800 bg-stone-900 p-6">
            <h2 className="text-lg font-semibold">Still need help?</h2>
            <p className="mt-2 text-stone-300">
              Visit our <Link href="/contact">contact page</Link> and include
              your order number when your question is about an existing order.
            </p>
          </div>
        </article>
      </main>
    </StoreShell>
  );
}
