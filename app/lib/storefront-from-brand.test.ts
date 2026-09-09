import { test } from "node:test";
import assert from "node:assert/strict";
import { storeNameFromTitle, storefrontFromBrand, type BrandProfile } from "./storefront-from-brand.ts";

// The fallback for stores that cannot be captured at all — Wix, single-page apps, and sites with
// no readable product feed. Their layout is unreachable, but their brand isn't: colours, fonts,
// logo, name and menu labels live in <head> and in CSS custom properties, which a JS-rendered page
// still serves. These tests pin that the seller gets something recognisably theirs rather than the
// same blank starter everyone else sees.

const brand = (over: Partial<BrandProfile> = {}): BrandProfile => ({
 name: "The Vintage Boutique",
 colors: { bg: "#F4F0E8", text: "#1C1814", accent: "#dd4b39" },
 fonts: { heading: "Playfair Display", body: "Inter" },
 logo: "https://cdn/logo.png",
 nav: [{ label: "New Arrivals", href: "/new" }, { label: "Handbags", href: "/bags" }],
 tagline: "Hand-picked vintage since 2014",
 socials: { instagram: "https://instagram.com/x" },
 found: ["colours", "fonts", "logo"],
 ...over,
});

test("the seller's brand overrides the starter template", () => {
 const t = storefrontFromBrand(brand());
 assert.equal(t.colors?.bg, "#F4F0E8");
 assert.equal(t.colors?.accent, "#dd4b39");
 assert.equal(t.fonts?.heading, "Playfair Display");
 assert.equal(t.logo, "https://cdn/logo.png");
 assert.equal(t.storeName, "The Vintage Boutique");
 assert.equal(t.colorsFrom, "imported", "flagged as inferred, not chosen by a human");
});

test("the starter fills in only what the brand didn't provide", () => {
 const t = storefrontFromBrand(brand({ colors: {}, fonts: {}, logo: null }));
 assert.ok(t.colors?.bg, "still has a complete palette");
 assert.ok(t.fonts?.heading, "still has type");
 assert.equal(t.logo, undefined, "no invented logo");
});

test("a complete storefront comes back, not an empty shell", () => {
 // The whole point of starting from the default: the seller lands on a real homepage with real
 // pages, not a blank canvas they have to fill before their store looks like anything.
 const t = storefrontFromBrand(brand());
 assert.ok((t.blocks?.length ?? 0) >= 4, "a real homepage");
 assert.ok(t.blocks?.some((b) => b.type === "featured"), "somewhere for products to render");
 // Asserted as "real pages, each with content" rather than an exact list: the starter set grows
 // (it's at authenticity / condition-scale / contact / faq / philosophy / shipping today), and a
 // hard-coded list turns every addition into a failing test about nothing.
 const pages = t.extraPages ?? [];
 assert.ok(pages.length >= 3, "a real set of pages");
 assert.ok(pages.every((p) => p.slug && p.title && p.blocks.length > 0), "no page arrives empty");
 assert.ok(pages.some((p) => p.slug === "faq"), "the one every shop needs");
});

test("their own words lead the hero, and their tagline reaches the footer", () => {
 const t = storefrontFromBrand(brand());
 const hero = t.blocks?.find((b) => b.type === "hero");
 assert.equal(hero?.props.heading, "The Vintage Boutique");
 assert.equal(hero?.props.subtext, "Hand-picked vintage since 2014");
 assert.equal(t.footerAbout, "Hand-picked vintage since 2014");
});

test("their menu labels are kept but pointed at VYA collections", () => {
 // Their old hrefs don't exist here, so the labels carry over and the destinations are rewritten.
 const t = storefrontFromBrand(brand());
 assert.deepEqual(t.navLinks, [
  { label: "New Arrivals", href: "/collections/new-arrivals", place: "header" },
  { label: "Handbags", href: "/collections/handbags", place: "header" },
 ]);
});

test("a store with no readable brand still gets a usable storefront", () => {
 const t = storefrontFromBrand(brand({ name: null, colors: {}, fonts: {}, logo: null, nav: [], tagline: null, socials: {}, found: [] }));
 assert.equal(t.storeName, "Your store");
 assert.ok((t.blocks?.length ?? 0) >= 4);
 assert.equal(t.navLinks, undefined, "no empty nav");
 assert.equal(t.footerAbout, undefined);
});

// ── Store name out of a <title> ────────────────────────────────────────────────────────────────
// Separator order isn't consistent across platforms, and taking the first segment blindly named a
// real store "Home".

test("reads the store name whichever side of the separator it's on", () => {
 assert.equal(storeNameFromTitle("Home | The Vintage Boutique, LLC"), "The Vintage Boutique, LLC");
 assert.equal(storeNameFromTitle("The Objects of Affection — Vintage"), "The Objects of Affection");
 assert.equal(storeNameFromTitle("Shop All | Ange Archive"), "Ange Archive");
 assert.equal(storeNameFromTitle("Blummier"), "Blummier");
});

test("a title with nothing but a page label yields no name", () => {
 assert.equal(storeNameFromTitle("Home"), null);
 assert.equal(storeNameFromTitle(""), null);
 assert.equal(storeNameFromTitle("   "), null);
});
