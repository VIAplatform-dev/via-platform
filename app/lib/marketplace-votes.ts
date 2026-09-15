// Which marketplace to build next, decided by the shops waiting for it rather than by us guessing.
//
// There are seven channels sitting behind a grey "Coming soon" label, and building one is weeks of
// work: Poshmark, Vinted and Mercari have no public listing API at all, so each is a browser-
// extension flow written and maintained by hand. Picking the order off a hunch is how you spend a
// month on the one that three shops wanted. Every seller who opens cross-listing settings is looking
// straight at the list, which makes it the one place the question costs them nothing to answer.
//
// A VOTE IS NOT A PROMISE. It says "I would use this", and the count is the whole product: no
// roadmap dates, no "planned for Q2", nothing we would then have to be held to.

/** A vote is one shop asking for one channel. The pair is the identity, so a shop votes once. */
export type Vote = { storeSlug: string; platformKey: string };

export type Demand = { key: string; name: string; votes: number; wanted: boolean };

/**
 * The coming-soon channels, most-wanted first.
 *
 * Ties break alphabetically rather than by insertion order, so the list does not silently reward a
 * channel for having been added to the registry first.
 */
export function rankDemand(
 platforms: Array<{ key: string; name: string }>,
 counts: Record<string, number>,
 mine: string[] = [],
): Demand[] {
 const want = new Set(mine);
 return platforms
  // Math.max(0, NaN) is NaN, not 0: a count that arrives as junk has to be tested, not clamped.
  .map((p) => {
   const n = Number(counts[p.key]);
   return { key: p.key, name: p.name, votes: Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0, wanted: want.has(p.key) };
  })
  .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
}

/**
 * What the count says under a channel, in the seller's terms.
 *
 * Nobody is told "0 votes". A channel no one has asked for yet reads as an invitation, and a count
 * of one that is your own is not a crowd: it is you, and saying so is friendlier and more honest
 * than "1 shop wants this".
 */
export function demandLabel(votes: number, wanted: boolean): string {
 if (wanted && votes <= 1) return "You want this";
 if (wanted) return `You and ${votes - 1} other${votes - 1 === 1 ? "" : "s"} want this`;
 if (votes <= 0) return "Want this next?";
 // The verb agrees too: one shop WANTS this.
 return votes === 1 ? "1 shop wants this" : `${votes} shops want this`;
}

// ── Suggestions: the channel that isn't on the list ─────────────────────────────────────────────

/** Tidy a typed-in marketplace name, or null when there is nothing usable in it. */
export function normaliseSuggestion(raw: unknown): string | null {
 if (typeof raw !== "string") return null;
 const s = raw.trim().replace(/\s+/g, " ").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
 // Two characters is not a marketplace, and sixty is someone pasting an essay into the box.
 if (s.length < 2 || s.length > 60) return null;
 // A name, not a sentence. Anything with this much punctuation is a comment, not an answer.
 if (/[<>{}[\]|\\]/.test(s)) return null;
 return s;
}

/**
 * A typed suggestion that is really one of ours, matched back to it.
 *
 * Someone typing "poshmark" into the other box has voted for Poshmark, and counting that as a
 * write-in splits the same signal across two tallies and makes the real one look smaller. Matched
 * on the squashed name, so "Vestiaire Collective", "vestiaire" and "vestiairecollective.com" all
 * land on the same channel.
 */
export function matchKnownPlatform(
 suggestion: string,
 platforms: Array<{ key: string; name: string }>,
): string | null {
 const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
 const s = squash(suggestion).replace(/(com|co|uk|net|shop)$/, "");
 if (!s) return null;
 for (const p of platforms) {
  const name = squash(p.name);
  const key = squash(p.key);
  if (s === name || s === key || s.startsWith(key) || name.startsWith(s)) return p.key;
 }
 return null;
}

/** Write-ins, most-asked first. Grouped case-insensitively, shown as the first spelling seen. */
export function rankSuggestions(rows: Array<{ suggestion: string }>): Array<{ name: string; count: number }> {
 const seen = new Map<string, { name: string; count: number }>();
 for (const r of rows) {
  const name = normaliseSuggestion(r.suggestion);
  if (!name) continue;
  const k = name.toLowerCase();
  const e = seen.get(k);
  if (e) e.count += 1;
  else seen.set(k, { name, count: 1 });
 }
 return [...seen.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
