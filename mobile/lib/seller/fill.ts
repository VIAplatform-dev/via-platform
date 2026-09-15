// What an AI pass is allowed to write into a listing that already exists. Pure.
//
// This is one rule, and it is the rule the whole "Fill with AI" button rests on: THE MODEL FILLS
// BLANKS. It never replaces a word the seller wrote, on any field, for any reason, not a title she
// shortened, not a description she rewrote, not an era she knows because she bought the piece from
// the person who wore it. A pass that overwrites is not a convenience, it is a piece of work
// destroyed by a button she pressed for help, and the only way she would find out is by reading
// every field afterwards, which is the work the button was supposed to save.
//
// It lives out here rather than in the screen so a test can hold it, for the reason listing-fields.ts
// gives about its own list: the editing is not what goes wrong, the rule is.

import type { FieldKey } from "./listing-fields.ts";
import { hasRealValue, flawsToLine, type DraftFields } from "./intake-shape.ts";

export type Fill = {
  /** Only the fields to write, in the shape the editor's form state holds (strings). */
  values: Partial<Record<FieldKey, string>>;
  /** Which ones those were. The count is what the screen reports back to her. */
  filled: FieldKey[];
  /** Whether any parcel dimension was among them, so the caller can re-read the "Ships in" box. */
  parcelFilled: boolean;
};

const PARCEL: FieldKey[] = ["weightOz", "lengthIn", "widthIn", "heightIn"];

/**
 * A draft from /api/store/intake + what the piece already says → what to write.
 *
 * `current` is asked for each field rather than passed as an object because the editor's idea of
 * "what it says now" is two-layered: the unsaved edit if there is one, otherwise the stored value.
 * Anything non-blank there is hers and is left alone.
 */
export function fillBlanks(draft: DraftFields, current: (key: FieldKey) => string): Fill {
  const values: Partial<Record<FieldKey, string>> = {};
  const filled: FieldKey[] = [];

  const put = (key: FieldKey, v: string | null | undefined) => {
    if (current(key).trim()) return; // hers
    if (!hasRealValue(v)) return; // "N/A" is the model saying it cannot tell
    values[key] = String(v).trim();
    filled.push(key);
  };

  put("title", draft.title);
  put("brand", draft.brand);
  put("era", draft.era);
  put("material", draft.material);
  put("colour", draft.colour);
  put("size", draft.size);
  put("category", draft.category);
  // The grade goes on the scale and the model's sentence about the wear becomes the note,
  // normalizeDraft has already split those two apart (intake-shape.ts).
  put("condition", draft.condition);
  put("conditionNote", draft.conditionNote);
  put("description", draft.description);
  // Flaws are a list everywhere else and one comma-separated line in this editor.
  if (draft.flaws?.length) put("flaws", flawsToLine(draft.flaws));
  // The parcel is the model's judgement of what this ships as, and it arrives whole or not at all.
  if (draft.parcel) {
    put("weightOz", String(draft.parcel.weightOz));
    if (draft.parcel.lengthIn) put("lengthIn", String(draft.parcel.lengthIn));
    if (draft.parcel.widthIn) put("widthIn", String(draft.parcel.widthIn));
    if (draft.parcel.heightIn) put("heightIn", String(draft.parcel.heightIn));
  }

  return { values, filled, parcelFilled: filled.some((k) => PARCEL.includes(k)) };
}

/** What to tell her happened. Said plainly, because the screen has just changed under her hands. */
export function fillSummary(filled: FieldKey[]): string {
  if (filled.length === 0) return "Nothing left to fill. Everything it could read is already here.";
  return `Filled ${filled.length} empty ${filled.length === 1 ? "field" : "fields"}. Nothing you had written was changed. Check them before you leave.`;
}

/** The draft-shaped fields a listing carries through the new-piece flow, for FILLABLE below. */
type DraftKey = "title" | "brand" | "era" | "material" | "colour" | "size" | "category" | "condition" | "conditionNote" | "description";

const FILLABLE: DraftKey[] = ["title", "brand", "era", "material", "colour", "size", "category", "condition", "conditionNote", "description"];

/** Field key → the word she reads on the row, for the "filled these" line. */
const SAID: Partial<Record<string, string>> = { colour: "colour", conditionNote: "condition note", weight: "ships as" };

/**
 * The same rule as fillBlanks, for the NEW-PIECE flow rather than the editor.
 *
 * Two shapes exist because the two screens hold a listing differently: the editor keeps flat
 * form strings (lengthIn, widthIn, heightIn as separate boxes), the flow keeps DraftFields with a
 * `parcel` object and `flaws` as a list. Converting between them at the call site is where a field
 * gets quietly dropped, so each shape gets its own function and its own test, and both obey the one
 * rule: THE MODEL FILLS BLANKS. Nothing she typed is touched.
 */
export function fillDraftBlanks(draft: DraftFields, current: DraftFields): { fields: DraftFields; filled: string[] } {
  const out: DraftFields = { ...current };
  const filled: string[] = [];

  for (const key of FILLABLE) {
    if (String(current[key] ?? "").trim()) continue; // hers
    const v = draft[key];
    if (!hasRealValue(v)) continue; // "N/A" is the model saying it cannot tell
    out[key] = String(v).trim();
    filled.push(key);
  }

  // Flaws arrive as a list here, not a line. One she has already named is an answer, even if the
  // model found others. Adding to it would read as her having written them.
  if (!current.flaws?.length && draft.flaws?.length) {
    out.flaws = draft.flaws;
    filled.push("flaws");
  }

  // The parcel is the model's judgement of what this ships as, and it arrives whole or not at all.
  // A weight she typed on Review outranks it, and so does a parcel already on the draft.
  if (!current.parcel && !String(current.weightOz ?? "").trim() && draft.parcel) {
    out.parcel = draft.parcel;
    filled.push("weight");
  }

  return { fields: out, filled };
}

/** "Filled brand, era and 3 more.". What changed under her hands, named rather than counted. */
export function describeFilled(filled: string[]): string {
  if (filled.length === 0) return "Nothing left to fill. Everything it could read is already here.";
  const words = filled.map((k) => SAID[k] ?? k);
  const head = words.slice(0, 2).join(", ");
  const rest = words.length - 2;
  const list = rest > 0 ? `${head} and ${rest} more` : words.length === 2 ? `${words[0]} and ${words[1]}` : words[0];
  return `Filled ${list}. Nothing you had written was changed.`;
}

