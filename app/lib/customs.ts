// Everything a parcel needs to cross a border.
//
// WHY THIS EXISTS. VYA sent EasyPost and Shippo a shipment with only an address and a box. That is
// enough for a domestic label and not enough for anything else: both carriers require a customs
// declaration on any shipment leaving the country, so an international label either returned no
// rates at all or failed at purchase. VYA has UK, Canadian and Australian stores whose buyers are
// largely American, which means for those stores EVERY order was the broken case.
//
// THE THREE THINGS A DECLARATION NEEDS, and the three things sellers get wrong:
//
//   1. WHAT IT IS — an HS tariff code. Customs charges duty by code, not by description, and
//      "vintage dress" is not a code. We derive one from the category the seller already picked,
//      because asking a vintage dealer for a tariff number gets you an empty field.
//
//   2. WHERE IT WAS MADE — the country of ORIGIN, which for resale is where the garment was
//      manufactured, not where the seller is standing. A 1990s Prada coat posted from London is
//      Italian, and declaring it British is a false declaration.
//
//   3. WHO PAYS THE DUTY — the incoterm. This is the one that actually bites. A store can say
//      "duties covered" on its website and still ship DAP, in which case the courier bills the
//      buyer at the door regardless of the promise, and the seller refunds it and pays twice. The
//      promise lives in the declaration, not in the copy.
//
// Pure: no network, no database. The carrier modules turn what comes out of here into their own
// field names.

/** Who settles the duty. Drives the incoterm, the storefront copy, and any checkout line. */
export type DutyMode =
 /** Marked into the price. The seller pays the carrier; the buyer sees one number. Ships DDP. */
 | "absorbed"
 /** Quoted and charged as its own line at checkout. Also ships DDP. */
 | "collected"
 /** The buyer settles with the courier on delivery. Ships DAP, and the storefront must say so. */
 | "buyer_pays";

export const DEFAULT_DUTY_MODE: DutyMode = "buyer_pays";

export function isDutyMode(v: unknown): v is DutyMode {
 return v === "absorbed" || v === "collected" || v === "buyer_pays";
}

/**
 * The incoterm for a duty mode.
 *
 * DDP — delivered duty paid — bills the duty back to the shipper's carrier account. DDU (which
 * EasyPost still calls DDU, and the rest of the world now calls DAP) leaves it with the buyer.
 *
 * A seller who absorbs duty in her prices MUST ship DDP. Otherwise she has paid for the duty twice:
 * once in the margin she gave up, and again refunding the buyer the courier billed.
 */
export function incotermFor(mode: DutyMode): "DDP" | "DDU" {
 return mode === "buyer_pays" ? "DDU" : "DDP";
}

/**
 * What duty mode a store may ACTUALLY use, given whose carrier account the parcel ships on.
 *
 * THE RULE: DDP is only offered to a store shipping on its OWN carrier account.
 *
 * Postage and duty look alike and behave nothing alike. Postage is known the moment the label is
 * bought, so VYA buys it and charges the seller's card in the same breath. Duty is invoiced by the
 * carrier WEEKS later, once customs has cleared, in an amount nobody knew at label time — on a $761
 * dress it was $189. Shipping DDP on VYA's own wallet would mean VYA taking on an unknown debt, for
 * a third party, payable long after the seller has been paid out and possibly left.
 *
 * So a store on VYA's wallet ships DDU and the courier bills the buyer. A store that has connected
 * its own carrier account can promise "duties covered", because the carrier bills THEM directly and
 * VYA is never in the middle.
 *
 * `downgraded` is returned rather than silently applied: a seller who chose "duties covered" has to
 * be told her buyers will be billed instead, or she'll promise it on her storefront regardless.
 */
export function resolveDutyMode(requested: DutyMode, hasOwnCarrierAccount: boolean): { mode: DutyMode; downgraded: boolean } {
 if (requested === "buyer_pays") return { mode: "buyer_pays", downgraded: false };
 if (hasOwnCarrierAccount) return { mode: requested, downgraded: false };
 return { mode: "buyer_pays", downgraded: true };
}

/** Does this shipment cross a border? */
export function isInternational(fromCountry: unknown, toCountry: unknown): boolean {
 const a = String(fromCountry ?? "").trim().toUpperCase();
 const b = String(toCountry ?? "").trim().toUpperCase();
 if (!/^[A-Z]{2}$/.test(a) || !/^[A-Z]{2}$/.test(b)) return false;
 return a !== b;
}

