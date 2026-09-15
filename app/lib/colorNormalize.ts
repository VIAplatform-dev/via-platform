// ───────────────────────────────────────────────────────────────────────────
// Normalize a free-text colour (from the vision model, e.g. "navy blue",
// "charcoal grey", "black with white pinstripes") to ONE keyword from the site's
// colour-filter vocabulary, so image-derived colours merge cleanly with the
// title-derived ones. Pure + tested. Returns null when nothing maps (never guess).
// ───────────────────────────────────────────────────────────────────────────

// The filter vocabulary. We pick the EARLIEST-mentioned colour, which gives the
// dominant one ("black with white pinstripes" → black) and resolves compound
// shades correctly ("navy blue" → navy, "charcoal grey" → charcoal).
const PALETTE = [
 "off-white", "ivory", "cream", "white",
 "charcoal", "silver", "grey",
 "chocolate", "cognac", "camel", "tan", "brown",
 "navy", "cobalt", "teal", "turquoise", "blue",
 "burgundy", "wine", "crimson", "red",
 "fuchsia", "blush", "rose", "pink",
 "olive", "sage", "forest", "emerald", "mint", "green",
 "mustard", "gold", "yellow",
 "coral", "rust", "orange",
 "lilac", "lavender", "violet", "purple",
 "nude", "beige",
 "multicolor",
 "black",
];

// Synonyms / shade names → a palette word. Checked before the substring scan.
const SYNONYM: Record<string, string> = {
 gray: "grey",
 noir: "black", jet: "black", onyx: "black", ebony: "black",
 offwhite: "off-white", "off white": "off-white", "winter white": "white", snow: "white",
 khaki: "beige", sand: "beige", taupe: "beige", oatmeal: "beige", stone: "beige", ecru: "beige",
 maroon: "burgundy", oxblood: "burgundy",
 aubergine: "purple", eggplant: "purple", plum: "purple",
 midnight: "navy",
 denim: "blue",
 lime: "green", hunter: "forest",
 fuschia: "fuchsia", magenta: "fuchsia",
 salmon: "coral", peach: "coral",
 champagne: "gold", bronze: "gold",
 multi: "multicolor", multicolour: "multicolor", colorful: "multicolor",
 colourful: "multicolor", "color block": "multicolor", "colour block": "multicolor",
};

// Earliest word-bounded position of `word` in `text`, or -1.
function indexOfWord(text: string, word: string): number {
 const m = new RegExp(`\\b${word.replace(/[-]/g, "\\-")}\\b`, "i").exec(text);
 return m ? m.index : -1;
}

export function normalizeColor(raw: string | null | undefined): string | null {
 if (!raw) return null;
 const s = raw.toLowerCase().trim();
 if (!s) return null;

 // Whole-string synonym (e.g. "gray", "off white"): cheap fast path.
 if (SYNONYM[s]) return SYNONYM[s];

 // Otherwise pick the earliest-mentioned colour across palette words AND
 // synonyms, so the dominant (first) colour wins.
 let bestCanon: string | null = null;
 let bestIdx = Infinity;
 const consider = (canon: string, word: string) => {
 const idx = indexOfWord(s, word);
 if (idx >= 0 && idx < bestIdx) {
  bestIdx = idx;
  bestCanon = canon;
 }
 };
 for (const c of PALETTE) consider(c, c);
 for (const [syn, canon] of Object.entries(SYNONYM)) consider(canon, syn);

 return bestCanon;
}
