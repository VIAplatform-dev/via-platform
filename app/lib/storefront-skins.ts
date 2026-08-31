// Global style SKINS — the second axis of the storefront builder.
//
// `block.variant` decides a section's BONES (where the photo sits, how many columns). A skin decides
// the SKIN across every section at once: type scale and weight, letter-spacing, case, the shape of
// buttons, how much air a section has, whether edges are hairlines or nothing at all.
//
// TWO RULES MAKE A SKIN A STARTING POINT RATHER THAN A LOCKED THEME:
//
//  1. Skin CSS carries NO `!important` and stays at single-class specificity. Per-section overrides
//     (sectionOverrideCss in Blocks.tsx) are emitted with `!important`, so anything a merchant sets
//     on a section — its font, size, padding, button shape — always beats the skin. Applying a skin
//     can never silently undo work, and it never has to be "removed" before customizing.
//
//  2. A skin SEEDS colour and type, it does not own them. Applying one writes its palette and font
//     pairing into the theme like any other colour choice — editable immediately afterwards, and never
//     re-applied on render, so later edits stick.
//
//     Every skin carries a palette deliberately. An earlier cut gave one only to Statement, on the
//     reasoning that a skin shouldn't touch colour — which produced a trap: try Statement once and its
//     dark ground stayed put under every other skin, so the rest of the picker looked identical and
//     there was no way back. Either all of them set colour or none can. Choosing a skin is now a
//     complete look, and ⌘Z (or picking another palette) is the way back.

import { STRIP_SECTION_TYPES } from "./storefront-blocks.ts";

export type SkinId = "gallery" | "editorial" | "boutique" | "archive" | "statement";
export type Skin = {
 id: SkinId;
 label: string;
 description: string;
 // Seeded into theme.colors when the skin is applied. Editable afterwards like any palette.
 palette?: { bg: string; text: string; accent: string };
 // Suggested type pairing, seeded the same way.
 fonts?: { heading: string; body: string };
};

// Palettes are drawn from the same vocabulary as the Colour palette control (STOREFRONT_PALETTES),
// so a skin never lands the store somewhere the palette picker couldn't also reach.
export const SKINS: Skin[] = [
 { id: "gallery", label: "Gallery", description: "Photography first: wide margins, small caps, hairline rules, and type that gets out of the way.", palette: { bg: "#FAF6EE", text: "#211D16", accent: "#2A2521" }, fonts: { heading: "Inter", body: "Inter" } },
 { id: "editorial", label: "Editorial", description: "Magazine hierarchy — large serif headings, left aligned, generous line height.", palette: { bg: "#F4F0E8", text: "#1C1814", accent: "#6C2126" }, fonts: { heading: "Playfair Display", body: "Inter" } },
 { id: "boutique", label: "Boutique", description: "Warmer and softer: rounded corners, pill buttons, roomy sections.", palette: { bg: "#F2E7DA", text: "#372620", accent: "#B15E37" }, fonts: { heading: "Playfair Display", body: "Inter" } },
 { id: "archive", label: "Archive", description: "Dense and technical — tight, uppercase, sharp corners, everything on a grid.", palette: { bg: "#EBE7DE", text: "#262218", accent: "#877A65" }, fonts: { heading: "Inter", body: "Inter" } },
 { id: "statement", label: "Statement", description: "Dark ground, oversized type, high contrast.", palette: { bg: "#191A1E", text: "#ECE6DB", accent: "#C6A24A" }, fonts: { heading: "Playfair Display", body: "Inter" } },
];

export const isSkin = (v: unknown): v is SkinId => typeof v === "string" && SKINS.some((s) => s.id === v);
export const skinDef = (id?: string) => SKINS.find((s) => s.id === id);

