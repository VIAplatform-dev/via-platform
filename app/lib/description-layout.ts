// The order a shop wants its listings written in, chosen by the shop.
//
// WHY THIS SITS ABOVE THE LEARNED TEMPLATE. description-format.ts reads the shape of a store's
// existing listings and hands it to the drafter, which is the right answer for a shop arriving with
// a catalogue and no opinion yet. It is the wrong answer twice over: a shop with nothing imported
// has no template to read, and a shop that wants to CHANGE how its listings read has no way to say
// so, because everything it publishes from then on is copied from what it published before.
//
// So this is the seller's own answer, and it wins. Measurements first and the prose last is a
// perfectly good way to run a listing, and she should not have to rewrite forty listings by hand to
// get it.
//
// PRESENCE IS THE SWITCH. A section she has turned off is simply not in the array. There is no
// `on: false` to get out of step with the order, and a layout reads as exactly what it produces,
// top to bottom.

/** The facts a listing can be built out of. `custom` is hers, described by its own label. */
export type SectionKey =
 | "description" | "era" | "brand" | "material" | "condition" | "fit" | "size"
 | "measurements" | "colour" | "care" | "sourcing" | "model" | "custom";

export type LayoutSection = {
 key: SectionKey;
 /** Her wording for the heading. "the situation" and "Measurements (laid flat)" are both real. */
 label: string;
 /** What belongs in it. Only meaningful for `custom`, where nothing else says. */
 hint?: string;
};

/** Who can actually fill a section: VYA from the photo, or only the seller. */
export type FilledBy = "vya" | "seller";

export type SectionSpec = {
 key: SectionKey;
 label: string;
 /** What the section is, in the seller's terms. Shown beside it in settings. */
 blurb: string;
 filledBy: FilledBy;
};

/**
 * Everything a listing can be made of, and who fills it.
 *
 * `filledBy` is not decoration. A measurement cannot be taken from a photograph and a fibre cannot
 * be told from one, so those sections come back with their label and an empty value for the seller
 * to complete. Saying which is which in the settings screen is the difference between a seller
 * understanding why a line is blank and thinking the draft is broken.
 */
export const SECTIONS: SectionSpec[] = [
 { key: "description", label: "Description", blurb: "The sentences about the piece itself. Cut, fabric, details.", filledBy: "vya" },
 { key: "brand", label: "Brand", blurb: "The house, and the line within it.", filledBy: "vya" },
 { key: "era", label: "Era", blurb: "The decade or year, when the label or the piece gives it away.", filledBy: "vya" },
 { key: "material", label: "Material", blurb: "Read off the care tag. Left blank when the tag isn't legible.", filledBy: "vya" },
 { key: "colour", label: "Colour", blurb: "The dominant colour, as a shopper would name it.", filledBy: "vya" },
 { key: "condition", label: "Condition", blurb: "The grade and any wear that shows in the photos.", filledBy: "vya" },
 { key: "fit", label: "Fit", blurb: "How it sits, and the modern size it suits.", filledBy: "vya" },
 { key: "size", label: "Size", blurb: "The size on the label, and what it converts to.", filledBy: "seller" },
 { key: "measurements", label: "Measurements", blurb: "Your own tape. VYA leaves the labels ready for you to fill.", filledBy: "seller" },
 { key: "care", label: "Care", blurb: "Washing and handling, off the care tag.", filledBy: "vya" },
 { key: "sourcing", label: "Sourcing", blurb: "Where you found it, and where it ships from.", filledBy: "seller" },
 { key: "model", label: "Model", blurb: "Your model's height and usual size, for scale.", filledBy: "seller" },
 { key: "custom", label: "Your own section", blurb: "Anything else you always say. Name it and say what goes in it.", filledBy: "seller" },
];

export const SPEC: Record<SectionKey, SectionSpec> = Object.fromEntries(
 SECTIONS.map((s) => [s.key, s]),
) as Record<SectionKey, SectionSpec>;

/** What a shop gets before it has said otherwise. The order most resale listings already use. */
export const DEFAULT_LAYOUT: LayoutSection[] = [
 { key: "description", label: "Description" },
 { key: "era", label: "Era" },
 { key: "material", label: "Material" },
 { key: "condition", label: "Condition" },
 { key: "size", label: "Size" },
 { key: "measurements", label: "Measurements" },
];

const KEYS = new Set<string>(SECTIONS.map((s) => s.key));

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Whatever came off the wire or out of the database, made safe.
 *
 * Unknown keys go, because a section the drafter has no idea how to fill is a blank line in every
 * listing she publishes. A repeated key goes too, EXCEPT `custom`: two custom sections are a shop
 * with two things of its own to say, and they are told apart by their labels.
 */
export function coerceLayout(raw: any): LayoutSection[] {
 if (!Array.isArray(raw)) return [];
 const seen = new Set<string>();
 const out: LayoutSection[] = [];
 for (const r of raw) {
  const key = typeof r?.key === "string" && KEYS.has(r.key) ? (r.key as SectionKey) : null;
  if (!key) continue;
  const label = (typeof r?.label === "string" ? r.label : "").trim().slice(0, 60) || SPEC[key].label;
  const dedupe = key === "custom" ? `custom:${label.toLowerCase()}` : key;
  if (seen.has(dedupe)) continue;
  seen.add(dedupe);
  const hint = typeof r?.hint === "string" ? r.hint.trim().slice(0, 200) : "";
  out.push(hint ? { key, label, hint } : { key, label });
  if (out.length >= 14) break;
 }
 return out;
}

