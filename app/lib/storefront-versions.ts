// Named storefront versions — the rules, with no database in them.
//
// WHAT THIS IS FOR. A store has ONE storefront today: either the copy of the site we imported
// (site_captures) or the design they built in the studio (storefront_settings.theme). Whichever
// arrived last is the one they have, and the other is gone. So a seller who imported her real site
// and then wanted to try building one from scratch had to destroy the import to do it — and a
// re-import destroys whatever she built. There was no way to keep both and choose.
//
// The model is Shopify's, because sellers already understand it: a store keeps a LIST of named
// storefronts, exactly one is published, and the rest sit as drafts until she publishes one.
//
// The important part is that the live storefront IS a version, not something separate that gets
// copied into a version when we remember to. Publishing writes the outgoing state back to its own
// row before restoring the incoming one, so switching is a swap between two rows and there is no
// step at which anything only exists in one place.
//
// Everything here is pure so the naming and the guards are unit tested on their own.

/** What a version holds. `imported` = captured pages of their real site; `built` = a studio design. */
export type VersionKind = "imported" | "built";

export type VersionSummary = {
 id: string;
 name: string;
 kind: VersionKind;
 published: boolean;
 pageCount: number;
 updatedAt: string | null;
};

/** What a new version of each kind is called before the seller renames it. */
export const BASE_NAME: Record<VersionKind, string> = {
 imported: "Imported site",
 built: "Design",
};

/**
 * A name that isn't already taken, by appending a counter: "Design", "Design 2", "Design 3".
 *
 * Compared case-insensitively and on trimmed text, because "design" and "Design " read as the same
 * name to the person looking at the list — two rows that look identical are worse than a 2 on the end.
 */
export function uniqueName(base: string, existing: readonly string[]): string {
 const want = base.trim() || "Untitled";
 const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
 if (!taken.has(want.toLowerCase())) return want;
 for (let i = 2; i < 500; i++) {
  const candidate = `${want} ${i}`;
  if (!taken.has(candidate.toLowerCase())) return candidate;
 }
 return `${want} ${Date.now()}`;
}

/** The default name for a brand-new version of this kind, avoiding collisions with what's there. */
export function defaultVersionName(kind: VersionKind, existing: readonly string[]): string {
 return uniqueName(BASE_NAME[kind], existing);
}

/** Trim and cap a seller-typed name. Empty stays empty so callers can reject it. */
export function normalizeVersionName(raw: unknown): string {
 return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * Whether a version can be deleted.
 *
 * The published one never can. Deleting what the shop is currently serving would take the storefront
 * down, and "delete" is not where a seller expects to find that decision — she'd publish something
 * else first, which is exactly the step this forces.
 */
export function canDelete(v: Pick<VersionSummary, "published">): boolean {
 return !v.published;
}

/** Publishing the one already published is a no-op, not an error worth showing anyone. */
export function canPublish(v: Pick<VersionSummary, "published">): boolean {
 return !v.published;
}

/**
 * Which storefront a request should be served, given the published version.
 *
 * Serving used to ask one question — "does this store have any captured pages?" — and captures won
 * whenever they existed. That is why a store could never publish a built design after importing:
 * the captures outranked it no matter what. Now the published version decides, and the capture
 * check is only the fallback for stores that predate versions and have no published row yet.
 */
export function servesCapture(publishedKind: VersionKind | null, hasCaptures: boolean): boolean {
 if (publishedKind === "imported") return true;
 if (publishedKind === "built") return false;
 return hasCaptures;
}
