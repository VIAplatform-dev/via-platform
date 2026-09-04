// The storefront's corner + skin CSS, in one place.
//
// `vya-round`, `vya-cta` and `vya-field` are the hooks every storefront element carries so that ONE
// control — the store's corner style, its skin — can shape all of them at once. The rules used to be
// built inside app/s/Blocks.tsx, which meant they only existed on pages made of blocks: a store set
// to round corners got round buttons on its home page and square ones on every product page, because
// the product page renders its own markup and never emitted the stylesheet. The hooks were there,
// doing nothing.
//
// So the rules live here and both callers use them. Anything that renders storefront markup outside
// the block canvas — the product page today, a cart or a checkout tomorrow — emits storefrontCss()
// and inherits the store's look for free.
import { skinCss } from "./storefront-skins";
import type { Radius } from "./captured-design";

export const IMG_RADIUS: Record<Radius, number> = { sharp: 0, soft: 14, round: 26 };
export const BTN_RADIUS: Record<Radius, number> = { sharp: 0, soft: 8, round: 999 };

/**
 * Corner style. Always emitted, including for "sharp" where both values are 0 — a block carrying its
 * own Tailwind rounding needs something to override it, so the token has to be authoritative rather
 * than conditional. `.vya-field` keeps form inputs on the same curve as the images.
 */
export function radiusCss(radius: Radius | undefined): string {
 const ir = IMG_RADIUS[radius as Radius] ?? 0;
 const br = BTN_RADIUS[radius as Radius] ?? 0;
 return `.vya-round,.vya-img{border-radius:${ir}px;overflow:hidden}.vya-cta{border-radius:${br}px}.vya-field{border-radius:${ir}px}`;
}

// A fold-away detail (`<details class="vya-details">`). Safari draws its own disclosure triangle
// that `list-style:none` alone doesn't remove, and the +/− has to answer to the open state — both of
// which are CSS, so neither needs a client component to fold a paragraph away.
const detailsCss = ".vya-details summary::-webkit-details-marker{display:none}"
 + ".vya-details[open] .vya-details-mark{transform:rotate(45deg)}"
 + ".vya-details-mark{display:inline-block;transition:transform .18s ease}";

/** Corners, drawers, then skin — skin last so it loses to nothing but a merchant's own !important
 *  overrides. */
export function storefrontCss(radius: Radius | undefined, skin?: string): string {
 return radiusCss(radius) + detailsCss + skinCss(skin);
}