/* ── HS tariff codes ───────────────────────────────────────────────────────
 * Six-digit headings, which are harmonised worldwide — the further digits vary by country and
 * customs will accept six. Keyed on the SAME category slugs as tax-codes.ts so the two mappings
 * can't drift into disagreeing about what a thing is.
 *
 * These are honest defaults, not legal advice: a real code depends on fibre content, which almost
 * no vintage listing records. They are picked to be defensible and in the right chapter, and the
 * seller can override per item.
 */
const HS_BY_CATEGORY: Record<string, string> = {
 // Chapter 62 — woven apparel (the safer default for vintage; knits are chapter 61)
 dresses: "6204.43",
 skirts: "6204.53",
 pants: "6204.63",
 jeans: "6204.62",
 shorts: "6204.63",
 jumpsuits: "6204.63",
 "coats-jackets": "6202.93",
 tops: "6206.40",
 sweaters: "6110.30",
 lingerie: "6208.92",
 swimwear: "6112.41",
 "other-clothing": "6204.43",

 // Chapter 64 — footwear
 boots: "6403.91",
 heels: "6403.99",
 shoes: "6403.99",
 flats: "6403.99",
 sandals: "6403.99",
 sneakers: "6404.11",

 // Chapter 42 — leather goods
 handbags: "4202.21",
 totes: "4202.21",
 clutches: "4202.21",
 "crossbody-bags": "4202.21",
 bags: "4202.21",
 belts: "4203.30",

 // Accessories
 scarves: "6214.10",
 hats: "6505.00",
 sunglasses: "9004.10",
 jewelry: "7117.90",
 accessories: "6217.10",
 home: "6304.92",
};

/** Titles that mean a different code than their category implies — a watch is filed under jewelry. */
const HS_TITLE_HINTS: { test: RegExp; code: string }[] = [
 { test: /\bwatch(es)?\b/i, code: "9102.11" },
 { test: /\bwallet\b|\bcard\s?holder\b|\bcoin\s?purse\b/i, code: "4202.31" },
 { test: /\bluggage\b|\bsuitcase\b|\bcarry[- ]?on\b|\btrunk\b/i, code: "4202.12" },
 { test: /\bsilk\b.*\bscarf\b|\bscarf\b.*\bsilk\b/i, code: "6214.10" },
 { test: /\bcashmere\b|\bwool\b.*\b(jumper|sweater|knit)\b/i, code: "6110.11" },
 { test: /\bleather\s+jacket\b/i, code: "4203.10" },
 { test: /\bfur\b(?!niture)/i, code: "4303.10" },
];

/**
 * A tariff code for a listing.
 *
 * The title only overrides where it names something the category genuinely can't express — never
 * to second-guess a category the seller chose deliberately.
 */
export function hsCodeFor(category: unknown, title?: unknown): string {
 const slug = String(category ?? "").trim().toLowerCase();
 const text = String(title ?? "");
 const mapped = HS_BY_CATEGORY[slug];
 const ambiguous = !mapped || slug === "jewelry" || slug === "bags" || slug === "accessories";
 if (ambiguous && text) {
  for (const h of HS_TITLE_HINTS) if (h.test.test(text)) return h.code;
 }
 if (mapped) {
  // Even a confident category yields to a watch or a wallet in the title.
  for (const h of HS_TITLE_HINTS) if (h.test.test(text)) return h.code;
  return mapped;
 }
 return "6204.43"; // a woven garment: the most common thing these stores post
}

/* ── export filing ─────────────────────────────────────────────────────── */

/**
 * The US export-filing exemption code.
 *
 * A US shipment worth more than $2,500 per commodity needs an AES filing and an ITN, which is a
 * thing a seller does themselves — we can't invent one. Below that, this exemption applies and is
 * what nearly every resale parcel uses. Returned null above the threshold so the caller can stop
 * and TELL the seller rather than file something untrue.
 */
export const AES_THRESHOLD_CENTS = 250_000;

export function eelPfc(valueCents: number, fromCountry: unknown): string | null {
 if (String(fromCountry ?? "").trim().toUpperCase() !== "US") return "NOEEI 30.37(a)";
 return (Number(valueCents) || 0) > AES_THRESHOLD_CENTS ? null : "NOEEI 30.37(a)";
}

/* ── restricted materials ──────────────────────────────────────────────── */

/**
 * Materials that can have a parcel seized, however old the piece is.
 *
 * CITES covers the exotic skins and furs that vintage designer resale is full of, and age is NOT a
 * defence — a 1970s crocodile Kelly needs paperwork exactly like a new one. Ivory is close to
 * absolutely banned in the US and UK. Getting this wrong doesn't cost a fee, it costs the item.
 *
 * Detection is by name, so it is a WARNING to show the seller, never an automatic block: "crocodile
 * embossed calfskin" is not crocodile, and only a person can tell.
 */
