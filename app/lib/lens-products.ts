// Google Lens via SerpApi returns two useful views of the same photo. The default (`type=all`)
// is the best BRAND/ID signal but Google only badges a price on a minority of those results;
// `type=products` is Lens's shopping tab, where every hit exists because it has a price. Pricing
// wants both: ID from the first, comps from the second. Pure helpers here so they're unit-testable
// without SerpApi (comps.ts imports next/cache, which node --test can't load).

import type { VisualMatch } from "./comps";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Coerce SerpApi's many price shapes (number | {extracted_value} | {raw} | {from}) into cents. */
export function priceToCents(p: any): number | null {
 let v: number | null = null;
 if (typeof p === "number") v = p;
 else if (typeof p?.extracted_value === "number") v = p.extracted_value;
 else if (typeof p?.extracted === "number") v = p.extracted; // eBay engine
 else if (typeof p?.from?.extracted_value === "number") v = p.from.extracted_value;
 else if (typeof p?.from?.extracted === "number") v = p.from.extracted; // eBay price range
 else if (typeof p?.raw === "string") { const n = parseFloat(p.raw.replace(/[^0-9.]/g, "")); v = Number.isFinite(n) ? n : null; }
 else if (typeof p === "string") { const n = parseFloat(p.replace(/[^0-9.]/g, "")); v = Number.isFinite(n) ? n : null; }
 return v && v > 0 ? Math.round(v * 100) : null;
}


/** Normalize a SerpApi Lens response (any `type`) into VisualMatches. Products-type responses have
 *  been seen under both `visual_matches` and `products`, so read whichever is present. */
export function parseLensMatches(r: any, pricedFrom?: VisualMatch["pricedFrom"]): VisualMatch[] {
 const rows: any[] = Array.isArray(r?.visual_matches) ? r.visual_matches : Array.isArray(r?.products) ? r.products : [];
 return rows
 .slice(0, 25)
 .map((m) => {
 const priceCents = priceToCents(m.price);
 const out: VisualMatch = { title: String(m.title || ""), priceCents, source: String(m.source || ""), link: m.link as string | undefined, thumbnail: (typeof m.thumbnail === "string" && m.thumbnail) || undefined };
 if (priceCents && pricedFrom) out.pricedFrom = pricedFrom;
 return out;
 })
 .filter((m) => m.title);
}

export function pricedCount(ms: VisualMatch[]): number {
 return ms.filter((m) => m.priceCents && m.priceCents > 0).length;
}

/** Merge a products-type result into the primary set. Same link → keep the primary row but adopt
 *  the products price if the primary had none; new links are appended. Order is preserved so the
 *  ID-bearing primary matches stay in front for the brand consensus. */
export function mergeLensMatches(primary: VisualMatch[], products: VisualMatch[]): VisualMatch[] {
 const byLink = new Map<string, number>();
 const out = primary.map((m, i) => { if (m.link) byLink.set(m.link, i); return { ...m }; });
 for (const p of products) {
 const i = p.link ? byLink.get(p.link) : undefined;
 if (i === undefined) { out.push({ ...p }); continue; }
 if (!(out[i].priceCents && out[i].priceCents > 0) && p.priceCents) out[i] = { ...out[i], priceCents: p.priceCents, pricedFrom: p.pricedFrom };
 }
 return out;
}
