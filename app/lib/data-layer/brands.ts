// ───────────────────────────────────────────────────────────────────────────
// Data Layer: canonical brand resolution (pure + tested).
//
// We sell brand-level demand data TO brands, so brand attribution is our top
// trust risk. Brand is resolved from a CANONICAL reference (label) via an
// alias/synonym map ("YSL" → "Saint Laurent"), loaded from the brand_aliases
// table (seeded like era_buckets, so an alias can be added to fix coverage with
// no code deploy). This module is the pure matcher. The reference is injected
// (see brands-db.ts) so it stays node-testable.
//
// Rule (enrich.ts): NEVER guess. If no alias matches, the brand is null.
// ───────────────────────────────────────────────────────────────────────────

export type BrandRef = {
 slug: string; // canonical slug, e.g. "saint-laurent"
 label: string; // canonical label, e.g. "Saint Laurent"
 aliases: string[]; // synonyms incl. the canonical name, e.g. ["saint laurent","ysl","yves saint laurent"]
};

function escapeRe(s: string): string {
 return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Does `text` (already lowercased) contain `alias`? Whole-word aliases, and any
// alias ≤3 chars (lv/cd/ck): must be bounded by non-letters so they never match
// INSIDE a word ("etro" must not hit "retro", "boss" must not hit "embossed").
// Every other alias matches as a substring, so plurals/possessives still resolve
// ("guccis", "gucci's", "gucci-style" → Gucci). Shared by all brand matchers so
// they behave identically.
export function aliasMatches(text: string, alias: string, wholeWord: boolean): boolean {
 if (wholeWord || alias.length <= 3) {
 return new RegExp(`(?<![a-z])${escapeRe(alias)}(?![a-z])`, "i").test(text);
 }
 return text.includes(alias);
}

// Resolve a title to a CANONICAL brand label, or null when nothing matches.
// `wholeWordAliases` (lowercased) are the substring-of-a-common-word aliases that
// must match as whole words. Brands are tried in `ref` order, so the first
// (highest-priority) match wins.
export function resolveBrand(
 title: string | null | undefined,
 ref: BrandRef[],
 wholeWordAliases?: ReadonlySet<string>,
): string | null {
 if (!title) return null;
 const lower = title.toLowerCase();
 for (const b of ref) {
 for (const a of b.aliases) {
  const alias = a.toLowerCase().trim();
  if (!alias) continue;
  if (aliasMatches(lower, alias, wholeWordAliases?.has(alias) ?? false)) return b.label;
 }
 }
 return null;
}

// Canonical slug for a resolved label (or null). Handy for grouping by a stable key.
export function brandSlug(label: string | null, ref: BrandRef[]): string | null {
 if (!label) return null;
 const hit = ref.find((b) => b.label === label);
 return hit ? hit.slug : null;
}
