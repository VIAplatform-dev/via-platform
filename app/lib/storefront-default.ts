import { getTemplate, templateTheme, STOREFRONT_TEMPLATES } from "./storefront-templates";
import type { StorefrontTheme } from "./store-import";

// The polished base every store starts with — instant, no AI. A template is now a COMPLETE store
// (home page, Shop page intro, catalogue density, and its own About / condition / contact pages), so
// the starter is that template with the seller's name written into the two places a name belongs:
// the hero and the story block. Sellers customize from here — edit sections by hand, swap the
// template or palette, or ask VYA to tailor the whole thing to their brand and products.
//
// Heirloom is the default because it is the most forgiving of a thin catalogue: it opens on type
// rather than a photograph the seller hasn't uploaded yet, and it reads as deliberate at six pieces.
const DEFAULT_TEMPLATE_ID = "elegant";

export function defaultStarterTheme(storeName: string): StorefrontTheme {
 const t = getTemplate(DEFAULT_TEMPLATE_ID) || STOREFRONT_TEMPLATES[0];
 const applied = templateTheme(t.id);
 const name = (storeName || "Your store").trim();

 // The hero headline is the one line that should say the store's name rather than the template's.
 const blocks = (applied?.blocks ?? []).map((b) =>
  b.type === "hero" ? { ...b, props: { ...b.props, heading: name } } : b,
 );

 return {
  ...applied,
  template: t.id,
  blocks,
  colorsFrom: "studio",
 };
}