/**
 * Seed the editor from what VYA already read off her listings.
 *
 * A shop that arrives with a catalogue should open this screen and find its own format already in
 * it, in its own words, rather than a blank slate and a chore. The labels are hers verbatim, which
 * is why they are kept rather than mapped onto ours: "the situation" is a section heading one shop
 * actually uses, and replacing it with "Description" would be us correcting her.
 */
export function layoutFromLabels(labels: string[]): LayoutSection[] {
 const guess = (label: string): SectionKey => {
  const l = label.toLowerCase();
  if (/measure|dimension/.test(l)) return "measurements";
  if (/era|year|decade|period/.test(l)) return "era";
  if (/material|fabric|composition|fibre|fiber/.test(l)) return "material";
  if (/condition|wear|flaw/.test(l)) return "condition";
  if (/fit|sizing/.test(l)) return "fit";
  if (/size/.test(l)) return "size";
  if (/brand|designer|label|house|maker/.test(l)) return "brand";
  if (/colour|color/.test(l)) return "colour";
  if (/care|wash/.test(l)) return "care";
  if (/sourc|origin|made in|from|ship/.test(l)) return "sourcing";
  if (/model/.test(l)) return "model";
  // Anchored, unlike the rest: "Notes" is a shop's prose, and "Note to vintage collectors" is a
  // section of its own. A loose match swallows the second into the first and she loses a heading.
  if (/^(the )?(situation|details?|description|about|notes?|features?|overview|product details)$/.test(l)) return "description";
  return "custom";
 };
 // Her prose comes first unless she labels it, because every template starts with the piece itself.
 const mapped = labels.map((l) => ({ key: guess(l), label: l }));
 const hasProse = mapped.some((m) => m.key === "description");
 return coerceLayout(hasProse ? mapped : [{ key: "description", label: "Description" }, ...mapped]);
}

/**
 * The layout, written out for the drafter.
 *
 * It replaces the learned template rather than sitting alongside it: two descriptions of the same
 * thing is how a model ends up splitting the difference between them.
 *
 * The house rules above this in the prompt ask for two or three tight sentences and no cataloguing
 * of seams and cuffs. A laid-out listing is neither, so they are switched off by name. And a section
 * only the seller can fill KEEPS ITS LABEL AND COMES BACK EMPTY: dropping it would quietly undo the
 * layout she just set, and filling it would be inventing.
 */
export function layoutInstruction(layout: LayoutSection[], words?: number): string {
 const sections = coerceLayout(layout);
 if (!sections.length) return "";

 const lines = sections.map((s, i) => {
  const spec = SPEC[s.key];
  const what = s.key === "custom" ? (s.hint || "whatever this store always says here") : spec.blurb;
  // A section of her own that SAYS what goes in it is something you can write. Only one with no
  // instruction behind it, and the facts a photograph genuinely cannot give up, are left for her.
  const hers = s.key === "custom" ? !s.hint : spec.filledBy === "seller";
  const who = hers
   ? "THE SELLER FILLS THIS: write the label and leave the value empty"
   : "you fill this from the photos and the piece";
  return `${i + 1}. "${s.label}" - ${what} (${who})`;
 }).join("\n");

 // Prose leads a listing; a label in front of it makes the page read like a form.
 const bare = sections[0]?.key === "description"
  ? `\nThe first part is the prose about the piece. Write it WITHOUT a label in front of it: a paragraph headed "${sections[0].label}" reads like a form, not a listing. Every section after it is written as "Label: value" on its own line.`
  : `\nEvery section is written as "Label: value" on its own line, in this order.`;

 // SPACING HAS TO BE SAID, AND SAID THE WAY THESE LISTINGS ACTUALLY READ. A store with a catalogue
 // has examples to copy the spacing from; a store setting a layout on its first day has none, and
 // left to itself a model puts a blank line between every single section, which reads like a form.
 // "No blank lines anywhere" is the wrong correction though: a paragraph wants air around it. The
 // real rule is the one every templated shop already follows. Short facts group into a block, and
 // anything the length of a sentence stands on its own.
 const spacing = "\nSpacing: sections whose value is a word or a short phrase (era, size, material, colour, condition and the like) go on CONSECUTIVE lines as ONE block with NO blank line between them. Leave a blank line only around a section whose value runs to a full sentence or more, and before a section with several lines of its own. A section with a multi-line value, measurements above all, keeps its label on one line and its values on the lines beneath it.";

 return `\n\nTHIS STORE HAS CHOSEN HOW ITS LISTINGS ARE LAID OUT, AND IT OVERRIDES THE LENGTH AND SHAPE RULES ABOVE.\nWrite the "description" field as exactly these parts, in exactly this order, using exactly these labels, spelled and capitalised exactly as given:\n${lines}\n${bare}${spacing}${words ? `\nTheir listings run about ${words} words.` : ""}\nThe "keep it to 2-3 sentences", "~40-80 words" and "don't catalogue every panel/seam" rules above DO NOT APPLY to this store.\nFILL EVERY SECTION YOU CAN. You are already deciding this piece's era, material, condition and category for the other fields in this JSON: put those same answers in their matching sections here. Anything the seller entered by hand goes in its slot verbatim. Do not add a section that is not on this list, do not drop one that is, and do not reorder them. Never invent a value to fill a section: a measurement you cannot take from a photograph is left empty, with its label, for the seller.`;
}
