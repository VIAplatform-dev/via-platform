// ───────────────────────────────────────────────────────────────────────────
// Greeked template copy.
//
// Templates are authored with real guidance copy — "[Two or three paragraphs on what you look for
// and why]" — and that authored text stays in storefront-templates.ts. This module is what turns it
// into lorem ipsum on the way out, for the specimen gallery AND for the store a seller actually
// receives.
//
// Keeping the authored copy in source rather than overwriting it means two things: the intent of
// each block is still readable by whoever edits the templates, and turning this off is one call
// site rather than a rewrite.
//
// What is NOT greeked, and why: template names and descriptions (they're how a seller picks one),
// page titles (they're the navigation), and CTA labels (a storefront whose every button says
// "Lorem ipsum" can't be clicked through). Everything a visitor would read as content is.
//
// The substitution is length-matched — a three-word heading becomes three words, a long paragraph
// stays long — so a greeked page keeps the exact typographic rhythm the design was built around.
// And it is deterministic: the same input always produces the same output, so nothing reshuffles
// between renders or between the preview and the store.
// ───────────────────────────────────────────────────────────────────────────

const LOREM = (
 "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore " +
 "et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea " +
 "commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur " +
 "excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum"
).split(" ");

/** Same text in, same greeked text out. Word count is preserved so the layout keeps its rhythm. */
export function greek(src: string, seed = 0): string {
 const words = src.trim().split(/\s+/).filter(Boolean).length;
 if (!words) return src;
 const out: string[] = [];
 for (let i = 0; i < words; i++) out.push(LOREM[(seed + i * 3) % LOREM.length]);
 const t = out.join(" ");
 return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Greek one prop value while keeping whatever structure the block parses it by.
 *
 * Column and FAQ lists arrive as "Label | Body | | | " rows. Greeking the whole string would
 * destroy the separators and the block would render one long cell instead of a grid, so each cell
 * is greeked on its own and every "|" and newline is left exactly where it was.
 */
export function greekValue(v: string, seed = 0): string {
 if (!v.trim()) return v;
 if (v.includes("|") || v.includes("\n")) {
  return v
   .split("\n")
   .map((row, r) => row.split("|").map((cell, c) => (cell.trim() ? greek(cell, seed + r * 7 + c * 3) : cell)).join("|"))
   .join("\n");
 }
 return greek(v, seed);
}

/** Content fields. `cta`, `email`, `image`, and layout props (cols, gap, limit) are left alone. */
const CONTENT_KEYS = new Set(["heading", "subtext", "body", "quote", "caption", "attribution", "text", "items", "lede"]);
const isQA = (k: string) => /^[qa]\d$/.test(k);

export function greekProps(props: Record<string, string> | undefined, seed = 0): Record<string, string> | undefined {
 if (!props) return props;
 const out = { ...props };
 let i = 0;
 for (const k of Object.keys(out)) {
  if (typeof out[k] === "string" && (CONTENT_KEYS.has(k) || isQA(k))) out[k] = greekValue(out[k], seed + i * 11);
  i++;
 }
 return out;
}

/** Greek every block in a list, seeding from the block's own type so the result is stable. */
export function greekBlocks<T extends { type?: string; variant?: string; props?: Record<string, string> }>(blocks: T[]): T[] {
 return (blocks || []).map((b, i) => ({ ...b, props: greekProps(b.props, (b.type || "").length * 13 + (b.variant || "").length * 5 + i * 17) }));
}
