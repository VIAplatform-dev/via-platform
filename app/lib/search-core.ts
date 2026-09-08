// What the global search reads off an item, and the one word it prints for its state. Pure.
//
// The haystack used to be title/brand/category/size, which meant "Kempton" (where it came from),
// "scuffed toe" (a flaw) and "one loose button" (the condition note) — all things a seller
// remembers a piece BY — found nothing. And a held piece's sub line said "reserved", the same word
// as a buyer mid-checkout, so the ⌘K answer to "is the green Fendi still held for Ana" was wrong.

export type SearchableItem = {
 sku: number;
 title: string;
 brand?: string | null;
 category?: string | null;
 size?: string | null;
 status: string;
 sourceName?: string | null;
 flaws?: unknown;
 conditionNote?: string | null;
};

/** One lowercase string per item: everything a query may match against. */
export function itemSearchText(it: SearchableItem): string {
 const flaws = Array.isArray(it.flaws) ? it.flaws.filter((f): f is string => typeof f === "string") : [];
 return [`SKU-${1000 + it.sku}`, it.title, it.brand || "", it.category || "", it.size || "", it.status, it.sourceName || "", ...flaws, it.conditionNote || ""]
  .join(" ")
  .toLowerCase();
}

/** The state word on a result row: "on hold" for a hold, "reserved" for a buyer mid-checkout. */
export function itemStatusWord(status: string, held: boolean): string {
 if (status === "reserved") return held ? "on hold" : "reserved";
 return status;
}
