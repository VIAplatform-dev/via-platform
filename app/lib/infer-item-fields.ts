import { inferBrandFromTitle } from "./market-data-db";
import { inferCategoryFromTitle } from "./loadStoreProducts";
import { inferEra, inferCondition } from "./data-layer/enrich";
import { ERA_BUCKETS_SEED } from "./data-layer/config";

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