export const RESTRICTED_MATERIALS: { test: RegExp; material: string; note: string }[] = [
 { test: /\bcrocodile\b|\bcroc\b(?!\s*embossed)|\balligator\b/i, material: "Crocodile / alligator", note: "CITES-listed. Needs a permit to cross most borders, whatever its age." },
 { test: /\bpython\b|\bsnakeskin\b|\bwatersnake\b/i, material: "Python / snakeskin", note: "CITES-listed. Needs a permit, and is refused outright by some couriers." },
 { test: /\blizard\b(?!\s*embossed)/i, material: "Lizard", note: "CITES-listed. Needs a permit to cross most borders." },
 { test: /\bostrich\b/i, material: "Ostrich", note: "CITES-listed in some forms — check before shipping abroad." },
 { test: /\bstingray\b|\bshagreen\b/i, material: "Stingray / shagreen", note: "CITES-listed. Needs a permit." },
 { test: /\btortoise\s?shell\b/i, material: "Tortoiseshell", note: "Effectively banned from international trade." },
 { test: /\bivory\b/i, material: "Ivory", note: "Banned or near-banned in the US and UK regardless of age." },
 { test: /\bfur\b(?!niture)|\bmink\b|\bsable\b|\bchinchilla\b|\bfox\s+fur\b/i, material: "Fur", note: "Restricted or banned in some destinations, and refused by some couriers." },
];

export type RestrictionWarning = { material: string; note: string };

/** Materials worth warning about before this goes abroad. Empty when nothing matched. */
export function restrictedMaterials(text: unknown): RestrictionWarning[] {
 const s = String(text ?? "");
 if (!s) return [];
 const seen = new Set<string>();
 const out: RestrictionWarning[] = [];
 for (const r of RESTRICTED_MATERIALS) {
  if (r.test.test(s) && !seen.has(r.material)) {
   seen.add(r.material);
   out.push({ material: r.material, note: r.note });
  }
 }
 return out;
}

/* ── the declaration ───────────────────────────────────────────────────── */

export type CustomsLine = {
 description: string;
 quantity: number;
 valueCents: number;
 weightOz: number;
 hsCode: string;
 originCountry: string;
};

export type CustomsDeclaration = {
 lines: CustomsLine[];
 incoterm: "DDP" | "DDU";
 contentsType: "merchandise";
 /** null when the shipment needs an AES filing the seller has to make themselves. */
 eelPfc: string | null;
 certifySigner: string;
 /** Return it rather than abandon it: an abandoned parcel is a lost item AND a refund. */
 nonDeliveryOption: "return";
 totalValueCents: number;
};

/**
 * Build the declaration for one order.
 *
 * `originCountry` falls back to where it ships from, which is what a seller who doesn't know would
 * put — but the item's own origin is preferred wherever it's recorded, because that is the truthful
 * answer and the one that decides the duty rate.
 */
export function buildDeclaration(opts: {
 items: { title: string; category?: string | null; priceCents: number; hsCode?: string | null; originCountry?: string | null }[];
 fromCountry: string;
 dutyMode: DutyMode;
 signer: string;
 parcelWeightOz: number;
}): CustomsDeclaration {
 const items = opts.items.filter(Boolean);
 const from = String(opts.fromCountry || "").trim().toUpperCase();
 // Spread the parcel weight across the lines so the declared weights add up to what's on the label.
 const per = items.length > 0 ? Math.max(1, Math.round((Number(opts.parcelWeightOz) || items.length) / items.length)) : 0;

 const lines: CustomsLine[] = items.map((i) => ({
  description: String(i.title || "Second-hand clothing").slice(0, 120),
  quantity: 1,
  valueCents: Math.max(1, Math.round(Number(i.priceCents) || 0)),
  weightOz: per,
  hsCode: (i.hsCode && String(i.hsCode).trim()) || hsCodeFor(i.category, i.title),
  originCountry: (i.originCountry && String(i.originCountry).trim().toUpperCase()) || from,
 }));

 const totalValueCents = lines.reduce((n, l) => n + l.valueCents, 0);

 return {
  lines,
  incoterm: incotermFor(opts.dutyMode),
  contentsType: "merchandise",
  eelPfc: eelPfc(totalValueCents, from),
  certifySigner: String(opts.signer || "").slice(0, 80) || "Seller",
  nonDeliveryOption: "return",
  totalValueCents,
 };
}
