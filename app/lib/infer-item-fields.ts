import { inferBrandFromTitle } from "./market-data-db";
import { inferCategoryFromTitle } from "./loadStoreProducts";
import { inferEra, inferCondition } from "./data-layer/enrich";
import { ERA_BUCKETS_SEED } from "./data-layer/config";
import { classifyBrand } from "./data-layer/unbranded-benchmark-db";

// When a store transfers in, most of the structured signal is sitting in the title + description
// ("moschino 2000's … dress", "in excellent condition") but arrives UNSORTED into brand/era/condition/
// category/material. This centralizes the same canonical inference used across the app so imports fill
// those fields instead of leaving them blank. Only ever fills what's MISSING — never overwrites a value
// the source already provided.

const nz = (v: unknown): string | null => {
 const s = (typeof v === "string" ? v : "").trim();
 return s ? s : null;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MATERIALS = ["silk", "cotton", "wool", "cashmere", "leather", "suede", "linen", "denim", "polyester", "nylon", "satin", "velvet", "chiffon", "lace", "mohair", "tweed", "corduroy", "rayon", "viscose", "spandex"];

/** Pull a material out of prose — prefers an explicit "100% silk", else a known fabric word. Conservative. */
export function extractMaterial(text: string | null | undefined): string | null {
 if (!text) return null;
 const t = String(text).toLowerCase();
 const pct = t.match(new RegExp(`(\\d{1,3})\\s*%\\s*(${MATERIALS.join("|")})`));
 if (pct) return `${pct[1]}% ${cap(pct[2])}`;
 for (const m of MATERIALS) if (new RegExp(`\\b${m}\\b`).test(t)) return cap(m);
 return null;
}

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// Words that mark a SHOP's name rather than a fashion house ("To Us Vintage", "hachi archive",
// "My Store"). A stored brand containing one is only trusted when the canonical map knows it.
const STORE_WORD_RE = /\b(vintage|archives?|store|shop|boutique|closet|collective|curated|sourced|thrift|resale|consignment)\b/i;

/**
 * A stored brand/designer column is only trusted when it doesn't look like the SELLER's shop.
 * Shopify feeds default `vendor` to the store's own name, so sold_items.designer / products.brand
 * often hold "To Us Vintage" or "My Store" instead of the maker — and a pricer fed that searches
 * eBay for the shop, not the garment. Prefer the canonical brand inferred from the title; keep the
 * stored value only when it isn't the store's own name and doesn't read like a shop.
 */
export function sanitizeStoredBrand(
 stored: string | null | undefined,
 opts: { title?: string | null; storeName?: string | null } = {},
): string | null {
 const s = (stored || "").trim();
 const fromTitle = inferBrandFromTitle(opts.title || "") || null;
 if (!s) return fromTitle;
 if (classifyBrand(s) === "known") return s; // canonical designer — always trusted
 // The shop's own name in the brand column — including partial forms: designer "Sablier" under
 // store "Sablier Vintage". Containment either way counts (min 4 chars so "gap" can't match a shop).
 const storeKey = normKey(opts.storeName || "");
 const sKey = normKey(s);
 if (storeKey && sKey.length >= 4 && (storeKey.includes(sKey) || sKey.includes(storeKey))) return fromTitle;
 if (STORE_WORD_RE.test(s)) return fromTitle; // "LOVERGIRL VINTAGE" / "My Store" / "hachi archive"
 return fromTitle ?? s; // lesser-known label: keep it, but a canonical title brand wins
}

export type InferredFields = { brand: string | null; era: string | null; condition: string | null; category: string | null; material: string | null };

/**
 * Infer brand / era / condition / category / material from an item's title + description, filling only
 * the fields `existing` didn't already provide. `category` is left null on the generic default so we
 * don't stamp "other-clothing" over an empty field.
 */
export function inferItemFields(
 title: string | null | undefined,
 description: string | null | undefined,
 existing: Partial<InferredFields> = {},
): InferredFields {
 const text = `${title || ""}\n${description || ""}`;
 const catRaw = inferCategoryFromTitle(title || "");
 const category = catRaw && catRaw !== "other-clothing" ? catRaw : null;
 return {
 brand: nz(existing.brand) ?? inferBrandFromTitle(title || "") ?? null,
 era: nz(existing.era) ?? inferEra(text, ERA_BUCKETS_SEED) ?? null,
 condition: nz(existing.condition) ?? inferCondition(text) ?? null,
 category: nz(existing.category) ?? category,
 material: nz(existing.material) ?? extractMaterial(description) ?? null,
 };
}
