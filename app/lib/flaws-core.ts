// Flaws on a piece, as a list. Pure — no I/O.
//
// The intake model has always returned `flaws[]`; the listing only ever had a condition word and
// a description to bury them in. A list that prints under Condition is what a secondhand buyer
// actually reads before paying, and what saves the return.

export const MAX_FLAWS = 12;
export const MAX_FLAW_LENGTH = 140;

// "none", "no flaws", "n/a" — the model's way of saying the list is empty, and not a flaw.
const NOTHING = /^(none|n\/?a|nil|no (visible )?(flaws?|defects?|damage)( (seen|noted|visible))?|-)$/i;

/**
 * Trimmed, deduped (case-insensitive), capped in count and length. A flaw that only repeats the
 * condition grade ("Good", "very good condition") is dropped: that's the Condition line's job.
 */
export function normalizeFlaws(raw: unknown, condition?: string | null): string[] {
 if (!Array.isArray(raw)) return [];
 const cond = String(condition ?? "").trim().toLowerCase();
 const seen = new Set<string>();
 const out: string[] = [];
 for (const v of raw) {
  if (typeof v !== "string") continue;
  const s = v.trim().replace(/\s+/g, " ").slice(0, MAX_FLAW_LENGTH);
  if (!s) continue;
  const key = s.toLowerCase();
  if (NOTHING.test(key)) continue;
  if (cond && (key === cond || key === `${cond} condition` || key.replace(/ condition$/, "") === cond)) continue;
  if (seen.has(key)) continue;
  seen.add(key);
  out.push(s);
  if (out.length >= MAX_FLAWS) break;
 }
 return out;
}

/** The editors take one flaw per line, or a comma-separated line — whichever she types. */
export function flawsFromText(text: string, condition?: string | null): string[] {
 const parts = /\n/.test(text) ? text.split(/\n/) : text.split(",");
 return normalizeFlaws(parts, condition);
}

export function flawsToText(flaws: string[] | null | undefined): string {
 return (flaws ?? []).join("\n");
}
