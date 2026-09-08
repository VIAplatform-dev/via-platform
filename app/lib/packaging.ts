// What a seller is actually putting the piece in — and what that means for the postage.
//
// The form used to ask for a weight in ounces and then a length, width and height. Four numbers,
// about an object she is holding. Nobody measures a mailer. She knows what she's packing it into,
// so that's the question.
//
// But packaging is not the whole answer, and getting this wrong costs real money. The buyer pays a
// flat tier (shipping-tiers.ts) chosen by the LARGER of the parcel's weight and its girth. A big
// sweatshirt in a poly mailer is light enough for Small and far too big for it — so "poly mailer"
// alone can't be an option. Every option here is a type AND a size, and the dimensions are the ones
// that land the parcel in the tier it actually belongs to.

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
 { id: "mailer-s",  label: "Poly mailer — small",  hint: "A tee, a scarf, jewellery",        lengthIn: 10, widthIn: 13, heightIn: 1,  tareOz: 1 },
 { id: "padded",    label: "Padded mailer",        hint: "A bag, shoes without their box",   lengthIn: 9,  widthIn: 12, heightIn: 2,  tareOz: 2 },
 { id: "mailer-l",  label: "Poly mailer — large",  hint: "A sweatshirt, jeans, a knit",      lengthIn: 14, widthIn: 17, heightIn: 2,  tareOz: 2 },
 { id: "box-s",     label: "Box — small",          hint: "A dress, a blouse, most clothing", lengthIn: 12, widthIn: 10, heightIn: 4,  tareOz: 5 },
 { id: "box-m",     label: "Box — medium",         hint: "Shoes in their box, a heavy knit", lengthIn: 14, widthIn: 12, heightIn: 6,  tareOz: 8 },
 { id: "box-l",     label: "Box — large",          hint: "A coat, boots, a leather jacket",  lengthIn: 20, widthIn: 16, heightIn: 10, tareOz: 12 },
 { id: "box-xl",    label: "Box — extra large",    hint: "A fur, a puffer, several pieces",  lengthIn: 24, widthIn: 18, heightIn: 12, tareOz: 18 },
];

export const packagingById = (id: string | null | undefined): Packaging | null =>
 PACKAGING.find((p) => p.id === id) ?? null;

/** L + W + H — the measure the shipping tiers are written against. */
export const girthOf = (p: Packaging): number => p.lengthIn + p.widthIn + p.heightIn;

/** The piece plus its packaging: what actually goes on the scale, and what the tier is chosen from. */
export function packedWeightOz(pieceOz: number | null | undefined, packing: Packaging | null): number {
 const piece = Number(pieceOz);
 if (!Number.isFinite(piece) || piece <= 0) return 0;
 return Math.round(piece + (packing?.tareOz ?? 0));
}

/**
 * The packaging a piece most likely needs, from the weight the AI judged it to be. Only ever a
 * starting point — the seller can see the tier it produces and change it.
 */
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
