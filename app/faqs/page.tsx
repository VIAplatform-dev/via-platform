import type { Metadata } from "next";
import FAQAccordion from "@/app/components/FAQAccordion";

export const metadata: Metadata = {
 title: "FAQs | VYA",
 description: "Answers to common questions about shopping on VYA, how it works, our stores, sourcing, and more.",
 openGraph: {
 title: "FAQs | VYA",
 description: "Answers to common questions about shopping on VYA, how it works, our stores, sourcing, and more.",
 images: [{ url: "/og-image.png", width: 1200, height: 630 }],
 },
 twitter: {
 card: "summary_large_image",
 title: "FAQs | VYA",
 description: "Answers to common questions about shopping on VYA, how it works, our stores, sourcing, and more.",
 images: ["/og-image.png"],
 },
};

export default function FAQsPage() {
  const faqs = [
    {
      q: "What is VYA?",
      a: "VYA is a platform that brings together independent vintage and secondhand stores, allowing you to browse across shops in one place while checking out directly with the store you choose.",
    },
    {
      q: "How does shopping on VYA work?",
      a: "You can browse items and stores on VYA, then when you're ready to purchase, you'll be redirected to the store's own website to complete checkout.",
    },
    {
      q: "Do I buy items directly from VYA?",
      a: "No. VYA does not process payments or hold inventory. All purchases are completed directly with the individual store.",
    },
    {
      q: "Is everything on VYA authentic?",
      a: "Yes. We partner with vetted vintage and secondhand stores known for authenticity, quality, and expertise in their categories.",
    },
    {
      q: "Who handles shipping?",
      a: "Each store ships orders directly to you using their own shipping methods, rates, and timelines.",
    },
    {
      q: "What about returns or exchanges?",
      a: "Return and exchange policies are set by each individual store. You'll find the specific policy on the store's website where you complete your purchase.",
    },
    {
      q: "Where do stores on VYA ship?",
      a: "Stores decide where they ship, but most stores ship worldwide.",
    },
    {
      q: "How are stores selected for VYA?",
      a: "Stores on VYA are carefully selected based on curation quality, authenticity standards, and overall brand alignment.",
    },
    {
      q: "Are prices on VYA different from store websites?",
      a: "No. Prices are set by each store and are the same as those listed on their own website.",
    },
    {
      q: "I'm a store owner, how can I partner with VYA?",
      a: "You can visit our Partner With VYA page to learn more and get in touch about joining the platform.",
    },
  ];

  return (
    <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
      {/* Header */}
      <section className="border-b border-[#5D0F17]/10">
        <div className="max-w-4xl mx-auto px-6 pt-8 pb-4 sm:pt-10 sm:pb-6">
          <h1 className="text-2xl sm:text-3xl font-serif mb-2">FAQs</h1>
          <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-2xl">
            Answers to common questions about shopping, shipping, and partnering with VYA.
          </p>
        </div>
      </section>

      {/* Accordion */}
      <section className="py-12 sm:py-20">
        <div className="max-w-4xl mx-auto px-6">
          <FAQAccordion faqs={faqs} />

          <div className="mt-20 border-t border-[#5D0F17]/10 pt-16 text-center">
            <h3 className="text-2xl font-serif mb-3">Still have questions?</h3>
            <p className="text-sm text-[#5D0F17]/60 max-w-xl mx-auto mb-8">
              If you&apos;re a shopper or a store and need more information, we&apos;re happy to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="mailto:hana@vyaplatform.com"
                className="bg-[#5D0F17] text-[#FFFDF8] px-8 py-3 text-sm uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition"
              >
                Contact Us
              </a>
              <a
                href="/for-stores"
                className="border border-[#5D0F17] text-[#5D0F17] px-8 py-3 text-sm uppercase tracking-[0.15em] hover:bg-[#5D0F17] hover:text-[#FFFDF8] transition"
              >
                Partner With VYA
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
