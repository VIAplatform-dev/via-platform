// Which order the section editor lists a captured section's fields in.
//
// A captured page gives up its text, its images and its links as three separate runs — every
// paragraph first, then every image, then every href. So the words of a link and the address it
// points at ended up dozens of fields apart, and since every link's text field is labelled the same
// ("Link text"), checking where one of twenty pointed meant matching them by eye.
//
// A link field carries the text it belongs to. That's enough to put the destination directly under
// the words, which is the only place a seller looks for it.

export type OrderableField =
 | { kind: "text"; eid: number; value: string; tag: string }
 | { kind: "image"; id: number; src: string }
 | { kind: "link"; id: number; href: string; label: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Display order, as {field, i} pairs — `i` is the field's ORIGINAL index and must be carried
 * through, because every edit addresses the real element in the page by it. Reordering the array
 * without the index would write a link's href onto a paragraph.
 */
export function orderFieldsForPanel<T extends OrderableField>(fields: T[]): { f: T; i: number }[] {
 const all = fields.map((f, i) => ({ f, i }));
 const links = all.filter((x) => x.f.kind === "link");
 const used = new Set<number>();
 const out: { f: T; i: number }[] = [];

 for (const entry of all) {
  if (entry.f.kind === "link") continue; // placed under its text, or appended below
  out.push(entry);
  if (entry.f.kind !== "text") continue;
  const label = norm(entry.f.value);
  if (!label) continue;
  // The first unused link whose text matches these words. First-unused, not any-match, so a page
  // with two "Shop" links pairs them with the two "Shop" texts rather than both to the first.
  const hit = links.find((l) => !used.has(l.i) && l.f.kind === "link" && norm(l.f.label) === label);
  if (hit) { used.add(hit.i); out.push(hit); }
 }

 // A link whose words were never found still has to be editable — appended, never dropped.
 for (const l of links) if (!used.has(l.i)) out.push(l);
 return out;
}

/**
 * Just the thing you clicked, and everything else.
 *
 * Clicking one product title opened an "Edit section" panel listing every field in the section —
 * on a collection grid that is forty boxes, every one of them labelled "Text", including the same
 * caption twice because a tile carries both a label and an overlay. You came to change one title
 * and had to find it.
 *
 * So: when a specific element was clicked, its fields come first and the rest of the section is
 * put behind a disclosure. Nothing is removed — a seller who wants the whole section can still
 * open it, and clicking the section chrome rather than an element shows everything as before.
 */
export function splitFocusedFields<T extends OrderableField>(
 ordered: { f: T; i: number }[],
 focusEid: number | null,
 /** The clicked IMAGE, when she clicked a picture rather than words. A collection tile is a picture,
  *  so clicking one listed every photo in the row — five "Image / Replace" rows, none of them
  *  telling her which tile she had hold of. */
 focusImgId: number | null = null,
): { focused: { f: T; i: number }[]; rest: { f: T; i: number }[] } {
 if (focusImgId != null) {
  const img = ordered.findIndex((x) => x.f.kind === "image" && x.f.id === focusImgId);
  if (img >= 0) return { focused: [ordered[img]], rest: [...ordered.slice(0, img), ...ordered.slice(img + 1)] };
 }
 if (focusEid == null) return { focused: [], rest: ordered };
 const at = ordered.findIndex((x) => x.f.kind === "text" && x.f.eid === focusEid);
 if (at < 0) return { focused: [], rest: ordered };
 // The text, plus the link that was paired to sit directly under it.
 const take = ordered[at + 1]?.f.kind === "link" ? 2 : 1;
 return {
  focused: ordered.slice(at, at + take),
  rest: [...ordered.slice(0, at), ...ordered.slice(at + take)],
 };
}
