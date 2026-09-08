// The size line on a listing: what the tag says, and what that means to a buyer. Pure — no I/O.
//
// A vintage tag is a fact, not a fit. "IT 44" on a 1980s label and a "12" on a British one tell a
// buyer nothing she can order by. Two things the code already knows are surfaced here, in order of
// trust:
//   1. the seller's own fit note in the description ("runs true to a US 6") — size-parse.ts;
//   2. the size table's conversion of the tag (IT/FR/DE/EU/UK → US, shoes on their own table,
//      a UK store's bare shoe number read as UK) — sizeUtils.ts convertSizeToUS.
// There is NO vintage→modern table in the codebase — the conversion is by region, not by decade —
// so the line labels its source and never claims more than it knows.

import { extractFitSizeFromDescription } from "./size-parse.ts";
import { convertSizeToUS } from "./sizeUtils.ts";

export type SizeLine = {
 /** The tag, as the seller entered it. */
 marked: string;
 /** What a buyer should order, when we can say. Always a US size — that is what the table speaks. */
 fits: string | null;
 /** Where `fits` came from. `tag` = nothing to add beyond the tag itself. */
 source: "seller" | "conversion" | "tag";
};

export function sizeLine(item: { size: string | null | undefined; category: string | null | undefined; title: string | null | undefined; description: string | null | undefined; currency: string | null | undefined }): SizeLine | null {
 const marked = String(item.size ?? "").trim();
 if (!marked) return null;
 const note = extractFitSizeFromDescription(item.description ?? null);
 if (note) return { marked, fits: note, source: "seller" };
 // A tag already in US sizing has nothing to convert, and "US 8 · about a US 8" is noise.
 if (/^us\b/i.test(marked)) return { marked, fits: null, source: "tag" };
 const converted = convertSizeToUS(marked, String(item.category ?? ""), item.title ?? undefined, item.currency ?? undefined);
 if (converted && converted !== marked) return { marked, fits: converted, source: "conversion" };
 return { marked, fits: null, source: "tag" };
}

/** "Marked IT 44 · fits a US 6 (seller's note)" · "Marked IT 40 · about a US 4" · "M". */
export function formatSizeLine(s: SizeLine | null): string | null {
 if (!s) return null;
 if (!s.fits) return s.marked;
 return s.source === "seller"
  ? `Marked ${s.marked} · fits a ${s.fits} (seller's note)`
  : `Marked ${s.marked} · about a ${s.fits}`;
}
