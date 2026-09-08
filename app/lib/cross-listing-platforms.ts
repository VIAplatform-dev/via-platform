// Which marketplaces VYA cross-lists to, and how each one is actually posted to. Pure.
//
// mode = how a piece actually gets posted: "api" (server auto-posts via the marketplace API — eBay only),
// "extension" (the browser extension fills the seller's own logged-in form — Depop, Vestiaire first),
// "soon" (not available yet — shown greyed as Coming soon). Only eBay has a usable public API.
export type PlatformMode = "api" | "extension" | "soon";
export type Platform = { key: string; name: string; hasApi: boolean; live?: boolean; mode: PlatformMode; titleMax: number; profileUrl: (handle: string) => string };

/**
 * The Chrome extension is submitted and waiting on Google's review.
 *
 * Until it is approved there is nothing for a seller to install, so every channel that depends on
 * it — Depop, Vestiaire — is presented as coming soon rather than as a switch that silently does
 * nothing when flipped. eBay is a real API integration and is unaffected.
 *
 * Flipped to false on 2026-09-04, when Google approved VYA Cross-Lister and the Web Store listing
 * went live. Depop and Vestiaire are offered as what they are again: extension channels a seller
 * can queue to. Set it back to true only if the extension is ever pulled from the store.
 */
export const EXTENSION_IN_REVIEW = false;

/** How a platform should be OFFERED right now, as opposed to what it fundamentally is. */
export function effectiveMode(p: Platform): PlatformMode {
 return p.mode === "extension" && EXTENSION_IN_REVIEW ? "soon" : p.mode;
}


export const PLATFORMS: Platform[] = [
 { key: "ebay", name: "eBay", hasApi: true, live: true, mode: "api", titleMax: 80, profileUrl: (h) => `https://www.ebay.com/usr/${h}` },
 { key: "depop", name: "Depop", hasApi: false, live: true, mode: "extension", titleMax: 65, profileUrl: (h) => `https://www.depop.com/${h}` },
 { key: "vestiaire", name: "Vestiaire Collective", hasApi: false, live: true, mode: "extension", titleMax: 50, profileUrl: (h) => `https://www.vestiairecollective.com/profile/${h}/` },
 { key: "poshmark", name: "Poshmark", hasApi: false, live: true, mode: "soon", titleMax: 80, profileUrl: (h) => `https://poshmark.com/closet/${h}` },
 { key: "etsy", name: "Etsy", hasApi: true, live: true, mode: "soon", titleMax: 140, profileUrl: (h) => `https://www.etsy.com/shop/${h}` },
 { key: "vinted", name: "Vinted", hasApi: false, live: true, mode: "soon", titleMax: 100, profileUrl: (h) => `https://www.vinted.com/member/${h}` },
 { key: "mercari", name: "Mercari", hasApi: false, live: true, mode: "soon", titleMax: 80, profileUrl: (h) => `https://www.mercari.com/u/${h}/` },
 { key: "grailed", name: "Grailed", hasApi: false, live: true, mode: "soon", titleMax: 60, profileUrl: (h) => `https://www.grailed.com/${h}` },
 { key: "instagram", name: "Instagram", hasApi: false, live: true, mode: "soon", titleMax: 125, profileUrl: (h) => `https://www.instagram.com/${h}/` },
 { key: "facebook", name: "Facebook Marketplace", hasApi: false, live: true, mode: "soon", titleMax: 100, profileUrl: (h) => `https://www.facebook.com/${h}` },
];
export const platformByKey = (k: string): Platform | null => PLATFORMS.find((p) => p.key === k) || null;

