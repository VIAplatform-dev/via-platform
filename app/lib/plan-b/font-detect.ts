// The fonts a seller's own site is set in, read back out of the CSS we captured.
//
// WHY. The storefront's font picker offers a curated list of Google families. None of them is the
// face her shop is actually set in, so the one font she definitely wants — her own — was the one
// option the dropdown didn't have. Her stylesheet already names it, and (for a captured site) her
// @font-face rules and the files they point at came over with it, so choosing it needs nothing we
// don't already hold.
//
// A NOTE ON THE FONT FILES. What this reads is a NAME. On her own captured pages that name resolves,
// because her @font-face rules are in the same stylesheet. It does not follow that the face can be
// served to a DIFFERENT store: webfont licences are per-domain, and re-serving a foundry's file to
// somebody else's shop is not ours to do. So these are offered to the seller they came from.

/** Families that name a category or a system stack rather than a face, plus CSS-wide keywords. */
const GENERIC = new Set([
 "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif",
 "ui-monospace", "ui-rounded", "math", "emoji", "fangsong", "inherit", "initial", "unset", "revert",
 "revert-layer", "none", "auto",
 // The system stack, spelled the handful of ways every theme spells it.
 "-apple-system", "blinkmacsystemfont", "segoe ui", "helvetica neue", "helvetica", "arial",
 "roboto", "oxygen", "ubuntu", "cantarell", "fira sans", "droid sans", "apple color emoji",
 "segoe ui emoji", "segoe ui symbol", "noto color emoji", "sans", "times", "times new roman",
 "georgia", "courier", "courier new", "verdana", "tahoma", "trebuchet ms",
]);

const clean = (raw: string): string =>
 raw.trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, " ").trim();

/** Is this a real face we can offer, rather than a category, a system stack, or a variable? */
function usable(name: string): boolean {
 if (!name || name.length > 60) return false;
 if (name.startsWith("var(") || name.startsWith("--")) return false;
 if (GENERIC.has(name.toLowerCase())) return false;
 // A face has letters in it. "0", "1.5rem" and the like are parse debris.
 return /[a-z]/i.test(name);
}

export type DetectedFont = { family: string; declared: number; face: boolean };

/**
 * Every font family the captured CSS names, most-used first.
 *
 * `face: true` means the stylesheet also carries an @font-face for it — the face itself came over,
 * so picking it renders in the real thing rather than a fallback. Those sort ahead of families that
 * are only ever named, which on most themes are the system-stack leftovers.
 */
export function detectSiteFonts(css: string, limit = 12): DetectedFont[] {
 const src = String(css || "");
 if (!src) return [];
 const counts = new Map<string, number>();
 const faces = new Set<string>();

 // @font-face { font-family: X } — the faces the site actually ships.
 for (const m of src.matchAll(/@font-face\s*\{[^}]*?font-family\s*:\s*([^;}]+)/gi)) {
  const name = clean(m[1].split(",")[0]);
  if (usable(name)) faces.add(name.toLowerCase());
 }
 // Every font-family declaration; the FIRST name in a stack is the one the theme wants.
 for (const m of src.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
  for (const part of m[1].split(",")) {
   const name = clean(part);
   if (!usable(name)) continue;
   counts.set(name, (counts.get(name) || 0) + 1);
   break; // only the head of the stack; the rest is the fallback chain
  }
 }
 // Also catch the shorthand `font: italic 700 1rem/1.2 "Peignot", serif`.
 for (const m of src.matchAll(/[^-]font\s*:\s*[^;}{]*?(["'][^"';}{]+["'])/gi)) {
  const name = clean(m[1]);
  if (usable(name)) counts.set(name, (counts.get(name) || 0) + 1);
 }

 // One entry per face, whatever case the stylesheet happened to use.
 const byKey = new Map<string, DetectedFont>();
 for (const [family, declared] of counts) {
  const key = family.toLowerCase();
  const prev = byKey.get(key);
  if (prev) prev.declared += declared;
  else byKey.set(key, { family, declared, face: faces.has(key) });
 }
 // A face the site ships but never names in a rule we parsed is still hers to pick.
 for (const key of faces) if (!byKey.has(key)) byKey.set(key, { family: key, declared: 0, face: true });

 return [...byKey.values()]
  .sort((a, b) => Number(b.face) - Number(a.face) || b.declared - a.declared || a.family.localeCompare(b.family))
  .slice(0, limit);
}