// A note on units: heading sizes are in `cqw`, NOT `vw`.
//
// `vw` measures the browser window, which is the wrong ruler for a storefront — the storefront is laid
// out inside a container, and in the studio that container is a 390px phone artboard sitting in a
// 1440px window. Sized in `vw` the skin read the WINDOW, so a heading stayed at its full desktop size
// in the phone preview no matter how narrow the artboard was: the preview said the design was fine on
// a phone when it wasn't. `cqw` measures the container the storefront actually occupies, so the same
// clamp gives the same result on a real desktop and finally tells the truth in the preview.
//
// The CSS a skin emits, scoped to `.vya-skin-<id>` on the storefront root. Single-class selectors
// only — see rule 1 above. These target the stable classes every layout renders with, which is why a
// skin works on all ~75 layouts without knowing any of them exist.
const SKIN_CSS: Record<SkinId, string> = {
 gallery: `
  .vya-skin-gallery .vya-heading{font-weight:400;letter-spacing:.06em;text-transform:uppercase;font-size:clamp(1.3rem,2.4cqw,2rem)}
  .vya-skin-gallery .vya-sub,.vya-skin-gallery .vya-body{opacity:.6;line-height:1.9}
  .vya-skin-gallery .vya-sec{padding-top:7rem;padding-bottom:7rem}
  .vya-skin-gallery .vya-cta{border-radius:0;border:1px solid currentColor;background:transparent;color:inherit;letter-spacing:.22em}
  .vya-skin-gallery .vya-round,.vya-skin-gallery .vya-img{border-radius:0}
 `,
 editorial: `
  .vya-skin-editorial .vya-heading{font-weight:400;letter-spacing:-.015em;line-height:1.05;font-size:clamp(2rem,4.4cqw,3.6rem)}
  .vya-skin-editorial .vya-sub,.vya-skin-editorial .vya-body{line-height:1.85;font-size:1rem}
  .vya-skin-editorial .vya-sec{padding-top:5.5rem;padding-bottom:5.5rem}
  .vya-skin-editorial .vya-cta{border-radius:0;letter-spacing:.16em}
  .vya-skin-editorial .vya-round,.vya-skin-editorial .vya-img{border-radius:0}
 `,
 boutique: `
  .vya-skin-boutique .vya-heading{font-weight:500;letter-spacing:-.005em;line-height:1.15}
  .vya-skin-boutique .vya-sub,.vya-skin-boutique .vya-body{line-height:1.8}
  .vya-skin-boutique .vya-sec{padding-top:6.5rem;padding-bottom:6.5rem}
  .vya-skin-boutique .vya-cta{border-radius:999px;padding-left:2.4rem;padding-right:2.4rem;letter-spacing:.12em}
  .vya-skin-boutique .vya-round,.vya-skin-boutique .vya-img{border-radius:18px}
 `,
 archive: `
  .vya-skin-archive .vya-heading{font-weight:500;letter-spacing:.14em;text-transform:uppercase;font-size:clamp(1.05rem,1.8cqw,1.5rem)}
  .vya-skin-archive .vya-sub,.vya-skin-archive .vya-body{font-size:.82rem;line-height:1.6;letter-spacing:.02em}
  .vya-skin-archive .vya-sec{padding-top:3rem;padding-bottom:3rem}
  .vya-skin-archive .vya-cta{border-radius:0;padding:.6rem 1.4rem;font-size:10px;letter-spacing:.2em}
  .vya-skin-archive .vya-round,.vya-skin-archive .vya-img{border-radius:0}
 `,
 statement: `
  .vya-skin-statement .vya-heading{font-weight:600;letter-spacing:-.03em;line-height:.98;font-size:clamp(2.4rem,6cqw,5rem)}
  .vya-skin-statement .vya-sub,.vya-skin-statement .vya-body{font-size:1.02rem;line-height:1.7;opacity:.8}
  .vya-skin-statement .vya-sec{padding-top:6rem;padding-bottom:6rem}
  .vya-skin-statement .vya-cta{border-radius:0;padding:1rem 2.6rem;letter-spacing:.2em}
  .vya-skin-statement .vya-round,.vya-skin-statement .vya-img{border-radius:2px}
 `,
};

// Sections that are STRIPS, not content: a thin full-width band that belongs flush against whatever
// sits above it. Every skin sets roomy `.vya-sec` padding, which is right for a hero or a text block
// and wrong here — "Boutique" turned a 35px announcement bar into a 224px box with the message
// floating in the middle of it, in the editor and on the live storefront alike. Emitted AFTER the
// skin's own rules at equal specificity, so it wins the tie; a seller's explicit per-section padding
// still beats both, because those carry !important.
// Every skin sets roomy section padding for a desktop canvas — 7rem top and bottom on Gallery. At
// 390px that is 224px of empty ground between every section, which is most of a phone screen. Each
// skin therefore gets a narrow-container counterpart. Emitted AFTER the skin's own rule (equal
// specificity, later wins) but BEFORE stripReset, so a thin announcement strip still collapses to
// nothing; a seller's explicit per-section padding beats both, because that carries !important.
const SKIN_PAD_MOBILE: Record<SkinId, string> = {
 gallery: "2.5rem", editorial: "2.25rem", boutique: "2.5rem", archive: "1.25rem", statement: "2.25rem",
};
function mobilePad(id: SkinId): string {
 const p = SKIN_PAD_MOBILE[id];
 return `@container (max-width:640px){.vya-skin-${id} .vya-sec{padding-top:${p};padding-bottom:${p}}}`;
}

function stripReset(id: SkinId): string {
 const sel = STRIP_SECTION_TYPES.map((t) => `.vya-skin-${id} .vya-${t}`).join(",");
 return `${sel}{padding-top:0;padding-bottom:0}`;
}

// Collapse whitespace so the inlined <style> stays small on every storefront render.
export function skinCss(id?: string): string {
 if (!isSkin(id)) return "";
 return (SKIN_CSS[id].replace(/\s*\n\s*/g, "").trim() + mobilePad(id) + stripReset(id));
}
