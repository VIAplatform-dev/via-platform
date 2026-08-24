import { getTemplate, STOREFRONT_TEMPLATES } from "./storefront-templates.ts";
import { makeBlock } from "./storefront-blocks.ts";
import type { StorefrontTheme } from "./store-import.ts";

// The polished base every store starts with — instant, no AI. A complete homepage
// (announcement → hero → new arrivals → story → newsletter) + About / FAQ / Shipping
// pages with sensible copy, styled to a clean editorial template. Sellers customize
// it from here: edit sections by hand, swap the template/colors, or ask VYA to tailor
// the whole thing to their brand + products.
export function defaultStarterTheme(storeName: string): StorefrontTheme {
 const t = getTemplate("editorial-luxe") || STOREFRONT_TEMPLATES[0];
 const name = (storeName || "Your store").trim();
 const story = makeBlock("text", {
 heading: "Our Story",
 body: `${name} is a curated edit of vintage and one-of-a-kind pieces — chosen for their craft, their character, and the stories they carry. Every piece is hand-selected and ready for its next chapter.`,
 });
 return {
 template: t.id,
 colors: { ...t.colors },
 fonts: { ...t.fonts },
 blocks: [
 makeBlock("announcement", { text: "Complimentary tracked shipping on orders over $150" }),
 makeBlock("hero", { heading: name, subtext: "A curated edit of vintage and one-of-a-kind pieces.", cta: "Shop the collection" }),
 makeBlock("featured", { heading: "New Arrivals" }),
 { ...story, style: { bg: "dark" } },
 makeBlock("newsletter", { heading: "Join the list", subtext: "First access to new arrivals and private sales." }),
 ],
 extraPages: [
 { slug: "about", title: "About", blocks: [makeBlock("text", { heading: `About ${name}`, body: `${name} began with a love of pieces that last — vintage and secondhand fashion with provenance and soul. We curate each edit by hand, championing craft, sustainability, and individual style.` })] },
 { slug: "faq", title: "FAQ", blocks: [makeBlock("faq", { heading: "Frequently asked", q0: "How are pieces sourced?", a0: "Every piece is hand-selected for quality and authenticity.", q1: "What condition are items in?", a1: "Condition is noted on each listing; most pieces are pre-loved or vintage.", q2: "Do you accept returns?", a2: "See our Shipping & Returns page for the details." })] },
 { slug: "shipping-returns", title: "Shipping & Returns", blocks: [makeBlock("text", { heading: "Shipping & Returns", body: "Orders are carefully packed and shipped with tracking. Complimentary shipping on orders over $150.\n\nReturns are accepted within 14 days of delivery for store credit, unless otherwise noted. One-of-one vintage pieces may be final sale — check the listing." })] },
 ],
 };
}
