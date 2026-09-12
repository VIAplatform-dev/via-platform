// Which section-numbering rule the editor and the save agree on.
//
// Sections are addressed by position ("#3"), so the rule that counts them is part of the contract
// between an editor tab and the save route. Version 2 (the imported-site builder, Step 2) stops
// counting the header and footer regions and counts Squarespace's own `.page-section`s. An editor
// tab opened before that change would send version-1 positions, which now point at different
// sections — so the save refuses any section-addressed change that does not carry this number.
//
// Deliberately its own module with no imports: site-capture.ts writes it into the editor and the edit
// route checks it, and neither may depend on the other for it.
export const EDITOR_NUMBERING = 2;

/** Does this save address sections by position, and was it counted under a different rule? */
export function numberingMismatch(body: unknown): boolean {
 const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
 const nonEmpty = (v: unknown) => Array.isArray(v) && v.length > 0;
 // Text, image and link edits are numbered by a rule that did not change, and they carry the value
 // they replace (`was`), which already refuses a stale position. Only section positions moved.
 const addressesSections = Array.isArray(b.sections) || nonEmpty(b.secStyles) || nonEmpty(b.deleteSecs) || nonEmpty(b.dupSecs);
 return addressesSections && b.numbering !== EDITOR_NUMBERING;
}
