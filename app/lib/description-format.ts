// The SHAPE of a store's descriptions, read off the descriptions themselves.
//
// WHY THIS EXISTS. Most shops that arrive with a catalogue write to a fixed template, not to a
// vibe. Of 400 imported descriptions, 338 use labelled sections, and one shop's 177 pieces all read:
//
//   <a sentence or two about the piece>
//   Era: / Material: / Condition: / Fit:
//   Measurements (laid flat): <a block of them>
//   Model is 5'6" and usually wears a size M.
//   Sourced in Milan, Italy. Shipping from Washington, DC.
//
// So "write in their voice" is mostly the wrong question. Voice is the small half. The big half is
// structure, and structure is the half that was being thrown away before the learner ever saw it:
// every one of those descriptions is stored as HTML, and the old stripHtml turned `<br>` into a
// space and collapsed the lot into one run-on line. The model was then asked to describe the store's
// "line breaks, fixed sections and template" from samples that had neither.
//

// Structure is also the half you do not need a model for. A template repeats: that is what makes it
// one. So it is read here, deterministically, and handed to the drafter as fact rather than left for
// Haiku to notice and paraphrase.

/**
 * HTML to text, keeping the line breaks that ARE the template.
 *
 * `<br>` and the end of every block element become newlines. Only horizontal whitespace is
 * collapsed, so indentation goes and the shape stays. Runs of blank lines cap at one, because a
 * shop that leaves three between sections means the same thing as one.
 */
export function stripHtml(s: string): string {
 return String(s || "")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|section)\s*>/gi, "\n")
  .replace(/<(p|div|li|tr|h[1-6]|blockquote|section)\b[^>]*>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&apos;/g, "'").replace(/&[a-z]+;/gi, " ")
  // Horizontal whitespace only. \s would eat the newlines we just made.
  .replace(/[^\S\n]+/g, " ")
  .split("\n").map((l) => l.trim()).join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
}

/** A label that opens a line, like "Era:" or "Measurements (laid flat):". */
const LABEL = /^([A-Za-z][A-Za-z '()/&-]{0,40}):\s*/;

/** The labels this description uses, in the order they appear. */
export function sectionLabels(text: string): string[] {
 const out: string[] = [];
 for (const line of stripHtml(text).split("\n")) {
  const m = LABEL.exec(line.trim());
  // A label is a short opener, not a sentence that happens to contain a colon.
  if (m && m[1].split(/\s+/).length <= 4) out.push(m[1].trim());
 }
 return out;
}

export type Template = {
 /** Whether this shop writes to a repeatable template rather than freehand. */
 templated: boolean;
 /** The labelled sections it uses nearly every time, in the order they usually appear. */
 labels: string[];
 /** Typical length, so the drafter matches it instead of the house default. */
 medianWords: number;
};

const median = (ns: number[]): number => {
 if (!ns.length) return 0;
 const s = [...ns].sort((a, b) => a - b);
 return s[Math.floor(s.length / 2)];
};

/**
 * Read a shop's template off its own listings.
 *
 * A label counts when it shows up in at least 60% of them: that is the line between a template and
 * one seller mentioning "Condition:" on a piece that had a flaw. Ordered by where the label usually
 * falls, so "Era" comes before "Measurements" because it does in their listings, not because we
 * think it should.
 */
export function detectTemplate(descriptions: string[]): Template {
 const texts = descriptions.map((d) => stripHtml(d)).filter((d) => d.length > 30);
 const empty = { templated: false, labels: [], medianWords: 0 };
 if (texts.length < 3) return empty;

 const seen = new Map<string, { docs: number; positions: number[] }>();
 for (const t of texts) {
  const labels = sectionLabels(t);
  const once = new Set<string>();
  labels.forEach((l, i) => {
   const key = l.toLowerCase();
   if (once.has(key)) return;
   once.add(key);
   const e = seen.get(key) ?? { docs: 0, positions: [] };
   e.docs += 1;
   e.positions.push(i);
   seen.set(key, e);
  });
 }

 const cutoff = texts.length * 0.6;
 const kept = [...seen.entries()]
  .filter(([, v]) => v.docs >= cutoff)
  .sort((a, b) => median(a[1].positions) - median(b[1].positions));

 // The label as the shop capitalises it, not lowercased for matching.
 const cased = new Map<string, string>();
 for (const t of texts) for (const l of sectionLabels(t)) if (!cased.has(l.toLowerCase())) cased.set(l.toLowerCase(), l);

 const labels = kept.map(([k]) => cased.get(k) ?? k);
 return {
  templated: labels.length >= 2,
  labels,
  medianWords: median(texts.map((t) => t.split(/\s+/).filter(Boolean).length)),
 };
}

/**
 * The template, written out for the drafter.
 *
 * Empty when the shop has no template, which leaves the house description rules in charge. When
 * there IS one it has to WIN, so this says so in as many words: the standing rules tell the model to
 * write two or three tight sentences and not to catalogue details, and this shop writes 105 words
 * that open by cataloguing exactly that. Both cannot be obeyed, and a model handed two rules obeys
 * the blend, which is how a strict template comes back as a paragraph.
 *
 * MEASUREMENTS ARE THE TRAP. The template asks for a block of them and the model is rightly banned
 * from inventing any. Told only that, it drops the section and the template silently stops being the
 * template. So it keeps the section and leaves the numbers for the seller.
 */
export function templateInstruction(t: Template): string {
 if (!t.templated) return "";
 const labels = t.labels.map((l) => `"${l}:"`).join(", ");
 return `\n\nTHIS STORE WRITES TO A FIXED TEMPLATE, AND IT OVERRIDES THE LENGTH AND SHAPE RULES ABOVE.\nEvery listing they publish uses these labelled sections, in this order: ${labels}. Their descriptions run about ${t.medianWords} words, not 2-3 sentences.\nReproduce that template exactly: the same labels, spelled and punctuated the same way, in the same order, each on its own line, with the SAME spacing as the examples above: where they group labels on consecutive lines, group them; where they leave a blank line between one part and the next, leave one. Where they open with a run-on of construction details (necklines, buttons, seams, hems, cuffs), do the same. The "keep it to 2-3 sentences", "~40-80 words" and "don't catalogue every panel/seam" rules above DO NOT APPLY to this store.\nFILL EVERY SECTION YOU CAN. You are already deciding this piece's era, material, condition and category for the other fields in this JSON: put those same answers in their matching sections here, worded the way this store words them. Anything the seller entered by hand goes in its slot verbatim. A section whose answer you genuinely do not have, above all a measurement, which you cannot take from a photograph, KEEPS ITS LABEL AND IS LEFT EMPTY for the seller to complete. Never delete a section, never reorder them, and never invent a value to fill one. Leaving a section blank is the last resort, not the default: a draft that comes back with every section empty is a failed draft.\nAnything the seller has already entered (size, condition, measurements) goes in its slot verbatim.`;
}
