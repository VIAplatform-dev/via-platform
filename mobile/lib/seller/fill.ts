// What an AI pass is allowed to write into a listing that already exists. Pure.
//
// This is one rule, and it is the rule the whole "Fill with AI" button rests on: THE MODEL FILLS
// BLANKS. It never replaces a word the seller wrote, on any field, for any reason — not a title she
// shortened, not a description she rewrote, not an era she knows because she bought the piece from
// the person who wore it. A pass that overwrites is not a convenience, it is a piece of work
// destroyed by a button she pressed for help, and the only way she would find out is by reading
// every field afterwards — which is the work the button was supposed to save.
//
// It lives out here rather than in the screen so a test can hold it, for the reason listing-fields.ts
// gives about its own list: the editing is not what goes wrong, the rule is.

import type { FieldKey } from "./listing-fields.ts";
import { hasRealValue, flawsToLine, type DraftFields } from "./intake-shape.ts";

export type Fill = {
  /** Only the fields to write, in the shape the editor's form state holds (strings). */
  values: Partial<Record<FieldKey, string>>;
  /** Which ones those were — the count is what the screen reports back to her. */
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
  // The grade goes on the scale and the model's sentence about the wear becomes the note —
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
  if (filled.length === 0) return "Nothing left to fill — everything it could read is already here.";
  return `Filled ${filled.length} empty ${filled.length === 1 ? "field" : "fields"}. Nothing you had written was changed — check them before you leave.`;
}
