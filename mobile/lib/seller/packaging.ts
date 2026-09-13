// What the piece ships in — the web's question, on the phone.
//
// The phone asked for four numbers: packed weight, box length, box width, box height. Nobody
// measures a mailer. The web stopped asking years-of-UI ago and asks one question instead —
// "Ships in" — because a seller knows what she is putting it in, and the dimensions follow from
// that. The phone kept the four boxes, so the same piece was described two different ways
// depending on which device she happened to be holding.
//
// VALUES ARE COPIED FROM app/lib/packaging.ts, VERBATIM. They are not "about right": the buyer
// pays a flat tier chosen by the LARGER of the parcel's weight and its girth, so a wrong number
// here is money the store eats on every single parcel. A test in this folder asserts the two lists
// still agree, and that test is the only thing standing between a silent divergence and a shop
// quietly losing a few dollars a sale.

export type Packaging = {
  id: string;
  label: string;
  hint: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  /** What the packaging itself weighs. A big box is most of a pound before anything goes in. */
  tareOz: number;
};

export const PACKAGING: Packaging[] = [
  { id: "mailer-s", label: "Poly mailer — small", hint: "A tee, a scarf, jewellery", lengthIn: 10, widthIn: 13, heightIn: 1, tareOz: 1 },
  { id: "padded", label: "Padded mailer", hint: "A bag, shoes without their box", lengthIn: 9, widthIn: 12, heightIn: 2, tareOz: 2 },
  { id: "mailer-l", label: "Poly mailer — large", hint: "A sweatshirt, jeans, a knit", lengthIn: 14, widthIn: 17, heightIn: 2, tareOz: 2 },
  { id: "box-s", label: "Box — small", hint: "A dress, a blouse, most clothing", lengthIn: 12, widthIn: 10, heightIn: 4, tareOz: 5 },
  { id: "box-m", label: "Box — medium", hint: "Shoes in their box, a heavy knit", lengthIn: 14, widthIn: 12, heightIn: 6, tareOz: 8 },
  { id: "box-l", label: "Box — large", hint: "A coat, boots, a leather jacket", lengthIn: 20, widthIn: 16, heightIn: 10, tareOz: 12 },
  { id: "box-xl", label: "Box — extra large", hint: "A fur, a puffer, several pieces", lengthIn: 24, widthIn: 18, heightIn: 12, tareOz: 18 },
];

export const packagingById = (id: string | null | undefined): Packaging | null =>
  PACKAGING.find((p) => p.id === id) ?? null;

/** The piece plus its packaging: what actually goes on the scale. */
export function packedWeightOz(pieceOz: number | null | undefined, packing: Packaging | null): number {
  const piece = Number(pieceOz);
  if (!Number.isFinite(piece) || piece <= 0) return 0;
  return Math.round(piece + (packing?.tareOz ?? 0));
}

/** The packaging a piece most likely needs, from its weight. Only ever a starting point. */
export function suggestPackaging(weightOz: number | null | undefined): string {
  const w = Number(weightOz);
  if (!Number.isFinite(w) || w <= 0) return "box-s";
  if (w <= 8) return "mailer-s";
  if (w <= 16) return "padded";
  if (w <= 28) return "mailer-l";
  if (w <= 44) return "box-s";
  if (w <= 72) return "box-m";
  if (w <= 120) return "box-l";
  return "box-xl";
}

/**
 * Which packaging a piece is ALREADY in, read back from its stored dimensions.
 *
 * There is no `packaging` column — the web writes the preset's L/W/H onto the item and that is all
 * the database keeps. So opening a piece has to recognise its own box, or every edit would silently
 * reset a carefully chosen large box back to the suggestion.
 *
 * Falls back to suggesting from the weight when the numbers match nothing (a piece measured by hand
 * on the old form, or one never given dimensions at all).
 */
export function packagingFromDims(dims: {
  lengthIn?: number | string | null;
  widthIn?: number | string | null;
  heightIn?: number | string | null;
  weightOz?: number | string | null;
}): string {
  const l = Number(dims.lengthIn), w = Number(dims.widthIn), h = Number(dims.heightIn);
  const exact = PACKAGING.find((p) => p.lengthIn === l && p.widthIn === w && p.heightIn === h);
  if (exact) return exact.id;
  return suggestPackaging(Number(dims.weightOz));
}

/** The line under the picker: the box, the packed weight, and what it means. */
export function packagingSummary(packingId: string, pieceOz: number | string | null | undefined): string | null {
  const box = packagingById(packingId);
  if (!box) return null;
  const packed = packedWeightOz(Number(pieceOz), box);
  if (!packed) return `${box.lengthIn}×${box.widthIn}×${box.heightIn} in · add a weight so the buyer is quoted the right postage`;
  return `${box.lengthIn}×${box.widthIn}×${box.heightIn} in · about ${packed} oz packed`;
}
