// Pure rules for turning a captured storefront's products into VYA inventory — no database, no
// network, so they can be unit-tested directly (same split as inventory-core.ts next door).
// capture-commerce.ts holds the DB-touching half and re-exports these.
import type { ImportedProduct } from "./store-import.ts";

// Money comes off the product as NUMBERS (priceCents + an ISO currency the platform told us).
// These string parsers are the legacy fallback for sources that only give a formatted price —
// never the primary path. Guessing currency from a "£"/"€" glyph is what labelled a UK store's
// GBP catalogue as USD, so the glyph check only runs when the platform gave us nothing.
export const parseCents = (price?: string) => Math.round((parseFloat((price || "").replace(/[^0-9.]/g, "")) || 0) * 100);
export const detectCur = (price?: string) => (/£/.test(price || "") ? "GBP" : /€/.test(price || "") ? "EUR" : "USD");
export const centsOf = (p: ImportedProduct) => (typeof p.priceCents === "number" && p.priceCents > 0 ? p.priceCents : parseCents(p.price));
export const currencyOf = (p: ImportedProduct) => (p.currency && /^[A-Z]{3}$/.test(p.currency) ? p.currency : detectCur(p.price));
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Identity of an imported product: the platform plus the platform's OWN id/handle. This is what
 *  makes a re-import a merge instead of a duplicate — titles can't do it, because vintage stores
 *  list distinct one-of-one pieces under the same name and rename items freely. */
export const identityKey = (platform: string | null | undefined, id: string) => `${platform || "?"}:${id}`;

export const slugifyHandle = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Fingerprint of the fields a re-sync cares about, so an unchanged listing can be skipped and a
 *  changed one detected without diffing every column. Currency is part of it on purpose: 627 GBP
 *  and 627 USD are different prices. */
export function productContentHash(p: ImportedProduct): string {
 const parts = [p.name, centsOf(p), currencyOf(p), p.available === false ? "sold" : "live", (p.images || [p.image]).filter(Boolean).join("|"), p.size || ""];
 let h = 0;
 const s = parts.join("§");
 for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
 return (h >>> 0).toString(36);
}
