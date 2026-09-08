// Paste-ready listing content tuned to a platform: title within its char limit, tags, and — for
// hashtag-driven feeds — inline hashtags. Template-based, no AI cost. Pure.
//
// The description now carries the piece's FLAWS and MEASUREMENTS. Both are structure on the VYA
// row (flaws-core.ts, measurements-core.ts) and both are what a buyer on Depop or eBay reads
// before paying — a listing pushed without them was a listing that invited the return.

import { platformByKey } from "./cross-listing-platforms.ts";
import { formatMeasurement, isMeasurementKey, type Measurement } from "./measurements-core.ts";

export type ItemForPost = {
 title: string;
 brand?: string | null;
 condition?: string | null;
 size?: string | null;
 category?: string | null;
 priceCents: number;
 description?: string | null;
 /** Specific visible flaws, one per entry. */
 flaws?: unknown;
 /** Structured measurements, in the store's unit — the row's shape, keys checked here. */
 measurementsJson?: { key: string; value: number; unit: "cm" | "in" }[] | null;
 /** The older free-text measurements column; printed when there is no list. */
 measurements?: string | null;
};


/** "Flaws: scuffed toe; light pilling" — or nothing when the list is empty. */
export function flawsLine(flaws: unknown): string | null {
 const list = Array.isArray(flaws) ? flaws.filter((f): f is string => typeof f === "string" && !!f.trim()).map((f) => f.trim()) : [];
 return list.length ? `Flaws: ${list.join("; ")}` : null;
}

/** 'Measurements: Pit to pit 48 cm · Length 70 cm' — the list first, the old text as a fallback. */
export function measurementsLine(list: { key: string; value: number; unit: "cm" | "in" }[] | null | undefined, text?: string | null): string | null {
 const items: Measurement[] = Array.isArray(list) ? list.filter((m): m is Measurement => !!m && isMeasurementKey(m.key) && typeof m.value === "number" && Number.isFinite(m.value)) : [];
 if (items.length) return `Measurements: ${items.map(formatMeasurement).join(" · ")}`;
 const t = (text || "").trim();
 return t ? `Measurements: ${t}` : null;
}

export function crossPostContent(item: ItemForPost, platformKey: string): { title: string; body: string; tags: string[]; price: string } {
 const max = platformByKey(platformKey)?.titleMax || 80;
 const brand = (item.brand || "").trim();
 const base = [brand, item.title].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
 const title = base.length > max ? base.slice(0, max - 1).trimEnd() + "…" : base;
 const bits = [brand, item.category, item.size ? `Size ${item.size}` : "", item.condition ? `${item.condition} condition` : ""].filter(Boolean);
 const tags = Array.from(new Set([brand, item.category || "", item.size ? `size ${item.size}` : "", "vintage"].filter(Boolean).map((t) => String(t).toLowerCase().replace(/\s+/g, ""))));
 const desc = (item.description || "").trim() || `${bits.join(" · ")}. One-of-one — grab it before it's gone.`;
 // The honest lines, after the prose and before the hashtags, each on its own line.
 const detail = [flawsLine(item.flaws), measurementsLine(item.measurementsJson, item.measurements)].filter((l): l is string => !!l);
 const withDetail = detail.length ? `${desc}\n\n${detail.join("\n")}` : desc;
 // Hashtag-driven feeds (Depop, Instagram) get inline tags appended to the caption.
 const hashtagPlatforms = new Set(["depop", "instagram"]);
 const body = hashtagPlatforms.has(platformKey)
 ? `${withDetail}\n\n${tags.slice(0, platformKey === "instagram" ? 10 : 5).map((t) => `#${t}`).join(" ")}`
 : withDetail;
 return { title, body, tags, price: `$${Math.round(item.priceCents / 100)}` };
}
